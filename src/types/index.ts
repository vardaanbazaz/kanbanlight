export interface Card {
  id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  assignee: string;
  tags: string[];
  columnId: string;
  position: number;
  createdAt: number;
  updatedAt: number;
  boardId?: string;
}

export interface Column {
  id: string;
  title: string;
  color: string;
  position: number;
  cards: Card[];
}

export interface Board {
  id: string;
  title: string;
  columns: Column[];
  createdAt: number;
  updatedAt: number;
}

export interface User {
  id: string;
  name: string;
  cursor: { x: number; y: number };
  color: string;
  selection?: string;
}

export interface Event {
  id: string;
  type: string;
  payload: any;
  timestamp: number;
  userId: string;
  boardId: string;
}

export interface BranchDiff {
  addedCards: Card[];
  deletedCards: Card[];
  modifiedCards: Card[];
}