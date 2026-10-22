// The reference adapter: everything in one plain object. Used for fast tests and to keep the
// storage interface honest. Every value is copied in and out, so shared references show up as bugs.

import type { BoardRecord, BranchRecord, CardRecord, CommitRecord, HeadRecord, JsonValue, OpEntry, WorkingCopy } from '../domain/types';
import { canonicalJson } from './json';
import { SCHEMA_VERSION, storageError, type Change, type StorageAdapter } from './types';

interface MemoryData {
  meta: Record<string, JsonValue>;
  boards: Record<string, BoardRecord>;
  branches: Record<string, BranchRecord>;
  heads: Record<string, HeadRecord>;
  commits: Record<string, CommitRecord>;
  cards: Record<string, CardRecord>;
  working: Record<string, WorkingCopy>;
  ops: Record<string, { boardId: string; branchId: string; entry: OpEntry }>;
}

// The backing store several adapters can share; `data` is null until the first open.
export interface MemoryBacking {
  data: MemoryData | null;
}

export const createMemoryBacking = (): MemoryBacking => ({ data: null });

const key = (...parts: unknown[]) => {
  if (!parts.every((part) => typeof part === 'string' || typeof part === 'number')) {
    throw storageError('write-failed', 'a record is missing a key');
  }
  return JSON.stringify(parts);
};

// True when `recordKey` belongs to the given board and branch.
const inBranch = (recordKey: string, boardId: string, branchId: string) => {
  const [board, branch] = JSON.parse(recordKey) as unknown[];
  return board === boardId && branch === branchId;
};

const without = <T>(table: Record<string, T>, drop: (recordKey: string) => boolean) => {
  for (const recordKey of Object.keys(table)) if (drop(recordKey)) delete table[recordKey];
};

function applyChange(data: MemoryData, change: Change) {
  switch (change.kind) {
    case 'putBoard':
      data.boards[key(change.board.id)] = change.board;
      break;
    case 'putBranch':
      data.branches[key(change.branch.boardId, change.branch.id)] = change.branch;
      break;
    case 'deleteBranch': {
      const { boardId, branchId } = change;
      delete data.branches[key(boardId, branchId)];
      delete data.working[key(boardId, branchId)];
      without(data.cards, (recordKey) => inBranch(recordKey, boardId, branchId));
      without(data.ops, (recordKey) => inBranch(recordKey, boardId, branchId));
      break;
    }
    case 'setHead':
      data.heads[key(change.head.boardId)] = change.head;
      break;
    case 'putCommit': {
      const commitKey = key(change.commit.id);
      const existing = data.commits[commitKey];
      if (existing && canonicalJson(existing) !== canonicalJson(change.commit)) throw storageError('commit-conflict');
      data.commits[commitKey] = change.commit;
      break;
    }
    case 'deleteCommits':
      for (const id of change.ids) {
        if (data.commits[key(id)]?.boardId === change.boardId) delete data.commits[key(id)];
      }
      break;
    case 'putCard':
      data.cards[key(change.card.boardId, change.card.branchId, change.card.id)] = change.card;
      break;
    case 'deleteCard':
      delete data.cards[key(change.boardId, change.branchId, change.cardId)];
      break;
    case 'setWorkingCopy':
      data.working[key(change.copy.boardId, change.copy.branchId)] = change.copy;
      break;
    case 'appendOp': {
      const opKey = key(change.boardId, change.branchId, change.entry.seq);
      if (opKey in data.ops) throw storageError('write-failed', 'an op with this sequence number exists');
      data.ops[opKey] = { boardId: change.boardId, branchId: change.branchId, entry: change.entry };
      break;
    }
    case 'trimOps':
      without(data.ops, (recordKey) => {
        const op = data.ops[recordKey];
        return op.boardId === change.boardId && op.branchId === change.branchId && op.entry.seq < change.keepFromSeq;
      });
      break;
    case 'clearOps':
      without(data.ops, (recordKey) => inBranch(recordKey, change.boardId, change.branchId));
      break;
    case 'setMeta':
      data.meta[key(change.key)] = change.value;
      break;
    default:
      throw storageError('write-failed', 'unknown change');
  }
}

export function memoryStorage(backing: MemoryBacking): StorageAdapter {
  let state: 'new' | 'open' | 'closed' = 'new';

  const data = (): MemoryData => {
    if (state !== 'open' || !backing.data) throw storageError('unavailable');
    return backing.data;
  };
  const read = async <T>(get: (data: MemoryData) => T): Promise<T> => structuredClone(get(data()));

  return {
    async open() {
      if (state === 'closed') throw storageError('unavailable');
      backing.data ??= {
        meta: { [key('schemaVersion')]: SCHEMA_VERSION },
        boards: {},
        branches: {},
        heads: {},
        commits: {},
        cards: {},
        working: {},
        ops: {},
      };
      state = 'open';
      return { status: Object.keys(backing.data.boards).length === 0 ? 'empty' : 'ready' };
    },
    async close() {
      state = 'closed';
    },
    readMeta: (metaKey) => read((data) => data.meta[key(metaKey)] ?? null),
    listBoards: () => read((data) => Object.values(data.boards)),
    readBoard: (boardId) =>
      read((data) => {
        const board = data.boards[key(boardId)];
        if (!board) return null;
        const head = data.heads[key(boardId)];
        if (!head) throw storageError('read-failed', 'board has no head');
        return { board, branches: Object.values(data.branches).filter((branch) => branch.boardId === boardId), head };
      }),
    readWorkingCopy: (boardId, branchId) =>
      read((data) => {
        const copy = data.working[key(boardId, branchId)];
        if (!copy) return null;
        const cards = Object.values(data.cards).filter((card) => card.boardId === boardId && card.branchId === branchId);
        const ops = Object.values(data.ops)
          .filter((op) => op.boardId === boardId && op.branchId === branchId)
          .map((op) => op.entry)
          .sort((a, b) => a.seq - b.seq);
        return { copy, cards, ops };
      }),
    readCommits: (boardId, ids) =>
      read((data) =>
        ids.map((id) => data.commits[key(id)]).filter((commit) => commit !== undefined && commit.boardId === boardId)
      ),
    listCommitIds: (boardId) =>
      read((data) => Object.values(data.commits).filter((commit) => commit.boardId === boardId).map((commit) => commit.id)),
    async apply(batch) {
      // Changes go to a copy that replaces the stored data only when every change succeeded.
      const next = structuredClone(data());
      try {
        for (const change of structuredClone(batch)) applyChange(next, change);
      } catch (error) {
        throw typeof error === 'object' && error !== null && 'code' in error ? error : storageError('write-failed');
      }
      backing.data = next;
    },
    dumpRaw: () => read((data) => data),
  };
}
