// The website's storage adapter: one IndexedDB database, `kanbanlight`, separate from the old
// `kanban-light`, which it never opens. A batch is one readwrite transaction.

import { openDB, type IDBPDatabase, type IDBPTransaction } from 'idb';
import type { BoardRecord, BranchRecord, CardRecord, CommitRecord, HeadRecord, JsonValue, OpEntry, WorkingCopy } from '../../domain/types';
import { canonicalJson } from '../../storage/json';
import { SCHEMA_VERSION, isStorageError, storageError, type Change, type StorageAdapter } from '../../storage/types';

export const DATABASE_NAME = 'kanbanlight';

const STORES = ['meta', 'boards', 'branches', 'heads', 'commits', 'cards', 'working', 'ops'] as const;

type StoredOp = { boardId: string; branchId: string; seq: number; entry: OpEntry };
type Write = IDBPTransaction<unknown, typeof STORES[number][], 'readwrite'>;

function createStores(db: IDBPDatabase) {
  db.createObjectStore('meta');
  db.createObjectStore('boards', { keyPath: 'id' });
  db.createObjectStore('branches', { keyPath: ['boardId', 'id'] }).createIndex('by-board', 'boardId');
  db.createObjectStore('heads', { keyPath: 'boardId' });
  db.createObjectStore('commits', { keyPath: 'id' }).createIndex('by-board', 'boardId');
  db.createObjectStore('cards', { keyPath: ['boardId', 'branchId', 'id'] }).createIndex('by-branch', ['boardId', 'branchId']);
  db.createObjectStore('working', { keyPath: ['boardId', 'branchId'] });
  db.createObjectStore('ops', { keyPath: ['boardId', 'branchId', 'seq'] });
}

const opsOf = (boardId: string, branchId: string, below = Infinity) =>
  IDBKeyRange.bound([boardId, branchId, -Infinity], [boardId, branchId, below], false, below !== Infinity);

async function applyChange(tx: Write, change: Change) {
  switch (change.kind) {
    case 'putBoard':
      return tx.objectStore('boards').put(change.board);
    case 'putBranch':
      return tx.objectStore('branches').put(change.branch);
    case 'deleteBranch': {
      const { boardId, branchId } = change;
      await tx.objectStore('branches').delete([boardId, branchId]);
      await tx.objectStore('working').delete([boardId, branchId]);
      for (const cardKey of await tx.objectStore('cards').index('by-branch').getAllKeys([boardId, branchId])) {
        await tx.objectStore('cards').delete(cardKey);
      }
      return tx.objectStore('ops').delete(opsOf(boardId, branchId));
    }
    case 'setHead':
      return tx.objectStore('heads').put(change.head);
    case 'putCommit': {
      const existing: unknown = await tx.objectStore('commits').get(change.commit.id);
      if (existing && canonicalJson(existing) !== canonicalJson(change.commit)) throw storageError('commit-conflict');
      return tx.objectStore('commits').put(change.commit);
    }
    case 'deleteCommits':
      for (const id of change.ids) {
        const existing = (await tx.objectStore('commits').get(id)) as CommitRecord | undefined;
        if (existing?.boardId === change.boardId) await tx.objectStore('commits').delete(id);
      }
      return;
    case 'putCard':
      return tx.objectStore('cards').put(change.card);
    case 'deleteCard':
      return tx.objectStore('cards').delete([change.boardId, change.branchId, change.cardId]);
    case 'setWorkingCopy':
      return tx.objectStore('working').put(change.copy);
    case 'appendOp': {
      const op: StoredOp = { boardId: change.boardId, branchId: change.branchId, seq: change.entry.seq, entry: change.entry };
      return tx.objectStore('ops').add(op); // fails when the sequence number exists
    }
    case 'trimOps':
      return tx.objectStore('ops').delete(opsOf(change.boardId, change.branchId, change.keepFromSeq));
    case 'clearOps':
      return tx.objectStore('ops').delete(opsOf(change.boardId, change.branchId));
    case 'setMeta':
      return tx.objectStore('meta').put(change.value, change.key);
    default:
      throw storageError('write-failed', 'unknown change');
  }
}

export function indexedDbStorage(name = DATABASE_NAME): StorageAdapter {
  let db: IDBPDatabase | null = null;
  let closed = false;

  const ready = () => {
    if (!db) throw storageError('unavailable');
    return db;
  };
  const shutDown = () => {
    db?.close();
    db = null;
    closed = true;
  };
  // Any failure that is not already a storage error means the database could not be used.
  const reading = async <T>(work: (database: IDBPDatabase) => Promise<T>): Promise<T> => {
    const database = ready();
    try {
      return await work(database);
    } catch (error) {
      throw isStorageError(error) ? error : storageError(db ? 'read-failed' : 'unavailable');
    }
  };

  return {
    async open() {
      if (closed) throw storageError('unavailable');
      if (!db) {
        const opened = await new Promise<IDBPDatabase>((resolve, reject) => {
          let blocked = false;
          openDB(name, 1, {
            upgrade(database, oldVersion, _newVersion, tx) {
              if (oldVersion < 1) {
                createStores(database);
                tx.objectStore('meta').put(SCHEMA_VERSION, 'schemaVersion');
              }
            },
            blocked: () => {
              blocked = true;
              reject(storageError('unavailable', 'the database is blocked by another tab'));
            },
            blocking: shutDown, // another connection wants a newer version: close, then every call rejects
            terminated: shutDown,
          }).then(
            // A connection that arrives after we gave up on it is closed, not kept.
            (database) => (blocked ? database.close() : resolve(database)),
            () => reject(storageError('unavailable'))
          );
        });
        if (STORES.some((store) => !opened.objectStoreNames.contains(store))) {
          opened.close();
          throw storageError('read-failed', 'the database is missing its tables');
        }
        db = opened;
      }
      return { status: (await ready().count('boards')) === 0 ? 'empty' : 'ready' };
    },
    async close() {
      shutDown();
    },
    readMeta: (key) => reading(async (database) => ((await database.get('meta', key)) as JsonValue | undefined) ?? null),
    listBoards: () => reading(async (database) => (await database.getAll('boards')) as BoardRecord[]),
    readBoard: (boardId) =>
      reading(async (database) => {
        const tx = database.transaction(['boards', 'branches', 'heads']);
        const [board, branches, head] = await Promise.all([
          tx.objectStore('boards').get(boardId) as Promise<BoardRecord | undefined>,
          tx.objectStore('branches').index('by-board').getAll(boardId) as Promise<BranchRecord[]>,
          tx.objectStore('heads').get(boardId) as Promise<HeadRecord | undefined>,
        ]);
        if (!board) return null;
        if (!head) throw storageError('read-failed', 'board has no head');
        return { board, branches, head };
      }),
    readWorkingCopy: (boardId, branchId) =>
      reading(async (database) => {
        const tx = database.transaction(['working', 'cards', 'ops']);
        const [copy, cards, ops] = await Promise.all([
          tx.objectStore('working').get([boardId, branchId]) as Promise<WorkingCopy | undefined>,
          tx.objectStore('cards').index('by-branch').getAll([boardId, branchId]) as Promise<CardRecord[]>,
          tx.objectStore('ops').getAll(opsOf(boardId, branchId)) as Promise<StoredOp[]>,
        ]);
        return copy ? { copy, cards, ops: ops.map((op) => op.entry) } : null;
      }),
    readCommits: (boardId, ids) =>
      reading(async (database) => {
        const store = database.transaction('commits').objectStore('commits');
        const commits = (await Promise.all(ids.map((id) => store.get(id)))) as (CommitRecord | undefined)[];
        return commits.filter((commit): commit is CommitRecord => commit?.boardId === boardId);
      }),
    listCommitIds: (boardId) =>
      reading(async (database) => (await database.getAllKeysFromIndex('commits', 'by-board', boardId)) as string[]),
    async apply(batch) {
      const tx = ready().transaction([...STORES], 'readwrite');
      try {
        for (const change of batch) await applyChange(tx, change);
        await tx.done;
      } catch (error) {
        try {
          tx.abort();
        } catch {
          // Already aborted by the failed request.
        }
        await tx.done.catch(() => undefined);
        throw isStorageError(error) ? error : storageError(db ? 'write-failed' : 'unavailable');
      }
    },
    dumpRaw: () =>
      reading(async (database) => {
        const tx = database.transaction([...STORES]);
        const dump: Record<string, unknown[]> = {};
        for (const store of STORES) {
          const [keys, values] = await Promise.all([tx.objectStore(store).getAllKeys(), tx.objectStore(store).getAll()]);
          dump[store] = store === 'meta' ? keys.map((key, index) => ({ key, value: values[index] })) : values;
        }
        return dump;
      }),
  };
}
