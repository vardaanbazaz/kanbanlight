// Records of the new data layer. Plain JSON-compatible data only, so any storage adapter can hold them
// and they can cross a process boundary unchanged.

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type BoardId = string;
export type BranchId = string;
export type CommitId = string;
export type CardId = string;

export const COLUMN_IDS = ['backlog', 'todo', 'in-progress', 'review', 'done'] as const;
export const PRIORITIES = ['low', 'medium', 'high'] as const;

export type ColumnId = (typeof COLUMN_IDS)[number];
export type Priority = (typeof PRIORITIES)[number];

export interface ColumnRecord {
  id: ColumnId;
  title: string;
  position: number;
}

// One board with five fixed columns for now; kept as data so a commit records the columns it had.
export const COLUMNS: readonly ColumnRecord[] = [
  { id: 'backlog', title: 'Backlog', position: 0 },
  { id: 'todo', title: 'To Do', position: 1 },
  { id: 'in-progress', title: 'In Progress', position: 2 },
  { id: 'review', title: 'Review', position: 3 },
  { id: 'done', title: 'Done', position: 4 },
];

export interface BoardRecord {
  id: BoardId;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface BranchRecord {
  id: BranchId;
  boardId: BoardId;
  name: string;
  createdAt: number;
  // The branch this one was created from; null for the board's first branch.
  createdFrom: BranchId | null;
}

// The board's current branch. Written in the same batch as the data it points at.
export interface HeadRecord {
  boardId: BoardId;
  branchId: BranchId;
}

// A card as the user sees it. An unassigned card has no `assignee` key.
export interface CardFields {
  id: CardId;
  title: string;
  description: string;
  priority: Priority;
  assignee?: string;
  tags: string[];
  columnId: ColumnId;
  position: number;
  createdAt: number;
  updatedAt: number;
}

// A card in a branch's working copy.
export interface CardRecord extends CardFields {
  boardId: BoardId;
  branchId: BranchId;
}

export const COMMIT_REASONS = [
  'board-created',
  'branch-created',
  'switch',
  'before-merge',
  'merge',
  'before-discard',
  'before-cherry-pick',
  'migration',
] as const;

export type CommitReason = (typeof COMMIT_REASONS)[number];

// A full board state. Immutable once written.
export interface CommitRecord {
  id: CommitId;
  boardId: BoardId;
  parents: CommitId[];
  createdAt: number;
  reason: CommitReason;
  state: { cards: CardFields[]; columns: ColumnRecord[] };
}

export interface WorkingCopy {
  boardId: BoardId;
  branchId: BranchId;
  baseCommitId: CommitId;
  dirty: boolean;
}

export const OP_COMMANDS = ['card.create', 'card.update', 'card.move', 'card.delete'] as const;

export type OpCommand = (typeof OP_COMMANDS)[number];

// One change since the branch's last commit, with the values before and after it (for undo).
export interface OpEntry {
  seq: number;
  command: OpCommand;
  before: CardFields | null;
  after: CardFields | null;
}
