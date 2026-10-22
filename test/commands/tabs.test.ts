import { describe, expect, it } from 'vitest';
import type { BoardService } from '../../src/commands/service';
import { storageError } from '../../src/storage/types';
import { backends, harness, rejection, titles } from './backends';

const create = (service: BoardService, title: string) => service.run({ method: 'card.create', params: { title } });
const changed = (service: BoardService) => new Promise<void>((resolve) => {
  const stop = service.subscribe(() => {
    stop();
    resolve();
  });
});

describe.each(backends)('two tabs on %s storage', (_name, makeBackend) => {
  it('only the first tab writes; the second is read-only, refused, and follows the writer', async () => {
    const h = harness(makeBackend);
    const writer = await h.open();
    const reader = await h.open();
    expect([writer.readOnly(), reader.readOnly()]).toEqual([false, true]);

    expect(await rejection(create(reader, 'From the second tab'))).toEqual({ code: 'read-only' });
    expect(await rejection(reader.run({ method: 'branch.create', params: { name: 'idea' } }))).toEqual({ code: 'read-only' });
    // Refused even when it would change nothing.
    expect(await rejection(reader.run({ method: 'branch.switch', params: { branch: 'main' } }))).toEqual({ code: 'read-only' });
    expect(reader.state()!.current.cards).toEqual([]);

    const seen = changed(reader);
    await create(writer, 'From the first tab');
    await seen;
    await reader.settled();
    expect(titles(reader.state()!.current.cards)).toEqual(['From the first tab']);
    // Queries still work read-only.
    await expect(reader.run({ method: 'board.view' })).resolves.toBeTruthy();
  });

  it('"Use here" swaps the roles; the old writer\'s queued commands are refused, never stored', async () => {
    const h = harness(makeBackend);
    let openGate = () => {};
    const gate = new Promise<void>((resolve) => (openGate = resolve));
    const storage = h.storage();
    // A comparison that waits on the gate keeps the first tab's queue busy until the takeover is done.
    const first = await h.open({ storage: { ...storage, listCommitIds: (boardId) => gate.then(() => storage.listCommitIds(boardId)) } });
    const second = await h.open();
    await create(first, 'Before');
    const busy = first.run({ method: 'branch.compare', params: { a: 'main', b: 'main' } });
    const queued = [create(first, 'Queued 1'), create(first, 'Queued 2')].map(rejection);
    await second.takeOver();
    openGate();
    await busy;
    expect(await Promise.all(queued)).toEqual([{ code: 'read-only' }, { code: 'read-only' }]);
    expect([first.readOnly(), second.readOnly()]).toEqual([true, false]);
    await second.settled();
    expect(titles(second.state()!.current.cards)).toEqual(['Before']);
    await create(second, 'After');
    expect(await rejection(create(first, 'Too late'))).toEqual({ code: 'read-only' });
    await first.close();
    await second.close();
    const reloaded = await h.open();
    expect(titles(reloaded.state()!.current.cards)).toEqual(['After', 'Before']);
  });

  it('"Use here" re-reads the board after the lock is held, before any later command runs', async () => {
    const h = harness(makeBackend);
    const first = await h.open();
    let openGate = () => {};
    const gate = new Promise<void>((resolve) => (openGate = resolve));
    const lock = h.locks();
    // A feed that never delivers, so only the takeover's own re-read can show the first tab's changes.
    const deaf = { publish() {}, subscribe: () => () => {}, close() {} };
    const second = await h.open({
      feed: deaf,
      lock: { ...lock, acquire: async (options) => (options?.steal ? gate.then(() => lock.acquire(options)) : lock.acquire(options)) },
    });
    await create(first, 'Before');
    const taking = second.takeOver();
    // Let anything the takeover would read early finish first.
    await new Promise((resolve) => setTimeout(resolve, 10));
    // Still the writer while the steal waits: this change lands just before the handover.
    await create(first, 'From the first tab');
    const right = create(second, 'Right after');
    openGate();
    await taking;
    await right;
    expect(titles(second.state()!.current.cards)).toEqual(['Before', 'From the first tab', 'Right after']);
    expect(await rejection(create(first, 'Too late'))).toEqual({ code: 'read-only' });
    await first.close();
    await second.close();
    const reloaded = await h.open();
    expect(titles(reloaded.state()!.current.cards)).toEqual(['Before', 'From the first tab', 'Right after']);
  });

  it('a "Use here" whose re-read fails gives the lock back and stays read-only', async () => {
    const h = harness(makeBackend);
    const first = await h.open();
    const storage = h.storage();
    let broken = false;
    const second = await h.open({
      storage: { ...storage, readBoard: (boardId) => (broken ? Promise.reject(storageError('read-failed')) : storage.readBoard(boardId)) },
    });
    broken = true;
    expect(await rejection(second.takeOver())).toMatchObject({ code: 'storage-failed' });
    expect([first.readOnly(), second.readOnly()]).toEqual([true, true]);
    expect(await h.locks().acquire()).toBe(true);
  });

  it('a read-only tab on an empty store shows the board once a writer creates it', async () => {
    const h = harness(makeBackend);
    const blocker = h.locks();
    await blocker.acquire();
    const reader = await h.open();
    expect(reader.state()).toBeNull();
    expect(await rejection(reader.run({ method: 'board.view' }))).toMatchObject({ code: 'storage-unavailable' });
    await blocker.release();
    const seen = changed(reader);
    const writer = await h.open();
    await seen;
    await reader.settled();
    expect(reader.state()!.board.id).toBe(writer.state()!.board.id);
  });
});
