import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Board, Card, Event, User } from '../types';

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
      data: Board;
      timestamp: number;
      description: string;
    };
    indexes: { 'by-board': string };
  };
}

class DatabaseService {
  private db: IDBPDatabase<KanbanDB> | null = null;

  async initialize(): Promise<void> {
    this.db = await openDB<KanbanDB>('kanban-light', 1, {
      upgrade(db) {
        // Boards store
        const boardStore = db.createObjectStore('boards', { keyPath: 'id' });
        boardStore.createIndex('by-updated', 'updatedAt');

        // Cards store
        const cardStore = db.createObjectStore('cards', { keyPath: 'id' });
        cardStore.createIndex('by-board', 'boardId');
        cardStore.createIndex('by-column', 'columnId');

        // Events store (for event sourcing)
        const eventStore = db.createObjectStore('events', { keyPath: 'id' });
        eventStore.createIndex('by-board', 'boardId');
        eventStore.createIndex('by-timestamp', 'timestamp');

        // Users store
        db.createObjectStore('users', { keyPath: 'id' });

        // Snapshots store
        const snapshotStore = db.createObjectStore('snapshots', { keyPath: 'id' });
        snapshotStore.createIndex('by-board', 'boardId');
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
    return await this.db.getAllFromIndex('cards', 'by-board', boardId);
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
    return await this.db.getAllFromIndex('events', 'by-board', boardId);
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
  async createSnapshot(boardId: string, data: Board, description: string): Promise<string> {
    if (!this.db) throw new Error('Database not initialized');
    const snapshot = {
      id: `snapshot-${Date.now()}`,
      boardId,
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

  // Utility methods
  async clearAll(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const tx = this.db.transaction(['boards', 'cards', 'events', 'users', 'snapshots'], 'readwrite');
    await Promise.all([
      tx.objectStore('boards').clear(),
      tx.objectStore('cards').clear(),
      tx.objectStore('events').clear(),
      tx.objectStore('users').clear(),
      tx.objectStore('snapshots').clear()
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