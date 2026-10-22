import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  applyCardChange,
  createBoard,
  createBranch,
  mergeBase,
  switchBranch,
  toFields,
  unreachableCommits,
  type Applied,
  type CardChange,
  type Env,
} from '../../src/domain/history';
import { counterClock, counterIds } from '../../src/domain/ids';
import { isNameTaken } from '../../src/domain/names';
import { COLUMN_IDS, type BoardRecord, type BranchRecord, type CommitRecord, type HeadRecord } from '../../src/domain/types';
import { checked } from '../../src/storage/checked';
import { createMemoryBacking, memoryStorage, type MemoryBacking } from '../../src/storage/memory';
import type { StorageAdapter, WorkingCopyState } from '../../src/storage/types';

interface Model {
  board: BoardRecord;
  branches: BranchRecord[];
  head: HeadRecord;
  working: Map<string, WorkingCopyState>;
  commits: Map<string, CommitRecord>;
}

const column = fc.constantFrom(...COLUMN_IDS);
const operation = fc.oneof(
  fc.record({ kind: fc.constant('create' as const), column }),
  fc.record({ kind: fc.constant('update' as const), pick: fc.nat() }),
  fc.record({ kind: fc.constant('move' as const), pick: fc.nat(), column }),
  fc.record({ kind: fc.constant('remove' as const), pick: fc.nat() }),
  fc.record({ kind: fc.constant('branch' as const), name: fc.constantFrom('idea', 'Idea', 'fix', 'main'), from: fc.nat() }),
  fc.record({ kind: fc.constant('switch' as const), pick: fc.nat() }),
  fc.record({ kind: fc.constant('base' as const), a: fc.nat(), b: fc.nat() })
);

const byId = <T extends { id: string }>(items: T[]) => [...items].sort((x, y) => (x.id < y.id ? -1 : 1));
const sorted = (state: WorkingCopyState | null) => state && { ...state, cards: byId(state.cards) };
const pick = <T>(items: T[], n: number) => items[n % items.length];

function ancestorsOf(id: string, commits: Map<string, CommitRecord>): Set<string> {
  const seen = new Set<string>();
  const queue = [id];
  while (queue.length) {
    const next = queue.pop()!;
    if (!seen.has(next)) {
      seen.add(next);
      queue.push(...commits.get(next)!.parents);
    }
  }
  return seen;
}

// Everything stored must read back, through the checks, exactly as the model holds it.
async function expectStored(backing: MemoryBacking, model: Model) {
  const reader = checked(memoryStorage(backing));
  await reader.open();
  const board = await reader.readBoard(model.board.id);
  expect(board).toEqual({ board: model.board, branches: expect.any(Array), head: model.head });
  expect(byId(board!.branches)).toEqual(byId(model.branches));
  expect(model.branches.some((branch) => branch.id === model.head.branchId)).toBe(true);
  for (const branch of model.branches) {
    const stored = await reader.readWorkingCopy(model.board.id, branch.id);
    const held = model.working.get(branch.id)!;
    expect(sorted(stored)).toEqual(sorted(held));
    // A clean working copy is exactly its base commit.
    if (!held.copy.dirty) {
      expect(byId(held.cards.map(toFields))).toEqual(model.commits.get(held.copy.baseCommitId)!.state.cards);
    }
  }
  const ids = [...model.commits.keys()].sort();
  expect((await reader.listCommitIds(model.board.id)).sort()).toEqual(ids);
  expect(byId(await reader.readCommits(model.board.id, ids))).toEqual(byId([...model.commits.values()]));
  for (const commit of model.commits.values()) for (const parent of commit.parents) expect(model.commits.has(parent)).toBe(true);
  const tips = [...model.working.values()].map((state) => state.copy.baseCommitId);
  expect(unreachableCommits(tips, [...model.commits.values()])).toEqual([]);
}

async function store(storage: StorageAdapter, applied: Applied<unknown>) {
  await storage.apply(applied.batch);
}

describe('history over storage', () => {
  it('every batch stores exactly what the domain holds, and the history stays connected', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(operation, { minLength: 1, maxLength: 40 }), async (operations) => {
        const counter = { value: 0 };
        const env: Env = { clock: counterClock({ value: 0 }), ids: counterIds(counter) };
        const backing = createMemoryBacking();
        const storage = checked(memoryStorage(backing));
        await storage.open();
        const created = createBoard(env);
        await store(storage, created);
        const model: Model = {
          board: created.value.board,
          branches: [created.value.branch],
          head: created.value.head,
          working: new Map([[created.value.branch.id, created.value.working]]),
          commits: new Map([[created.value.commit.id, created.value.commit]]),
        };

        for (const op of operations) {
          const current = model.working.get(model.head.branchId)!;
          if (op.kind === 'create' || op.kind === 'update' || op.kind === 'move' || op.kind === 'remove') {
            if (op.kind !== 'create' && current.cards.length === 0) continue;
            const cardId = op.kind === 'create' ? '' : pick(current.cards, op.pick).id;
            const change: CardChange =
              op.kind === 'create'
                ? { command: 'card.create', input: { title: `card ${counter.value}`, columnId: op.column } }
                : op.kind === 'update'
                  ? { command: 'card.update', cardId, input: { title: `edit ${counter.value}` } }
                  : op.kind === 'move'
                    ? { command: 'card.move', cardId, columnId: op.column }
                    : { command: 'card.delete', cardId };
            const result = applyCardChange(env, current, change);
            if (!result.ok) throw new Error(result.error.code);
            await store(storage, result);
            model.working.set(model.head.branchId, result.value.working);
          } else if (op.kind === 'branch') {
            const source = model.working.get(pick(model.branches, op.from).id)!;
            const result = createBranch(env, {
              name: op.name,
              branches: model.branches,
              source,
              sourceBase: model.commits.get(source.copy.baseCommitId)!,
            });
            if (!result.ok) {
              expect(result.error.code).toBe('name-taken');
              expect(isNameTaken(op.name, model.branches)).toBe(true);
              continue;
            }
            await store(storage, result);
            model.branches.push(result.value.branch);
            model.working.set(source.copy.branchId, result.value.source);
            model.working.set(result.value.branch.id, result.value.working);
            if (result.value.commit) model.commits.set(result.value.commit.id, result.value.commit);
          } else if (op.kind === 'switch') {
            const result = switchBranch(env, {
              branches: model.branches,
              head: model.head,
              current,
              currentBase: model.commits.get(current.copy.baseCommitId)!,
              target: pick(model.branches, op.pick).id,
            });
            if (!result.ok) throw new Error(result.error.code);
            // Leaving a clean branch never writes a commit.
            if (!current.copy.dirty) expect(result.batch.some((change) => change.kind === 'putCommit')).toBe(false);
            await store(storage, result);
            model.working.set(current.copy.branchId, result.value.current);
            model.head = result.value.head;
            if (result.value.commit) model.commits.set(result.value.commit.id, result.value.commit);
          } else {
            const ids = [...model.commits.keys()];
            const [a, b] = [pick(ids, op.a), pick(ids, op.b)];
            const base = mergeBase(a, b, model.commits);
            if (!base.ok || base.value === null) throw new Error('every commit of a board shares the root');
            expect(ancestorsOf(a, model.commits).has(base.value)).toBe(true);
            expect(ancestorsOf(b, model.commits).has(base.value)).toBe(true);
            expect(mergeBase(a, a, model.commits)).toEqual({ ok: true, value: a });
          }
          await expectStored(backing, model);
        }
      }),
      { numRuns: 50, seed: 1 }
    );
  }, 60_000);
});
