import { openDB } from 'idb';
import { expect, it } from 'vitest';
import { openTab, storedBranches } from './harness';

it('a branch pointer to an unknown branch never overwrites main', async () => {
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

it('a branch pointer to an unknown branch is kept as a branch named recovered, or the next free name', async () => {
  const branches = [
    ['main', { id: 'main', name: 'main' }],
    ['branch-1', { id: 'branch-1', name: 'recovered' }],
  ];
  localStorage.setItem('kanban-branches', JSON.stringify({ branches, currentBranch: 'phantom-1' }));
  const tab = await openTab();
  expect(tab.state().activeBranchId).toBe('phantom-1');
  expect(tab.branching.getCurrentBranch()).toMatchObject({ id: 'phantom-1', name: 'recovered-2', parentId: 'main' });
  expect(storedBranches().branches.map(([id]) => id)).toEqual(['main', 'branch-1', 'phantom-1']);
});

it.each([
  ['branches that are not a list', '{"branches":"x","currentBranch":"main"}'],
  ['an entry without a name', '{"branches":[["main",{"id":"main"}]],"currentBranch":"main"}'],
  ['a pointer that is not text', '{"branches":[["main",{"id":"main","name":"main"}]],"currentBranch":1}'],
])('a branch list with %s is reported and never overwritten', async (_label, saved) => {
  localStorage.setItem('kanban-branches', saved);
  const { branchingService } = await import('../src/services/BranchingService');
  expect(branchingService.loadError).toBe(true);
  branchingService.setActiveBranchId('main');
  expect(localStorage.getItem('kanban-branches')).toBe(saved);
});
