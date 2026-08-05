import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';
import { v4 as uuidv4 } from 'uuid';
import { Card, User, Board } from '../types';

export class CollaborationService {
  private ydoc: Y.Doc;
  private wsProvider: WebsocketProvider | null = null;
  private indexeddbProvider: IndexeddbPersistence;
  private awareness: any;
  private currentUser: User;
  private callbacks: Map<string, Function[]> = new Map();

  constructor(boardId: string, user: User) {
    this.currentUser = user;
    this.ydoc = new Y.Doc();
    
    // Initialize IndexedDB persistence
    this.indexeddbProvider = new IndexeddbPersistence(boardId, this.ydoc);
    
    // Create mock awareness for offline mode (no WebSocket server available)
    console.info('Running in offline mode - WebSocket server not available');
    this.awareness = {
      setLocalState: () => {},
      on: () => {},
      off: () => {},
      getStates: () => new Map()
    };

    this.setupAwareness();
    this.setupEventListeners();
  }

  private setupAwareness(): void {
    // Set local user state
    this.awareness.setLocalState({
      user: this.currentUser,
      cursor: this.currentUser.cursor
    });

    // Listen for awareness changes
    this.awareness.on('change', () => {
      const users = Array.from(this.awareness.getStates().values())
        .map((state: any) => state.user)
        .filter((user: User) => user && user.id !== this.currentUser.id);
      
      this.emit('users-changed', users);
    });
  }

  private setupEventListeners(): void {
    // Listen for document changes
    this.ydoc.on('update', (update: Uint8Array, origin: any) => {
      if (origin !== this) {
        this.emit('remote-update', update);
      }
    });

    // Emit offline status since no WebSocket server is available
    setTimeout(() => {
      this.emit('connection-status', 'offline');
    }, 100);
  }

  // Board operations
  getBoard(): Board | null {
    const boardMap = this.ydoc.getMap('board');
    if (boardMap.size === 0) return null;

    return {
      id: boardMap.get('id') || '',
      title: boardMap.get('title') || '',
      columns: this.getColumns(),
      createdAt: boardMap.get('createdAt') || Date.now(),
      updatedAt: boardMap.get('updatedAt') || Date.now()
    };
  }

  updateBoard(board: Partial<Board>): void {
    const boardMap = this.ydoc.getMap('board');
    
    this.ydoc.transact(() => {
      Object.entries(board).forEach(([key, value]) => {
        if (key !== 'columns') {
          boardMap.set(key, value);
        }
      });
      boardMap.set('updatedAt', Date.now());
    }, this);
  }

  // Column operations
  getColumns(): any[] {
    const columnsArray = this.ydoc.getArray('columns');
    return columnsArray.toArray().map((columnMap: Y.Map<any>) => ({
      id: columnMap.get('id'),
      title: columnMap.get('title'),
      color: columnMap.get('color'),
      position: columnMap.get('position'),
      cards: this.getCardsByColumn(columnMap.get('id'))
    }));
  }

  addColumn(column: any): void {
    const columnsArray = this.ydoc.getArray('columns');
    const columnMap = new Y.Map();
    
    this.ydoc.transact(() => {
      Object.entries(column).forEach(([key, value]) => {
        columnMap.set(key, value);
      });
      columnsArray.push([columnMap]);
    }, this);
  }

  updateColumn(columnId: string, updates: any): void {
    const columnsArray = this.ydoc.getArray('columns');
    
    this.ydoc.transact(() => {
      for (let i = 0; i < columnsArray.length; i++) {
        const columnMap = columnsArray.get(i) as Y.Map<any>;
        if (columnMap.get('id') === columnId) {
          Object.entries(updates).forEach(([key, value]) => {
            columnMap.set(key, value);
          });
          break;
        }
      }
    }, this);
  }

  // Card operations
  getCards(): Card[] {
    const cardsArray = this.ydoc.getArray('cards');
    return cardsArray.toArray().map((cardMap: Y.Map<any>) => ({
      id: cardMap.get('id'),
      title: cardMap.get('title'),
      description: cardMap.get('description'),
      priority: cardMap.get('priority'),
      assignee: cardMap.get('assignee'),
      tags: cardMap.get('tags') || [],
      columnId: cardMap.get('columnId'),
      position: cardMap.get('position'),
      createdAt: cardMap.get('createdAt'),
      updatedAt: cardMap.get('updatedAt'),
      conflicts: cardMap.get('conflicts') || []
    }));
  }

  getCardsByColumn(columnId: string): Card[] {
    return this.getCards()
      .filter(card => card.columnId === columnId)
      .sort((a, b) => a.position - b.position);
  }

  addCard(card: Card): void {
    const cardsArray = this.ydoc.getArray('cards');
    const cardMap = new Y.Map();
    
    this.ydoc.transact(() => {
      Object.entries(card).forEach(([key, value]) => {
        cardMap.set(key, value);
      });
      cardsArray.push([cardMap]);
    }, this);

    this.emit('card-added', card);
  }

  updateCard(cardId: string, updates: Partial<Card>): void {
    const cardsArray = this.ydoc.getArray('cards');
    
    this.ydoc.transact(() => {
      for (let i = 0; i < cardsArray.length; i++) {
        const cardMap = cardsArray.get(i) as Y.Map<any>;
        if (cardMap.get('id') === cardId) {
          Object.entries(updates).forEach(([key, value]) => {
            cardMap.set(key, value);
          });
          cardMap.set('updatedAt', Date.now());
          break;
        }
      }
    }, this);

    this.emit('card-updated', { cardId, updates });
  }

  moveCard(cardId: string, newColumnId: string, newPosition: number): void {
    this.updateCard(cardId, {
      columnId: newColumnId,
      position: newPosition
    });

    this.emit('card-moved', { cardId, newColumnId, newPosition });
  }

  deleteCard(cardId: string): void {
    const cardsArray = this.ydoc.getArray('cards');
    
    this.ydoc.transact(() => {
      for (let i = 0; i < cardsArray.length; i++) {
        const cardMap = cardsArray.get(i) as Y.Map<any>;
        if (cardMap.get('id') === cardId) {
          cardsArray.delete(i, 1);
          break;
        }
      }
    }, this);

    this.emit('card-deleted', cardId);
  }

  // Cursor and presence
  updateCursor(x: number, y: number): void {
    this.currentUser.cursor = { x, y };
    this.awareness.setLocalState({
      user: this.currentUser,
      cursor: { x, y }
    });
  }

  setSelection(elementId: string | null): void {
    this.currentUser.selection = elementId || undefined;
    this.awareness.setLocalState({
      user: this.currentUser,
      cursor: this.currentUser.cursor,
      selection: elementId
    });
  }

  // Conflict resolution
  detectConflicts(): any[] {
    // This would implement semantic conflict detection
    // For now, return empty array
    return [];
  }

  resolveConflict(conflictId: string, resolution: 'local' | 'remote' | 'merge'): void {
    // Implement conflict resolution logic
    this.emit('conflict-resolved', { conflictId, resolution });
  }

  // Event system
  on(event: string, callback: Function): void {
    if (!this.callbacks.has(event)) {
      this.callbacks.set(event, []);
    }
    this.callbacks.get(event)!.push(callback);
  }

  off(event: string, callback: Function): void {
    const callbacks = this.callbacks.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private emit(event: string, data?: any): void {
    const callbacks = this.callbacks.get(event);
    if (callbacks) {
      callbacks.forEach(callback => callback(data));
    }
  }

  // Cleanup
  destroy(): void {
    if (this.wsProvider) {
      this.wsProvider.destroy();
    }
    this.indexeddbProvider.destroy();
    this.ydoc.destroy();
  }

  // Utility methods
  isOnline(): boolean {
    return false; // Always offline since no WebSocket server
  }

  getConnectionStatus(): string {
    return 'offline'; // Always offline since no WebSocket server
  }

  exportState(): Uint8Array {
    return Y.encodeStateAsUpdate(this.ydoc);
  }

  importState(state: Uint8Array): void {
    Y.applyUpdate(this.ydoc, state);
  }
}