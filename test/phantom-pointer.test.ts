import { openDB } from 'idb';
import { expect, it } from 'vitest';
import { openTab, storedBranches } from './harness';

it.fails('a branch pointer to an unknown branch never overwrites main', async () => {
  let tab = await openTab();
  await tab.state().createCard('main card', 'todo');
  const other = await tab.branching.createBranch('other', 'main', '');
  await tab.branching.switchBranch('main');

  // State left behind by an earlier version: the pointer names a branch that is not listed,
  // and the working copy holds that branch's cards.
  const saved = storedBranches();
  localStorage.setItem('kanban-branches', JSON.stringify({ ...saved, currentBranch: 'phantom-1' }));
  const db = await openDB('kanban-light');
  const [mainCard] = await db.getAll('cards');
  await db.put('cards', { ...mainCard, id: 'card-phantom', title: 'phantom card' });
  db.close();

  tab = await openTab();
  await tab.branching.switchBranch(other.id);
  await tab.branching.switchBranch('main');
  expect(tab.state().cards.map((card) => card.title)).toEqual(['main card']);
});
