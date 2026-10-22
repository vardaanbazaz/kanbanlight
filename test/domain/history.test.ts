import { describe, expect, it } from 'vitest';
import {
  OP_LOG_LIMIT,
  applyCardChange,
  commitWorkingCopy,
  createBoard,
  createBranch,
  mergeBase,
  switchBranch,
  unreachableCommits,
  type CardChange,
  type Env,
} from '../../src/domain/history';
import { counterClock, counterIds } from '../../src/domain/ids';
import type { CommitRecord } from '../../src/domain/types';
import type { WorkingCopyState } from '../../src/storage/types';

const env = (): Env => {
  const counter = { value: 0 };
  return { clock: counterClock({ value: 1000 }), ids: counterIds(counter) };
};

function change(e: Env, working: WorkingCopyState, cardChange: CardChange) {
  const result = applyCardChange(e, working, cardChange);
  if (!result.ok) throw new Error(`refused: ${result.error.code}`);
  return result;
}

const kinds = (batch: { kind: string }[]) => batch.map((item) => item.kind);

describe('a new board', () => {
  it('has main, an empty root commit, a clean working copy and the head on main', () => {
    const { value, batch } = createBoard(env());
    expect(value.branch.name).toBe('main');
    expect(value.commit.parents).toEqual([]);
    expect(value.commit.state.cards).toEqual([]);
    expect(value.commit.state.columns.map((column) => column.id)).toEqual(['backlog', 'todo', 'in-progress', 'review', 'done']);
    expect(value.working.copy).toEqual({ boardId: value.board.id, branchId: value.branch.id, baseCommitId: value.commit.id, dirty: false });
    expect(value.head).toEqual({ boardId: value.board.id, branchId: value.branch.id });
    expect(kinds(batch)).toEqual(['putBoard', 'putBranch', 'putCommit', 'setWorkingCopy', 'setHead']);
  });
});

describe('card changes', () => {
  it('create puts the card at the end of its column, logs it and marks the copy dirty once', () => {
    const e = env();
    const { working } = createBoard(e).value;
    const first = change(e, working, { command: 'card.create', input: { title: 'One', columnId: 'todo' } });
    expect(first.value.card).toMatchObject({ title: 'One', columnId: 'todo', position: 0, priority: 'medium', description: '', tags: [] });
    expect(first.value.card).not.toHaveProperty('assignee');
    expect(kinds(first.batch)).toEqual(['putCard', 'appendOp', 'setWorkingCopy']);
    const second = change(e, first.value.working, { command: 'card.create', input: { title: 'Two', columnId: 'todo' } });
    expect(second.value.card?.position).toBe(1);
    expect(kinds(second.batch)).toEqual(['putCard', 'appendOp']);
    expect(second.value.working.ops.map((op) => [op.seq, op.command, op.before, op.after?.title])).toEqual([
      [0, 'card.create', null, 'One'],
      [1, 'card.create', null, 'Two'],
    ]);
  });

  it('update keeps before and after values; clearing the assignee removes it', () => {
    const e = env();
    let { working } = createBoard(e).value;
    working = change(e, working, { command: 'card.create', input: { title: 'One', assignee: 'You' } }).value.working;
    const id = working.cards[0].id;
    const updated = change(e, working, { command: 'card.update', cardId: id, input: { title: 'Uno', assignee: '' } });
    expect(updated.value.card).not.toHaveProperty('assignee');
    const entry = updated.value.working.ops[1];
    expect([entry.before?.title, entry.before?.assignee, entry.after?.title]).toEqual(['One', 'You', 'Uno']);
    expect(updated.value.card!.updatedAt).toBeGreaterThan(updated.value.card!.createdAt);
  });

  it('a change that changes nothing writes nothing', () => {
    const e = env();
    let { working } = createBoard(e).value;
    working = change(e, working, { command: 'card.create', input: { title: 'One', columnId: 'todo' } }).value.working;
    const id = working.cards[0].id;
    for (const noop of [
      { command: 'card.update', cardId: id, input: { title: 'One' } },
      { command: 'card.move', cardId: id, columnId: 'todo' },
    ] as CardChange[]) {
      const result = change(e, working, noop);
      expect(result.batch).toEqual([]);
      expect(result.value.working).toBe(working);
    }
  });

  it('moving to another column puts the card at its end; delete removes it', () => {
    const e = env();
    let { working } = createBoard(e).value;
    working = change(e, working, { command: 'card.create', input: { title: 'A', columnId: 'done' } }).value.working;
    working = change(e, working, { command: 'card.create', input: { title: 'B', columnId: 'todo' } }).value.working;
    const b = working.cards[1].id;
    const moved = change(e, working, { command: 'card.move', cardId: b, columnId: 'done' });
    expect(moved.value.card).toMatchObject({ columnId: 'done', position: 1 });
    const deleted = change(e, moved.value.working, { command: 'card.delete', cardId: b });
    expect(deleted.value.working.cards.map((card) => card.title)).toEqual(['A']);
    expect(kinds(deleted.batch)).toEqual(['deleteCard', 'appendOp']);
    expect(deleted.value.working.ops[deleted.value.working.ops.length - 1]).toMatchObject({ command: 'card.delete', after: null });
  });

  it('refuses an unknown card and a new card without a title', () => {
    const { working } = createBoard(env()).value;
    expect(applyCardChange(env(), working, { command: 'card.delete', cardId: 'nope' })).toEqual({ ok: false, error: { code: 'unknown-card' } });
    expect(applyCardChange(env(), working, { command: 'card.create', input: {} })).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
  });

  it(`keeps the last ${OP_LOG_LIMIT} changes, dropping the oldest in the same batch`, () => {
    const e = env();
    let { working } = createBoard(e).value;
    working = change(e, working, { command: 'card.create', input: { title: 'x' } }).value.working;
    const id = working.cards[0].id;
    let last;
    for (let n = 1; n <= OP_LOG_LIMIT; n += 1) {
      last = change(e, working, { command: 'card.update', cardId: id, input: { title: `x${n}` } });
      working = last.value.working;
    }
    expect(working.ops).toHaveLength(OP_LOG_LIMIT);
    expect(working.ops[0].seq).toBe(1);
    expect(last!.batch).toContainEqual({ kind: 'trimOps', boardId: working.copy.boardId, branchId: working.copy.branchId, keepFromSeq: 1 });
  });
});

describe('commits, branches and switching', () => {
  it('a commit records the working copy on top of its base and clears the log; a clean copy writes nothing', () => {
    const e = env();
    const created = createBoard(e).value;
    const clean = commitWorkingCopy(e, created.working, created.commit, 'switch');
    expect(clean).toEqual({ value: { working: created.working, commit: null }, batch: [] });
    const working = change(e, created.working, { command: 'card.create', input: { title: 'One' } }).value.working;
    const { value, batch } = commitWorkingCopy(e, working, created.commit, 'switch');
    expect(value.commit).toMatchObject({ parents: [created.commit.id], reason: 'switch' });
    expect(value.commit!.state.cards.map((card) => card.title)).toEqual(['One']);
    expect(value.commit!.state.cards[0]).not.toHaveProperty('branchId');
    expect(value.working.copy).toMatchObject({ baseCommitId: value.commit!.id, dirty: false });
    expect(value.working.ops).toEqual([]);
    expect(kinds(batch)).toEqual(['putCommit', 'setWorkingCopy', 'clearOps']);
  });

  it('a branch made from a dirty branch commits it first and starts with the same cards', () => {
    const e = env();
    const created = createBoard(e).value;
    const working = change(e, created.working, { command: 'card.create', input: { title: 'One' } }).value.working;
    const result = createBranch(e, { name: ' idea ', branches: [created.branch], source: working, sourceBase: created.commit });
    if (!result.ok) throw new Error('refused');
    const { branch, working: fresh, source, commit } = result.value;
    expect(branch).toMatchObject({ name: 'idea', createdFrom: created.branch.id });
    expect(commit?.reason).toBe('branch-created');
    expect(source.copy).toMatchObject({ baseCommitId: commit!.id, dirty: false });
    expect(fresh.copy).toMatchObject({ branchId: branch.id, baseCommitId: commit!.id, dirty: false });
    expect(fresh.cards.map((card) => [card.title, card.branchId])).toEqual([['One', branch.id]]);
    expect(kinds(result.batch)).toEqual(['putCommit', 'setWorkingCopy', 'clearOps', 'putBranch', 'setWorkingCopy', 'putCard']);
  });

  it('a branch made from a clean branch starts at its base and writes no commit', () => {
    const e = env();
    const created = createBoard(e).value;
    const result = createBranch(e, { name: 'idea', branches: [created.branch], source: created.working, sourceBase: created.commit });
    expect(result.ok && result.value.commit).toBe(null);
    expect(result.ok && result.value.working.copy.baseCommitId).toBe(created.commit.id);
  });

  it('refuses a taken name in any case, and a blank one', () => {
    const e = env();
    const created = createBoard(e).value;
    const args = { branches: [created.branch], source: created.working, sourceBase: created.commit };
    expect(createBranch(e, { ...args, name: 'MAIN' })).toEqual({ ok: false, error: { code: 'name-taken' } });
    expect(createBranch(e, { ...args, name: '  ' })).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
  });

  it('switching commits a dirty branch, moves the head, and refuses an unknown branch', () => {
    const e = env();
    const created = createBoard(e).value;
    const made = createBranch(e, { name: 'idea', branches: [created.branch], source: created.working, sourceBase: created.commit });
    if (!made.ok) throw new Error('refused');
    const branches = [created.branch, made.value.branch];
    const dirty = change(e, created.working, { command: 'card.create', input: { title: 'One' } }).value.working;
    const args = { branches, head: created.head, current: dirty, currentBase: created.commit };
    const switched = switchBranch(e, { ...args, target: made.value.branch.id });
    if (!switched.ok) throw new Error('refused');
    expect(switched.value.head.branchId).toBe(made.value.branch.id);
    expect(switched.value.commit?.reason).toBe('switch');
    expect(kinds(switched.batch)).toEqual(['putCommit', 'setWorkingCopy', 'clearOps', 'setHead']);
    expect(switchBranch(e, { ...args, target: 'nope' })).toEqual({ ok: false, error: { code: 'unknown-branch' } });
    expect(switchBranch(e, { ...args, target: created.branch.id })).toMatchObject({ ok: true, batch: [] });
  });
});

describe('merge base and unreachable commits', () => {
  const commit = (id: string, parents: string[], createdAt: number): CommitRecord => ({
    id,
    boardId: 'b',
    parents,
    createdAt,
    reason: 'switch',
    state: { cards: [], columns: [] },
  });
  //   root ─ a ─ c ─ m (merge of c and d)
  //        └ b ─ d ┘
  const graph = [commit('root', [], 1), commit('a', ['root'], 2), commit('b', ['root'], 3), commit('c', ['a'], 4), commit('d', ['b'], 5), commit('m', ['c', 'd'], 6), commit('e', ['d'], 7)];
  const commits = new Map(graph.map((item) => [item.id, item]));

  it('finds the nearest common ancestor', () => {
    expect(mergeBase('c', 'd', commits)).toEqual({ ok: true, value: 'root' });
    expect(mergeBase('m', 'e', commits)).toEqual({ ok: true, value: 'd' });
    expect(mergeBase('c', 'm', commits)).toEqual({ ok: true, value: 'c' });
    expect(mergeBase('m', 'm', commits)).toEqual({ ok: true, value: 'm' });
  });

  it('picks the newest of several equally near ancestors (criss-cross)', () => {
    const cross = new Map(commits);
    cross.set('x', commit('x', ['c', 'd'], 8));
    cross.set('y', commit('y', ['d', 'c'], 9));
    expect(mergeBase('x', 'y', cross)).toEqual({ ok: true, value: 'd' });
  });

  it('says when commits share no ancestor, and when a commit is missing', () => {
    const apart = new Map(commits);
    apart.set('other', commit('other', [], 10));
    expect(mergeBase('m', 'other', apart)).toEqual({ ok: true, value: null });
    expect(mergeBase('m', 'gone', commits)).toEqual({ ok: false, error: { code: 'missing-commit' } });
  });

  it('lists only commits no tip can reach', () => {
    expect(unreachableCommits(['m'], graph)).toEqual(['e']);
    expect(unreachableCommits(['m', 'e'], graph)).toEqual([]);
    expect(unreachableCommits(['c'], graph)).toEqual(['b', 'd', 'e', 'm']);
  });
});
