import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';

export interface Board {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  parentBranch?: string;
}

export interface Card {
  id: string;
  boardId: string;
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high';
  assignee?: string;
  column: string;
  position: number;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface BoardEvent {
  id: string;
  boardId: string;
  type: string;
  payload: any;
  userId: string;
  timestamp: Date;
  commitHash?: string;
}

export class BoardService {
  private db: sqlite3.Database;
  private dbPath: string;

  constructor(projectPath: string = process.cwd()) {
    this.dbPath = path.join(projectPath, '.kanban', 'boards.db');
    this.db = new sqlite3.Database(this.dbPath);
    this.initializeDatabase();
  }

  private async initializeDatabase(): Promise<void> {
    const run = promisify(this.db.run.bind(this.db));
    
    // Ensure .kanban directory exists
    await fs.mkdir(path.dirname(this.dbPath), { recursive: true });

    // Create tables
    await run(`
      CREATE TABLE IF NOT EXISTS boards (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT FALSE,
        parent_branch TEXT
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS cards (
        id TEXT PRIMARY KEY,
        board_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        priority TEXT DEFAULT 'medium',
        assignee TEXT,
        column_name TEXT DEFAULT 'backlog',
        position INTEGER DEFAULT 0,
        tags TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (board_id) REFERENCES boards (id)
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS board_events (
        id TEXT PRIMARY KEY,
        board_id TEXT NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        user_id TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        commit_hash TEXT,
        FOREIGN KEY (board_id) REFERENCES boards (id)
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
  }

  async createBoard(name: string, description?: string, parentBranch?: string): Promise<Board> {
    const run = promisify(this.db.run.bind(this.db));
    const get = promisify(this.db.get.bind(this.db));

    const board: Board = {
      id: uuidv4(),
      name,
      description,
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: false,
      parentBranch
    };

    await run(`
      INSERT INTO boards (id, name, description, parent_branch)
      VALUES (?, ?, ?, ?)
    `, [board.id, board.name, board.description, board.parentBranch]);

    // Create default columns
    const defaultColumns = ['backlog', 'todo', 'in-progress', 'review', 'done'];
    for (const column of defaultColumns) {
      await this.logEvent(board.id, 'COLUMN_CREATED', { name: column }, 'system');
    }

    return board;
  }

  async getBoards(): Promise<Board[]> {
    const all = promisify(this.db.all.bind(this.db));
    const rows = await all('SELECT * FROM boards ORDER BY updated_at DESC') as any[];
    
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      isActive: Boolean(row.is_active),
      parentBranch: row.parent_branch
    }));
  }

  async getActiveBoard(): Promise<Board | null> {
    const get = promisify(this.db.get.bind(this.db));
    const row = await get('SELECT * FROM boards WHERE is_active = TRUE LIMIT 1') as any;
    
    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      isActive: Boolean(row.is_active),
      parentBranch: row.parent_branch
    };
  }

  async switchBoard(boardId: string): Promise<void> {
    const run = promisify(this.db.run.bind(this.db));
    
    // Deactivate all boards
    await run('UPDATE boards SET is_active = FALSE');
    
    // Activate target board
    await run('UPDATE boards SET is_active = TRUE WHERE id = ?', [boardId]);
  }

  async createCard(card: Omit<Card, 'id' | 'createdAt' | 'updatedAt'>): Promise<Card> {
    const run = promisify(this.db.run.bind(this.db));
    
    const newCard: Card = {
      ...card,
      id: uuidv4(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await run(`
      INSERT INTO cards (id, board_id, title, description, priority, assignee, column_name, position, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      newCard.id,
      newCard.boardId,
      newCard.title,
      newCard.description,
      newCard.priority,
      newCard.assignee,
      newCard.column,
      newCard.position,
      JSON.stringify(newCard.tags)
    ]);

    await this.logEvent(card.boardId, 'CARD_CREATED', newCard, 'cli-user');

    return newCard;
  }

  async getCards(boardId: string, filters?: {
    column?: string;
    assignee?: string;
    priority?: string;
  }): Promise<Card[]> {
    const all = promisify(this.db.all.bind(this.db));
    
    let query = 'SELECT * FROM cards WHERE board_id = ?';
    const params: any[] = [boardId];

    if (filters?.column) {
      query += ' AND column_name = ?';
      params.push(filters.column);
    }

    if (filters?.assignee) {
      query += ' AND assignee = ?';
      params.push(filters.assignee);
    }

    if (filters?.priority) {
      query += ' AND priority = ?';
      params.push(filters.priority);
    }

    query += ' ORDER BY column_name, position';

    const rows = await all(query, params) as any[];
    
    return rows.map(row => ({
      id: row.id,
      boardId: row.board_id,
      title: row.title,
      description: row.description,
      priority: row.priority,
      assignee: row.assignee,
      column: row.column_name,
      position: row.position,
      tags: JSON.parse(row.tags || '[]'),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }));
  }

  async moveCard(cardId: string, newColumn: string): Promise<void> {
    const run = promisify(this.db.run.bind(this.db));
    const get = promisify(this.db.get.bind(this.db));
    
    const card = await get('SELECT * FROM cards WHERE id = ?', [cardId]) as any;
    if (!card) throw new Error(`Card ${cardId} not found`);

    await run(`
      UPDATE cards 
      SET column_name = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `, [newColumn, cardId]);

    await this.logEvent(card.board_id, 'CARD_MOVED', {
      cardId,
      fromColumn: card.column_name,
      toColumn: newColumn
    }, 'cli-user');
  }

  async logEvent(boardId: string, type: string, payload: any, userId: string, commitHash?: string): Promise<void> {
    const run = promisify(this.db.run.bind(this.db));
    
    await run(`
      INSERT INTO board_events (id, board_id, type, payload, user_id, commit_hash)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [uuidv4(), boardId, type, JSON.stringify(payload), userId, commitHash]);
  }

  async getEvents(boardId: string, limit: number = 50): Promise<BoardEvent[]> {
    const all = promisify(this.db.all.bind(this.db));
    
    const rows = await all(`
      SELECT * FROM board_events 
      WHERE board_id = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `, [boardId, limit]) as any[];

    return rows.map(row => ({
      id: row.id,
      boardId: row.board_id,
      type: row.type,
      payload: JSON.parse(row.payload),
      userId: row.user_id,
      timestamp: new Date(row.timestamp),
      commitHash: row.commit_hash
    }));
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}