import { describe, expect, it } from 'vitest';
import { checked } from '../../src/storage/checked';
import { createMemoryBacking, memoryStorage } from '../../src/storage/memory';
import type { CardRecord } from '../../src/domain/types';
import { boardBatch, card } from './contract';

async function setup() {
  const backing = createMemoryBacking();
  const raw = memoryStorage(backing);
  await raw.open();
  await raw.apply(boardBatch());
  const reader = checked(memoryStorage(backing));
  await reader.open();
  return { raw, reader };
}

const rejection = (promise: Promise<unknown>) => promise.then(
  () => {
    throw new Error('expected the call to reject');
  },
  (error: unknown) => error
);

describe('checked storage', () => {
  it('reads valid records unchanged', async () => {
    const { raw, reader } = await setup();
    expect(await reader.readWorkingCopy('board-1', 'main')).toEqual(await raw.readWorkingCopy('board-1', 'main'));
    expect(await reader.readBoard('board-1')).toEqual(await raw.readBoard('board-1'));
  });

  it('refuses a stored record that fails the checks and names the problem, not the content', async () => {
    const { raw, reader } = await setup();
    await raw.apply([{ kind: 'putCard', card: { ...card('c9'), title: { secret: 'card text' } } as unknown as CardRecord }]);
    const error = await rejection(reader.readWorkingCopy('board-1', 'main'));
    expect(error).toEqual({ code: 'read-failed', reason: 'card: title must be text' });
    expect(JSON.stringify(error)).not.toContain('card text');
  });

  it('refuses a record filed under another branch', async () => {
    const { raw, reader } = await setup();
    const inner = { ...raw, readWorkingCopy: async () => ({ ...(await raw.readWorkingCopy('board-1', 'idea'))!, cards: [card('c1', 'main')] }) };
    const error = await rejection(checked(inner).readWorkingCopy('board-1', 'idea'));
    expect(error).toMatchObject({ code: 'read-failed' });
    await expect(reader.readWorkingCopy('board-1', 'idea')).resolves.toBeTruthy();
  });

  it('refuses to write an invalid record and stores nothing of the batch', async () => {
    const { reader } = await setup();
    const before = await reader.readWorkingCopy('board-1', 'main');
    const error = await rejection(
      reader.apply([
        { kind: 'putCard', card: card('c8') },
        { kind: 'putCard', card: { ...card('c9'), columnId: 'nowhere' } as unknown as CardRecord },
      ])
    );
    expect(error).toEqual({ code: 'write-failed', reason: 'card: columnId is not a known value' });
    expect(await reader.readWorkingCopy('board-1', 'main')).toEqual(before);
  });

  it('reads old values of any length, spacing or repetition', async () => {
    const { raw, reader } = await setup();
    const old = { ...card('c9'), title: '  ' + 't'.repeat(500), tags: ['a', 'a', 'x'.repeat(60)], assignee: 'Unassigned' };
    await raw.apply([{ kind: 'putCard', card: old }]);
    const cards = (await reader.readWorkingCopy('board-1', 'main'))!.cards;
    expect(cards.find((item) => item.id === 'c9')).toEqual(old);
  });
});
