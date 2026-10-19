import { describe, expect, it, vi } from 'vitest';
import { openTab, storedBranches, storedCards } from './harness';

const card = { title: 'ok', columnId: 'todo', priority: 'medium', description: '', assignee: 'You' };

const malformed: [string, unknown][] = [
  ['a title that is an object', { type: 'CREATE_CARD', payload: { ...card, title: { pwned: 1 } } }],
  ['a priority that is an object', { type: 'CREATE_CARD', payload: { ...card, priority: { x: 1 } } }],
  ['a description that is a list', { type: 'CREATE_CARD', payload: { ...card, description: ['x'] } }],
  ['an unknown column', { type: 'CREATE_CARD', payload: { ...card, columnId: 'nowhere' } }],
  ['a title over 200 characters', { type: 'CREATE_CARD', payload: { ...card, title: 'x'.repeat(201) } }],
  ['a description over 20,000 characters', { type: 'CREATE_CARD', payload: { ...card, description: 'x'.repeat(20_001) } }],
  ['an extra field', { type: 'CREATE_CARD', payload: { ...card, extra: 'x' } }],
];

describe('malformed bridge messages', () => {
  it('stores nothing for a card with an empty title', async () => {
    const tab = await openTab();
    await tab.deliver({ type: 'CREATE_CARD', payload: { ...card, title: '' } });
    expect(tab.state().cards).toEqual([]);
    await openTab();
    expect(await storedCards()).toEqual([]);
  });

  it.each(malformed)('stores nothing for a card with %s', async (_label, frame) => {
    const tab = await openTab();
    await tab.deliver(frame);
    expect(tab.state().cards).toEqual([]);
    await openTab();
    expect(await storedCards()).toEqual([]);
  });

  it('stores nothing for a branch whose name is an object', async () => {
    const tab = await openTab();
    await tab.deliver({ type: 'CREATE_BRANCH', payload: { name: { pwned: 1 } } });
    expect(storedBranches().branches.map(([id]) => id)).toEqual(['main']);
  });

  it('never writes a received message to the console', async () => {
    const log = vi.mocked(console.log);
    const tab = await openTab();
    log.mockClear();
    await tab.deliver({ type: 'CREATE_CARD', payload: { ...card, title: 'private text' } });
    expect(JSON.stringify(log.mock.calls)).not.toContain('private text');
  });
});
