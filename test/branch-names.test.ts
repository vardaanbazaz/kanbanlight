import { describe, expect, it } from 'vitest';
import { openTab, storedBranches, tick } from './harness';

describe('branch names sent over the bridge', () => {
  it('ignores a switch to a branch name it does not know', async () => {
    let tab = await openTab();
    await tab.deliver({ type: 'SWITCH_BRANCH', payload: 'nope' });
    expect(tab.state().activeBranchId).toBe('main');

    tab = await openTab();
    const saved = storedBranches();
    expect(saved.branches.map(([id]) => id)).toContain(saved.currentBranch);
    expect(tab.state().activeBranchId).toBe('main');
  });

  it('ignores a compare with a branch name it does not know', async () => {
    const tab = await openTab();
    await tab.state().createCard('on main', 'todo');
    await tab.deliver({ type: 'COMPARE_BRANCH', payload: 'nope' });
    expect(tab.state().isDiffModeActive).toBe(false);
  });

  it('a switch by name right after creating that branch leaves main intact', async () => {
    let tab = await openTab();
    await tab.state().createCard('on main', 'todo');
    await tab.deliver({ type: 'CREATE_BRANCH', payload: { name: 'y', checkout: true } });
    await tab.deliver({ type: 'SWITCH_BRANCH', payload: 'y' });
    await tick(30);
    await tab.state().createCard('on y', 'todo');

    tab = await openTab();
    const others = storedBranches()
      .branches.map(([id]) => id)
      .filter((id) => id !== 'main' && id !== tab.state().activeBranchId);
    // Leave main and come back so its saved copy is reloaded; leaving is what would save y's cards as main's.
    if (tab.state().activeBranchId === 'main' && others.length) await tab.branching.switchBranch(others[0]);
    await tab.branching.switchBranch('main');
    expect(tab.state().cards.map((card) => card.title)).toEqual(['on main']);
  });
});
