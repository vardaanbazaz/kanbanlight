// The one interface between the data layer and wherever boards are kept. Every adapter (memory,
// IndexedDB, later files) meets the same contract; see the per-method notes below.

import type {
  BoardId,
  BoardRecord,
  BranchId,
  BranchRecord,
  CardRecord,
  CommitId,
  CommitRecord,
  HeadRecord,
  JsonValue,
  OpEntry,
  WorkingCopy,
} from '../domain/types';

export interface BoardSnapshot {
  board: BoardRecord;
  branches: BranchRecord[];
  head: HeadRecord;
}

export interface WorkingCopyState {
  copy: WorkingCopy;
  cards: CardRecord[];
  ops: OpEntry[]; // ascending seq
}

export type Change =
  | { kind: 'putBoard'; board: BoardRecord }
  | { kind: 'putBranch'; branch: BranchRecord }
  | { kind: 'deleteBranch'; boardId: BoardId; branchId: BranchId }
  | { kind: 'setHead'; head: HeadRecord }
  | { kind: 'putCommit'; commit: CommitRecord }
  | { kind: 'deleteCommits'; boardId: BoardId; ids: CommitId[] }
  | { kind: 'putCard'; card: CardRecord }
  | { kind: 'deleteCard'; boardId: BoardId; branchId: BranchId; cardId: string }
  | { kind: 'setWorkingCopy'; copy: WorkingCopy }
  | { kind: 'appendOp'; boardId: BoardId; branchId: BranchId; entry: OpEntry }
  | { kind: 'trimOps'; boardId: BoardId; branchId: BranchId; keepFromSeq: number }
  | { kind: 'clearOps'; boardId: BoardId; branchId: BranchId }
  | { kind: 'setMeta'; key: string; value: JsonValue };

export type Batch = readonly Change[];

export const STORAGE_ERROR_CODES = ['write-failed', 'commit-conflict', 'unavailable', 'read-failed'] as const;
export type StorageErrorCode = (typeof STORAGE_ERROR_CODES)[number];

// Plain data, so it survives a process boundary: callers check `error.code`, never `instanceof`.
// `reason` names the problem, never stored content.
export interface StorageError {
  code: StorageErrorCode;
  reason?: string;
}

export const storageError = (code: StorageErrorCode, reason?: string): StorageError =>
  reason === undefined ? { code } : { code, reason };

export const isStorageError = (value: unknown): value is StorageError =>
  typeof value === 'object' &&
  value !== null &&
  (STORAGE_ERROR_CODES as readonly unknown[]).includes((value as { code?: unknown }).code);

export const SCHEMA_VERSION = 1;

export interface StorageAdapter {
  // Idempotent. A store that does not exist gets only the adapter's own structure and the
  // `schemaVersion` meta; `empty` means no board exists yet. Every other method rejects
  // `unavailable` until `open` resolves, and after `close`.
  open(): Promise<{ status: 'empty' | 'ready' }>;
  close(): Promise<void>;
  // null when the key was never set.
  readMeta(key: string): Promise<JsonValue | null>;
  listBoards(): Promise<BoardRecord[]>;
  // null for an unknown board; otherwise board, branches and head read at one point in time.
  readBoard(boardId: BoardId): Promise<BoardSnapshot | null>;
  // null when the branch has no working copy.
  readWorkingCopy(boardId: BoardId, branchId: BranchId): Promise<WorkingCopyState | null>;
  // Existing commits of this board in the requested order; missing ids are left out.
  readCommits(boardId: BoardId, ids: CommitId[]): Promise<CommitRecord[]>;
  listCommitIds(boardId: BoardId): Promise<CommitId[]>;
  // All or nothing: on rejection no change of the batch is visible, here or to a fresh adapter.
  apply(batch: Batch): Promise<void>;
  // Unchecked, possibly partial: for the recovery download.
  dumpRaw(): Promise<unknown>;
}
