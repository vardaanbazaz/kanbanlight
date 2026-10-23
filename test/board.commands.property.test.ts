import fc from 'fast-check';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { sameName } from '../src/domain/names';
import { backends } from './commands/backends';
import { openServiceBoard, viewOf, type ServiceBoardDriver } from './service-driver';

const COLUMNS = ['backlog', 'todo', 'done'];
const MAX_BRANCHES = 6;

// A fresh store per run: beforeEach runs once per test, not once per fast-check run.
async function freshBoard(makeBackend: (typeof backends)[number][1]) {
  globalThis.indexedDB = new IDBFactory();
  return openServiceBoard(makeBackend());
}

async function outcome(promise: Promise<unknown>): Promise<{ ok: true; value: unknown } | { ok: false; code: string }> {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    return { ok: false, code: (error as { code: string }).code };
  }
}

// The 0.0.2 oracle property from board.property.test.ts, same operations, model and seed; no tick
// between steps, because ids and time come from counters.
const oracleOperation = fc.oneof(
  fc.record({ kind: fc.constant('create' as const), column: fc.constantFrom(...COLUMNS) }),
  fc.record({ kind: fc.constant('update' as const), pick: fc.nat(), column: fc.constantFrom(...COLUMNS) }),
  fc.record({ kind: fc.constant('remove' as const), pick: fc.nat() }),
  fc.record({ kind: fc.constant('branch' as const) }),
  fc.record({ kind: fc.constant('switch' as const), pick: fc.nat() }),
  fc.record({ kind: fc.constant('reload' as const) })
);

describe.each(backends)('branches over the board service on %s storage', (_name, makeBackend) => {
  it('switching and reloading always show the cards last seen on that branch', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(oracleOperation, { minLength: 5, maxLength: 40 }), async (operations) => {
        let board = await freshBoard(makeBackend);
        const lastSeen = new Map<string, string>();
        const remember = () => lastSeen.set(board.activeBranch(), board.view());

        for (const [step, op] of operations.entries()) {
          if (op.kind === 'create') {
            await board.create(`card ${step}`, op.column);
          } else if (op.kind === 'update') {
            await board.update(op.pick, { title: `edited ${step}`, columnId: op.column });
          } else if (op.kind === 'remove') {
            await board.remove(op.pick);
          } else if (op.kind === 'branch' && board.branches().length < MAX_BRANCHES) {
            remember();
            const id = await board.branch(`branch ${step}`);
            lastSeen.set(id, board.view());
          } else if (op.kind === 'switch') {
            remember();
            await board.switchTo(op.pick);
            const expected = lastSeen.get(board.activeBranch());
            if (expected !== undefined) expect(board.view()).toBe(expected);
          } else if (op.kind === 'reload') {
            remember();
            const before = board.activeBranch();
            board = await board.reload();
            expect(board.activeBranch()).toBe(before);
            expect(board.view()).toBe(lastSeen.get(before));
          }
          expect(await board.invariants()).toEqual([]);
        }
        await board.close();
      }),
      { numRuns: 25, seed: 1 }
    );
  }, 120_000);
});

// The commands, the queue and the second tab, against a model of every branch.

const NAMES = ['main', 'MAIN', 'idea', 'Idea', 'fix', 'nope'];

const operation = fc.oneof(
  fc.record({ kind: fc.constant('create' as const), column: fc.constantFrom(...COLUMNS) }),
  fc.record({ kind: fc.constant('update' as const), pick: fc.nat(), column: fc.constantFrom(...COLUMNS) }),
  fc.record({ kind: fc.constant('remove' as const), pick: fc.nat() }),
  fc.record({ kind: fc.constant('branch' as const), name: fc.constantFrom(...NAMES) }),
  fc.record({ kind: fc.constant('switch' as const), name: fc.constantFrom(...NAMES) }),
  fc.record({ kind: fc.constant('race' as const), column: fc.constantFrom(...COLUMNS), name: fc.constantFrom(...NAMES), createFirst: fc.boolean() }),
  fc.record({ kind: fc.constant('second tab' as const) }),
  fc.record({ kind: fc.constant('take over' as const) }),
  fc.record({ kind: fc.constant('failing write' as const), column: fc.constantFrom(...COLUMNS) }),
  fc.record({ kind: fc.constant('reload' as const) })
);

type Operation = typeof operation extends fc.Arbitrary<infer T> ? T : never;
type ModelCard = { id: string; title: string; columnId: string };
type ModelBranch = { id: string; name: string; cards: ModelCard[] };

class Model {
  branches: ModelBranch[] = [];
  active = '';

  current = () => this.branches.find((branch) => branch.id === this.active)!;
  find = (name: string) => this.branches.find((branch) => sameName(branch.name, name));
  pick = (pick: number) => {
    const cards = [...this.current().cards].sort((a, b) => a.id.localeCompare(b.id));
    return cards.length ? cards[pick % cards.length] : undefined;
  };
}

async function check(board: ServiceBoardDriver, model: Model) {
  expect(board.activeBranch()).toBe(model.active);
  expect(board.view()).toBe(viewOf(model.current().cards));
  const listed = (await board.run({ method: 'branch.list' })) as { id: string; name: string }[];
  expect(listed.map(({ id, name }) => [id, name])).toEqual(model.branches.map(({ id, name }) => [id, name]));
  expect(await board.invariants()).toEqual([]);
}

async function step(board: ServiceBoardDriver, model: Model, op: Operation, at: number): Promise<ServiceBoardDriver> {
  const create = async (title: string, columnId: string) => {
    const result = await outcome(board.run({ method: 'card.create', params: { title, columnId } }));
    expect(result.ok).toBe(true);
    if (result.ok) model.current().cards.push({ id: (result.value as ModelCard).id, title, columnId });
  };
  const switchTo = async (name: string) => {
    const target = model.find(name);
    const result = await outcome(board.run({ method: 'branch.switch', params: { branch: name } }));
    expect(result.ok ? 'ok' : result.code).toBe(target ? 'ok' : 'unknown-branch');
    if (target) model.active = target.id;
  };

  switch (op.kind) {
    case 'create':
      await create(`card ${at}`, op.column);
      break;
    case 'update': {
      const card = model.pick(op.pick);
      if (!card) break;
      await board.run({ method: 'card.update', params: { cardId: card.id, title: `edited ${at}`, columnId: op.column } });
      Object.assign(card, { title: `edited ${at}`, columnId: op.column });
      break;
    }
    case 'remove': {
      const card = model.pick(op.pick);
      if (!card) break;
      await board.run({ method: 'card.delete', params: { cardId: card.id } });
      model.current().cards = model.current().cards.filter((other) => other !== card);
      break;
    }
    case 'branch': {
      if (model.branches.length >= MAX_BRANCHES) break;
      const result = await outcome(board.run({ method: 'branch.create', params: { name: op.name } }));
      if (model.find(op.name)) {
        expect(result).toEqual({ ok: false, code: 'name-taken' });
        break;
      }
      expect(result.ok).toBe(true);
      const id = (result as { value: { id: string } }).value.id;
      model.branches.push({ id, name: op.name, cards: model.current().cards.map((card) => ({ ...card })) });
      model.active = id;
      break;
    }
    case 'switch':
      await switchTo(op.name);
      break;
    case 'race': {
      // Sent back to back without waiting: the queue runs them in the order sent.
      const target = model.find(op.name);
      const title = `raced ${at}`;
      const sent = op.createFirst
        ? [board.run({ method: 'card.create', params: { title, columnId: op.column } }), board.run({ method: 'branch.switch', params: { branch: op.name } })]
        : [board.run({ method: 'branch.switch', params: { branch: op.name } }), board.run({ method: 'card.create', params: { title, columnId: op.column } })];
      const [first, second] = await Promise.all(sent.map(outcome));
      const [created, switched] = op.createFirst ? [first, second] : [second, first];
      expect(created.ok).toBe(true);
      expect(switched.ok ? 'ok' : switched.code).toBe(target ? 'ok' : 'unknown-branch');
      if (!op.createFirst && target) model.active = target.id;
      model.current().cards.push({ id: (created as { value: ModelCard }).value.id, title, columnId: op.column });
      if (op.createFirst && target) model.active = target.id;
      break;
    }
    case 'second tab': {
      const tab = await board.openTab();
      expect(tab.readOnly()).toBe(true);
      expect(tab.view()).toBe(board.view());
      expect(await outcome(tab.run({ method: 'card.create', params: { title: 'from the second tab' } }))).toEqual({ ok: false, code: 'read-only' });
      await tab.close();
      break;
    }
    case 'take over': {
      const tab = await board.openTab();
      await tab.takeOver();
      expect([board.readOnly(), tab.readOnly()]).toEqual([true, false]);
      expect(await outcome(board.run({ method: 'card.create', params: { title: 'too late' } }))).toEqual({ ok: false, code: 'read-only' });
      await board.close();
      return tab;
    }
    case 'failing write': {
      const before = board.view();
      board.failNextWrite();
      const result = await outcome(board.run({ method: 'card.create', params: { title: `lost ${at}`, columnId: op.column } }));
      expect(result).toEqual({ ok: false, code: 'storage-failed' });
      expect(board.view()).toBe(before);
      // The board after a reload equals the board before the failing command.
      return board.reload();
    }
    case 'reload':
      return board.reload();
  }
  return board;
}

describe.each(backends)('commands, queue and tabs on %s storage', (_name, makeBackend) => {
  it('every branch shows exactly what the commands sent to it left there', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(operation, { minLength: 5, maxLength: 40 }), async (operations) => {
        let board = await freshBoard(makeBackend);
        const model = new Model();
        model.branches.push({ id: board.activeBranch(), name: 'main', cards: [] });
        model.active = board.activeBranch();
        for (const [at, op] of operations.entries()) {
          board = await step(board, model, op, at);
          await check(board, model);
        }
        // Every branch, not only the current one, holds what the model says.
        for (const branch of model.branches) {
          await board.run({ method: 'branch.switch', params: { branch: branch.id } });
          model.active = branch.id;
          await check(board, model);
        }
        await board.close();
      }),
      { numRuns: 25, seed: 1 }
    );
  }, 120_000);
});
