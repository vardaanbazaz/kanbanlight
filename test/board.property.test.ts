import fc from 'fast-check';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { openBoard, tick } from './board-driver';
import { FakeWebSocket } from './setup';

const COLUMNS = ['backlog', 'todo', 'done'];
const MAX_BRANCHES = 6;

const operation = fc.oneof(
  fc.record({ kind: fc.constant('create' as const), column: fc.constantFrom(...COLUMNS) }),
  fc.record({ kind: fc.constant('update' as const), pick: fc.nat(), column: fc.constantFrom(...COLUMNS) }),
  fc.record({ kind: fc.constant('remove' as const), pick: fc.nat() }),
  fc.record({ kind: fc.constant('branch' as const) }),
  fc.record({ kind: fc.constant('switch' as const), pick: fc.nat() }),
  fc.record({ kind: fc.constant('reload' as const) })
);

describe('branches in the web app', () => {
  it('switching and reloading always show the cards last seen on that branch', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(operation, { minLength: 5, maxLength: 40 }), async (operations) => {
        globalThis.indexedDB = new IDBFactory();
        localStorage.clear();
        FakeWebSocket.instances.length = 0;

        let board = await openBoard();
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
          await tick(3);
        }
      }),
      { numRuns: 25, seed: 1 }
    );
  }, 120_000);
});
