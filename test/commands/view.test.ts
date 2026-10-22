import { describe, expect, it } from 'vitest';
import type { BoardService } from '../../src/commands/service';
import type { BoardView } from '../../src/commands/view';
import { COLUMN_IDS, type CardRecord } from '../../src/domain/types';
import { backends, harness, rejection } from './backends';

const create = (service: BoardService, title: string, columnId: string) =>
  service.run({ method: 'card.create', params: { title, columnId } }) as Promise<CardRecord>;
const allCards = (view: BoardView) => COLUMN_IDS.flatMap((id) => view.columns[id]);

function counted(service: BoardService) {
  const calls = { count: 0 };
  service.subscribe(() => calls.count++);
  return calls;
}

async function boardWithCards(service: BoardService) {
  for (const [title, column] of [['One', 'todo'], ['Two', 'todo'], ['Three', 'review'], ['Four', 'done']]) await create(service, title, column);
  return service.getView()!;
}

// Every card but `changed` is the same object, and so is every column the change did not touch.
function expectShared(before: BoardView, after: BoardView, changed: string, touched: string[]) {
  const previous = new Map(allCards(before).map((card) => [card.id, card]));
  for (const card of allCards(after)) if (card.id !== changed) expect(card).toBe(previous.get(card.id));
  for (const id of COLUMN_IDS) if (!touched.includes(id)) expect(after.columns[id]).toBe(before.columns[id]);
  expect([after.board, after.branches, after.head]).toEqual([before.board, before.branches, before.head]);
  expect(after.branches).toBe(before.branches);
}

describe.each(backends)('view model on %s storage', (_name, makeBackend) => {
  it('lists each column in position order, with the board, branches, head and read-only flag', async () => {
    const service = await harness(makeBackend).open();
    const view = await boardWithCards(service);
    expect(view.columns.todo.map((card) => card.title)).toEqual(['One', 'Two']);
    await service.run({ method: 'card.move', params: { cardId: view.columns.todo[1].id, columnId: 'todo', position: 0.5 } });
    await service.run({ method: 'card.move', params: { cardId: view.columns.todo[0].id, columnId: 'todo', position: 1 } });
    expect(service.getView()!.columns.todo.map((card) => card.title)).toEqual(['Two', 'One']);
    expect(view.columns.backlog).toEqual([]);
    expect(view.branches.map((branch) => branch.name)).toEqual(['main']);
    expect([view.head.branchId, view.readOnly, view.lastError]).toEqual([view.branches[0].id, false, null]);
  });

  it('after a command on one card, every other card and untouched column is the same object', async () => {
    const service = await harness(makeBackend).open();
    const before = await boardWithCards(service);
    const [one] = before.columns.todo;
    await service.run({ method: 'card.update', params: { cardId: one.id, title: 'One, edited' } });
    const edited = service.getView()!;
    expectShared(before, edited, one.id, ['todo']);
    expect(edited.columns.todo[0].title).toBe('One, edited');

    await service.run({ method: 'card.move', params: { cardId: one.id, columnId: 'done' } });
    expectShared(edited, service.getView()!, one.id, ['todo', 'done']);
  });

  it('a read-only tab that re-reads the board from storage keeps every unchanged card object', async () => {
    const h = harness(makeBackend);
    const writer = await h.open();
    const reader = await h.open();
    await boardWithCards(writer);
    await reader.settled();
    const before = reader.getView()!;
    expect(before.readOnly).toBe(true);
    const [, two] = before.columns.todo;
    await writer.run({ method: 'card.update', params: { cardId: two.id, priority: 'high' } });
    await reader.settled();
    expectShared(before, reader.getView()!, two.id, ['todo']);
  });

  it('a command or query that changes nothing does not notify, and the view stays the same object', async () => {
    const service = await harness(makeBackend).open();
    const view = await boardWithCards(service);
    const calls = counted(service);
    const [one] = view.columns.todo;
    await service.run({ method: 'card.update', params: { cardId: one.id, title: 'One' } });
    await service.run({ method: 'card.move', params: { cardId: one.id, columnId: 'todo' } });
    await service.run({ method: 'branch.switch', params: { branch: 'main' } });
    await service.run({ method: 'board.view' });
    await service.run({ method: 'branch.compare', params: { a: 'main', b: 'main' } });
    expect(calls.count).toBe(0);
    expect(service.getView()).toBe(view);
  });

  it('a refused command sets the last error and notifies; the next command that succeeds clears it', async () => {
    const service = await harness(makeBackend).open();
    const view = await boardWithCards(service);
    const calls = counted(service);
    const error = await rejection(service.run({ method: 'branch.switch', params: { branch: 'nowhere' } }));
    expect(service.getView()!.lastError).toBe(error);
    expect(service.getView()!.columns).toBe(view.columns);
    expect(calls.count).toBe(1);
    // The same failure again is a new error, so the UI can show it again.
    await rejection(service.run({ method: 'branch.switch', params: { branch: 'nowhere' } }));
    expect(calls.count).toBe(2);
    // A command that changes nothing still clears the error.
    await service.run({ method: 'branch.switch', params: { branch: 'main' } });
    expect(service.getView()!.lastError).toBeNull();
    expect(calls.count).toBe(3);
  });

  it('losing the writer lock shows as read-only', async () => {
    const h = harness(makeBackend);
    const first = await h.open();
    const second = await h.open();
    const calls = counted(first);
    await second.takeOver();
    expect([first.getView()!.readOnly, second.getView()!.readOnly]).toEqual([true, false]);
    expect(calls.count).toBe(1);
  });
});
