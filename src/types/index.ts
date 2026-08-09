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
  conflicts: Conflict[];
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

export interface Conflict {
  id: string;
  type: 'card_move' | 'card_edit' | 'column_change';
  description: string;
  localChange: any;
  remoteChange: any;
  timestamp: number;
  userId: string;
}

export interface Event {
  id: string;
  type: string;
  payload: any;
  timestamp: number;
  userId: string;
  boardId: string;
}

export interface Plugin {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  wasmModule?: WebAssembly.Module;
  wasmBytes?: ArrayBuffer | Uint8Array;
  hooks: {
    onCardCreate?: string;
    onCardMove?: string;
    onBoardLoad?: string;
  };
}