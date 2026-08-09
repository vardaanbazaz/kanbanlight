import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Board, Card, Event, User } from '../types';

export interface StoredPlugin {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  wasmBytes?: ArrayBuffer | Uint8Array;
  hooks: {
    onCardCreate?: string;
    onCardMove?: string;
    onBoardLoad?: string;
  };
}

interface KanbanDB extends DBSchema {
  boards: {
    key: string;
    value: Board;
    indexes: { 'by-updated': number };
  };
  cards: {
    key: string;
    value: Card;
    indexes: { 'by-board': string; 'by-column': string };
  };
  events: {
    key: string;
    value: Event;
    indexes: { 'by-board': string; 'by-timestamp': number };
  };
  users: {
    key: string;
    value: User;
  };
  snapshots: {
    key: string;
    value: {
      id: string;
      boardId: string;
      branchId?: string;
      data: any;
      timestamp: number;
      description: string;
    };
    indexes: { 'by-board': string };
  };
  plugins: {
    key: string;
    value: StoredPlugin;
  };
}

class DatabaseService {
  private db: IDBPDatabase<KanbanDB> | null = null;

  async initialize(): Promise<void> {
    this.db = await openDB<KanbanDB>('kanban-light', 2, {
      upgrade(db) {
        // Boards store
        if (!db.objectStoreNames.contains('boards')) {
          const boardStore = db.createObjectStore('boards', { keyPath: 'id' });
          boardStore.createIndex('by-updated', 'updatedAt');
        }

        // Cards store
        if (!db.objectStoreNames.contains('cards')) {
          const cardStore = db.createObjectStore('cards', { keyPath: 'id' });
          cardStore.createIndex('by-board', 'boardId');
          cardStore.createIndex('by-column', 'columnId');
        }

        // Events store (for event sourcing)
        if (!db.objectStoreNames.contains('events')) {
          const eventStore = db.createObjectStore('events', { keyPath: 'id' });
          eventStore.createIndex('by-board', 'boardId');
          eventStore.createIndex('by-timestamp', 'timestamp');
        }

        // Users store
        if (!db.objectStoreNames.contains('users')) {
          db.createObjectStore('users', { keyPath: 'id' });
        }

        // Snapshots store
        if (!db.objectStoreNames.contains('snapshots')) {
          const snapshotStore = db.createObjectStore('snapshots', { keyPath: 'id' });
          snapshotStore.createIndex('by-board', 'boardId');
        }

        // Plugins store
        if (!db.objectStoreNames.contains('plugins')) {
          db.createObjectStore('plugins', { keyPath: 'id' });
        }
      },
    });
  }

  // Board operations
  async saveBoard(board: Board): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.put('boards', board);
  }

  async getBoard(id: string): Promise<Board | undefined> {
    if (!this.db) throw new Error('Database not initialized');
    return await this.db.get('boards', id);
  }

  async getAllBoards(): Promise<Board[]> {
    if (!this.db) throw new Error('Database not initialized');
    return await this.db.getAll('boards');
  }

  async deleteBoard(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const tx = this.db.transaction(['boards', 'cards', 'events', 'snapshots'], 'readwrite');
    
    await Promise.all([
      tx.objectStore('boards').delete(id),
      this.deleteCardsByBoard(id),
      this.deleteEventsByBoard(id),
      this.deleteSnapshotsByBoard(id)
    ]);
  }

  // Card operations
  async saveCard(card: Card): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.put('cards', card);
  }

  async getCardsByBoard(boardId: string): Promise<Card[]> {
    if (!this.db) throw new Error('Database not initialized');
    const cards = await this.db.getAll('cards');
    return cards.filter((c: any) => !c.boardId || c.boardId === boardId);
  }

  async getCardsByColumn(columnId: string): Promise<Card[]> {
    if (!this.db) throw new Error('Database not initialized');
    return await this.db.getAllFromIndex('cards', 'by-column', columnId);
  }

  async deleteCard(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.delete('cards', id);
  }

  private async deleteCardsByBoard(boardId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const cards = await this.getCardsByBoard(boardId);
    const tx = this.db.transaction('cards', 'readwrite');
    await Promise.all(cards.map(card => tx.store.delete(card.id)));
  }

  // Event operations (for event sourcing)
  async saveEvent(event: Event): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.put('events', event);
  }

  async getEventsByBoard(boardId: string): Promise<Event[]> {
    if (!this.db) throw new Error('Database not initialized');
    const events = await this.db.getAll('events');
    return events.filter((e: any) => !e.boardId || e.boardId === boardId);
  }

  async getEventsAfterTimestamp(boardId: string, timestamp: number): Promise<Event[]> {
    if (!this.db) throw new Error('Database not initialized');
    const allEvents = await this.getEventsByBoard(boardId);
    return allEvents.filter(event => event.timestamp > timestamp);
  }

  private async deleteEventsByBoard(boardId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const events = await this.getEventsByBoard(boardId);
    const tx = this.db.transaction('events', 'readwrite');
    await Promise.all(events.map(event => tx.store.delete(event.id)));
  }

  // Snapshot operations
  async createSnapshot(boardId: string, data: any, description: string = '', branchId: string = 'main'): Promise<string> {
    if (!this.db) throw new Error('Database not initialized');
    const snapshot = {
      id: `snapshot-${branchId}-${Date.now()}`,
      boardId,
      branchId,
      data,
      timestamp: Date.now(),
      description
    };
    await this.db.put('snapshots', snapshot);
    return snapshot.id;
  }

  async getSnapshotsByBoard(boardId: string) {
    if (!this.db) throw new Error('Database not initialized');
    return await this.db.getAllFromIndex('snapshots', 'by-board', boardId);
  }

  async getSnapshotsByBranch(branchId: string) {
    if (!this.db) throw new Error('Database not initialized');
    const all = await this.db.getAll('snapshots');
    return all
      .filter((s: any) => s.branchId === branchId || (!s.branchId && branchId === 'main'))
      .sort((a: any, b: any) => b.timestamp - a.timestamp);
  }

  async getLatestSnapshotByBranch(branchId: string) {
    const snapshots = await this.getSnapshotsByBranch(branchId);
    return snapshots.length > 0 ? snapshots[0] : undefined;
  }

  async syncActiveBoardCardsAndEvents(boardId: string, cards: Card[], events: Event[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const existingCards = await this.db.getAll('cards');
    const existingEvents = await this.db.getAll('events');

    const tx = this.db.transaction(['cards', 'events'], 'readwrite');
    await Promise.all([
      ...existingCards.map(card => tx.objectStore('cards').delete(card.id)),
      ...existingEvents.map(event => tx.objectStore('events').delete(event.id))
    ]);

    await Promise.all([
      ...cards.map(card => tx.objectStore('cards').put({ ...card, boardId })),
      ...events.map(event => tx.objectStore('events').put({ ...event, boardId }))
    ]);
  }

  private async deleteSnapshotsByBoard(boardId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const snapshots = await this.getSnapshotsByBoard(boardId);
    const tx = this.db.transaction('snapshots', 'readwrite');
    await Promise.all(snapshots.map(snapshot => tx.store.delete(snapshot.id)));
  }

  // User operations
  async saveUser(user: User): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.put('users', user);
  }

  async getUser(id: string): Promise<User | undefined> {
    if (!this.db) throw new Error('Database not initialized');
    return await this.db.get('users', id);
  }

  async getAllUsers(): Promise<User[]> {
    if (!this.db) throw new Error('Database not initialized');
    return await this.db.getAll('users');
  }

  // Plugin operations
  async savePlugin(plugin: StoredPlugin): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.put('plugins', plugin);
  }

  async getPlugin(id: string): Promise<StoredPlugin | undefined> {
    if (!this.db) throw new Error('Database not initialized');
    return await this.db.get('plugins', id);
  }

  async getAllPlugins(): Promise<StoredPlugin[]> {
    if (!this.db) throw new Error('Database not initialized');
    return await this.db.getAll('plugins');
  }

  async deletePlugin(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.delete('plugins', id);
  }

  // Utility methods
  async clearAll(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const tx = this.db.transaction(['boards', 'cards', 'events', 'users', 'snapshots', 'plugins'], 'readwrite');
    await Promise.all([
      tx.objectStore('boards').clear(),
      tx.objectStore('cards').clear(),
      tx.objectStore('events').clear(),
      tx.objectStore('users').clear(),
      tx.objectStore('snapshots').clear(),
      tx.objectStore('plugins').clear()
    ]);
  }

  async exportData(): Promise<{
    boards: Board[];
    cards: Card[];
    events: Event[];
    users: User[];
  }> {
    if (!this.db) throw new Error('Database not initialized');
    
    return {
      boards: await this.getAllBoards(),
      cards: await this.db.getAll('cards'),
      events: await this.db.getAll('events'),
      users: await this.getAllUsers()
    };
  }

  async importData(data: {
    boards: Board[];
    cards: Card[];
    events: Event[];
    users: User[];
  }): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    const tx = this.db.transaction(['boards', 'cards', 'events', 'users'], 'readwrite');
    
    await Promise.all([
      ...data.boards.map(board => tx.objectStore('boards').put(board)),
      ...data.cards.map(card => tx.objectStore('cards').put(card)),
      ...data.events.map(event => tx.objectStore('events').put(event)),
      ...data.users.map(user => tx.objectStore('users').put(user))
    ]);
  }
}

export const databaseService = new DatabaseService();