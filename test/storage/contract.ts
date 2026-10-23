// The storage contract, written once and run against every adapter.
// A backend is one backing store; each `connect()` is a fresh adapter over it (a "reload").

import { describe, expect, it } from 'vitest';
import { COLUMNS, type CardFields, type CardRecord, type CommitRecord, type OpEntry } from '../../src/domain/types';
import { checked } from '../../src/storage/checked';
import { SCHEMA_VERSION, type Batch, type StorageAdapter } from '../../src/storage/types';
import { faulty } from './faulty';

export interface Backend {
  connect(): StorageAdapter;
}

const fields = (id: string, title = `card ${id}`): CardFields => ({
  id,
  title,
  description: '',
  priority: 'medium',
  tags: [],
  columnId: 'todo',
  position: 0,
  createdAt: 1,
  updatedAt: 1,
});

export const card = (id: string, branchId = 'main', boardId = 'board-1'): CardRecord => ({
  ...fields(id),
  boardId,
  branchId,
});

export const commit = (id: string, parents: string[] = [], boardId = 'board-1'): CommitRecord => ({
  id,
  boardId,
  parents,
  createdAt: 1,
  reason: 'board-created',
  state: { cards: [fields('c1')], columns: [...COLUMNS] },
});

const op = (seq: number): OpEntry => ({ seq, command: 'card.update', before: fields('c1'), after: fields('c1', `edit ${seq}`) });

// One board with two branches, as the domain would write it.
export const boardBatch = (boardId = 'board-1'): Batch => [
  { kind: 'putBoard', board: { id: boardId, title: 'Board', createdAt: 1, updatedAt: 1 } },
  { kind: 'putBranch', branch: { id: 'main', boardId, name: 'main', createdAt: 1, createdFrom: null } },
  { kind: 'putBranch', branch: { id: 'idea', boardId, name: 'idea', createdAt: 2, createdFrom: 'main' } },
  { kind: 'setHead', head: { boardId, branchId: 'main' } },
  { kind: 'putCommit', commit: commit(`${boardId}-root`, [], boardId) },
  { kind: 'setWorkingCopy', copy: { boardId, branchId: 'main', baseCommitId: `${boardId}-root`, dirty: true } },
  { kind: 'setWorkingCopy', copy: { boardId, branchId: 'idea', baseCommitId: `${boardId}-root`, dirty: false } },
  { kind: 'putCard', card: card('c1', 'main', boardId) },
  { kind: 'putCard', card: card('c2', 'main', boardId) },
  { kind: 'putCard', card: card('c1', 'idea', boardId) },
  { kind: 'appendOp', boardId, branchId: 'main', entry: op(0) },
  { kind: 'appendOp', boardId, branchId: 'main', entry: op(1) },
  { kind: 'appendOp', boardId, branchId: 'main', entry: op(2) },
];

const byId = <T extends { id: string }>(items: T[]) => [...items].sort((a, b) => a.id.localeCompare(b.id));

// Everything a reader can see of board-1, in a stable shape.
async function view(adapter: StorageAdapter) {
  const board = await adapter.readBoard('board-1');
  const main = await adapter.readWorkingCopy('board-1', 'main');
  const idea = await adapter.readWorkingCopy('board-1', 'idea');
  return {
    board: board && { ...board, branches: byId(board.branches) },
    main: main && { ...main, cards: byId(main.cards) },
    idea: idea && { ...idea, cards: byId(idea.cards) },
    commits: (await adapter.listCommitIds('board-1')).sort(),
    note: await adapter.readMeta('note'),
  };
}

async function opened(backend: Backend) {
  const adapter = backend.connect();
  await adapter.open();
  return adapter;
}

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to reject');
}

export function storageContract(name: string, makeBackend: () => Backend) {
  describe(`storage contract: ${name}`, () => {
    it('opens an empty store with its schema version, and reopens it as still empty', async () => {
      const backend = makeBackend();
      const adapter = backend.connect();
      expect(await adapter.open()).toEqual({ status: 'empty' });
      expect(await adapter.open()).toEqual({ status: 'empty' });
      expect(await adapter.readMeta('schemaVersion')).toBe(SCHEMA_VERSION);
      expect(await adapter.listBoards()).toEqual([]);
      const again = backend.connect();
      expect(await again.open()).toEqual({ status: 'empty' });
      expect(await again.readMeta('nothing')).toBeNull();
      expect(await again.readBoard('board-1')).toBeNull();
      expect(await again.readWorkingCopy('board-1', 'main')).toBeNull();
    });

    it('keeps every kind of change across a reload', async () => {
      const backend = makeBackend();
      const adapter = await opened(backend);
      await adapter.apply([...boardBatch(), { kind: 'setMeta', key: 'note', value: { a: [1, 'two', null, true] } }]);
      const before = await view(adapter);
      const reloaded = backend.connect();
      expect(await reloaded.open()).toEqual({ status: 'ready' });
      expect(await view(reloaded)).toEqual(before);
      expect(before.board?.head).toEqual({ boardId: 'board-1', branchId: 'main' });
      expect(before.board?.branches.map((branch) => branch.id)).toEqual(['idea', 'main']);
      expect(before.main?.cards.map((item) => item.id)).toEqual(['c1', 'c2']);
      expect(before.main?.ops.map((entry) => entry.seq)).toEqual([0, 1, 2]);
      expect(before.main?.copy.dirty).toBe(true);
      expect(before.note).toEqual({ a: [1, 'two', null, true] });
      expect(await reloaded.readCommits('board-1', ['board-1-root'])).toEqual([commit('board-1-root')]);
      expect(await reloaded.listBoards()).toEqual([{ id: 'board-1', title: 'Board', createdAt: 1, updatedAt: 1 }]);
    });

    it('deletes cards, trims and clears ops, deletes commits and branches', async () => {
      const backend = makeBackend();
      const adapter = await opened(backend);
      await adapter.apply([...boardBatch(), { kind: 'putCommit', commit: commit('c-2', ['board-1-root']) }]);
      await adapter.apply([
        { kind: 'deleteCard', boardId: 'board-1', branchId: 'main', cardId: 'c2' },
        { kind: 'trimOps', boardId: 'board-1', branchId: 'main', keepFromSeq: 2 },
      ]);
      const main = await (await opened(backend)).readWorkingCopy('board-1', 'main');
      expect(main?.cards.map((item) => item.id)).toEqual(['c1']);
      expect(main?.ops.map((entry) => entry.seq)).toEqual([2]);

      await adapter.apply([
        { kind: 'clearOps', boardId: 'board-1', branchId: 'main' },
        { kind: 'deleteCommits', boardId: 'board-1', ids: ['c-2'] },
        { kind: 'deleteBranch', boardId: 'board-1', branchId: 'idea' },
      ]);
      const reloaded = await opened(backend);
      expect((await reloaded.readWorkingCopy('board-1', 'main'))?.ops).toEqual([]);
      expect(await reloaded.listCommitIds('board-1')).toEqual(['board-1-root']);
      expect(await reloaded.readWorkingCopy('board-1', 'idea')).toBeNull();
      expect((await reloaded.readBoard('board-1'))?.branches.map((branch) => branch.id)).toEqual(['main']);
      // The deleted branch's cards are gone, the other branch's card with the same id is not.
      expect((await reloaded.readWorkingCopy('board-1', 'main'))?.cards.map((item) => item.id)).toEqual(['c1']);
    });

    it('treats deleting something missing, and an empty batch, as no change', async () => {
      const backend = makeBackend();
      const adapter = await opened(backend);
      await adapter.apply(boardBatch());
      const before = await view(adapter);
      await adapter.apply([]);
      await adapter.apply([
        { kind: 'deleteCard', boardId: 'board-1', branchId: 'main', cardId: 'nope' },
        { kind: 'deleteCommits', boardId: 'board-1', ids: ['nope'] },
        { kind: 'deleteBranch', boardId: 'board-1', branchId: 'nope' },
        { kind: 'clearOps', boardId: 'board-1', branchId: 'nope' },
      ]);
      expect(await view(await opened(backend))).toEqual(before);
    });

    it('never changes a commit: the same content again is accepted, different content rejects the whole batch', async () => {
      const backend = makeBackend();
      const adapter = await opened(backend);
      await adapter.apply(boardBatch());
      await adapter.apply([{ kind: 'putCommit', commit: commit('board-1-root') }]);
      const before = await view(adapter);
      const changed = { ...commit('board-1-root'), reason: 'merge' as const };
      const error = await rejection(
        adapter.apply([{ kind: 'putCard', card: card('c9') }, { kind: 'putCommit', commit: changed }])
      );
      expect(error).toMatchObject({ code: 'commit-conflict' });
      expect(await view(adapter)).toEqual(before);
      expect(await view(await opened(backend))).toEqual(before);
    });

    it('applies all of a batch or none of it when a later change cannot be stored', async () => {
      const backend = makeBackend();
      const adapter = await opened(backend);
      await adapter.apply(boardBatch());
      const before = await view(adapter);
      const keyless = { ...card('c9') } as Partial<CardRecord>;
      delete keyless.branchId;
      const failures: Batch[] = [
        [{ kind: 'putCard', card: card('c8') }, { kind: 'setHead', head: { boardId: 'board-1', branchId: 'idea' } }, { kind: 'putCard', card: keyless as CardRecord }],
        [{ kind: 'putCard', card: card('c8') }, { kind: 'appendOp', boardId: 'board-1', branchId: 'main', entry: op(1) }],
      ];
      for (const batch of failures) {
        expect(await rejection(adapter.apply(batch))).toMatchObject({ code: 'write-failed' });
        expect(await view(adapter)).toEqual(before);
        expect(await view(await opened(backend))).toEqual(before);
      }
      // The adapter is still usable after a failed batch.
      await adapter.apply([{ kind: 'putCard', card: card('c8') }]);
      expect((await adapter.readWorkingCopy('board-1', 'main'))?.cards).toHaveLength(3);
    });

    it('a failed write leaves storage as it was and the next write works', async () => {
      const backend = makeBackend();
      const inner = await opened(backend);
      await inner.apply(boardBatch());
      const before = await view(inner);
      const adapter = faulty(inner, { failApply: 2 });
      await adapter.apply([{ kind: 'putCard', card: card('c8') }]);
      expect(await rejection(adapter.apply([{ kind: 'putCard', card: card('c9') }]))).toMatchObject({ code: 'write-failed' });
      const after = await view(await opened(backend));
      expect(after.main?.cards.map((item) => item.id)).toEqual(['c1', 'c2', 'c8']);
      expect({ ...after, main: before.main }).toEqual(before);
      await adapter.apply([{ kind: 'putCard', card: card('c9') }]);
      expect((await inner.readWorkingCopy('board-1', 'main'))?.cards).toHaveLength(4);
    });

    it('hands out copies: changing a value read or written never changes what is stored', async () => {
      const adapter = await opened(makeBackend());
      const written = card('c9');
      await adapter.apply([...boardBatch(), { kind: 'putCard', card: written }]);
      written.title = 'changed after writing';
      const read = await adapter.readWorkingCopy('board-1', 'main');
      read!.cards.forEach((item) => (item.title = 'changed after reading'));
      read!.ops.length = 0;
      (await adapter.readCommits('board-1', ['board-1-root']))[0].state.cards.length = 0;
      const again = await adapter.readWorkingCopy('board-1', 'main');
      expect(byId(again!.cards).map((item) => item.title)).toEqual(['card c1', 'card c2', 'card c9']);
      expect(again!.ops).toHaveLength(3);
      expect((await adapter.readCommits('board-1', ['board-1-root']))[0].state.cards).toHaveLength(1);
    });

    it('reads commits of the asked board in the asked order and leaves out missing ones', async () => {
      const adapter = await opened(makeBackend());
      await adapter.apply([...boardBatch(), ...boardBatch('board-2'), { kind: 'putCommit', commit: commit('c-2', ['board-1-root']) }]);
      const commits = await adapter.readCommits('board-1', ['c-2', 'missing', 'board-2-root', 'board-1-root']);
      expect(commits.map((item) => item.id)).toEqual(['c-2', 'board-1-root']);
      expect((await adapter.listCommitIds('board-2')).sort()).toEqual(['board-2-root']);
    });

    it('keeps boards apart', async () => {
      const adapter = await opened(makeBackend());
      await adapter.apply([...boardBatch(), ...boardBatch('board-2')]);
      await adapter.apply([{ kind: 'deleteBranch', boardId: 'board-2', branchId: 'main' }]);
      expect((await adapter.readWorkingCopy('board-1', 'main'))?.cards).toHaveLength(2);
      expect(await adapter.readWorkingCopy('board-2', 'main')).toBeNull();
      expect((await adapter.listBoards()).map((board) => board.id).sort()).toEqual(['board-1', 'board-2']);
    });

    it('rejects every call before open and after close with "unavailable"', async () => {
      const backend = makeBackend();
      const unopened = backend.connect();
      expect(await rejection(unopened.listBoards())).toMatchObject({ code: 'unavailable' });
      const adapter = await opened(backend);
      await adapter.close();
      await adapter.close();
      for (const call of [
        () => adapter.readMeta('schemaVersion'),
        () => adapter.listBoards(),
        () => adapter.readBoard('board-1'),
        () => adapter.readWorkingCopy('board-1', 'main'),
        () => adapter.readCommits('board-1', []),
        () => adapter.listCommitIds('board-1'),
        () => adapter.apply(boardBatch()),
      ]) {
        expect(await rejection(call())).toMatchObject({ code: 'unavailable' });
      }
    });

    it('rejects with plain data that survives JSON', async () => {
      const adapter = await opened(makeBackend());
      await adapter.close();
      const error = await rejection(adapter.listBoards());
      expect(Object.getPrototypeOf(error)).toBe(Object.prototype);
      expect(JSON.parse(JSON.stringify(error))).toEqual(error);
    });

    it('dumps raw data even when a stored record fails the checks', async () => {
      const backend = makeBackend();
      const adapter = await opened(backend);
      const corrupt = { ...card('c9'), title: { not: 'text' } } as unknown as CardRecord;
      await adapter.apply([...boardBatch(), { kind: 'putCard', card: corrupt }]);
      const reader = checked(backend.connect());
      await reader.open();
      expect(await rejection(reader.readWorkingCopy('board-1', 'main'))).toMatchObject({ code: 'read-failed' });
      expect(JSON.stringify(await reader.dumpRaw())).toContain('"c9"');
    });
  });
}
