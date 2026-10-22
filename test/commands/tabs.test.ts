import { describe, expect, it } from 'vitest';
import type { BoardService } from '../../src/commands/service';
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
    const first = await h.open();
    const second = await h.open();
    await create(first, 'Before');
    const queued = [create(first, 'Queued 1'), create(first, 'Queued 2')].map(rejection);
    await second.takeOver();
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
