import { describe, expect, it } from 'vitest';
import {
  checkBoard,
  checkBranch,
  checkBranchName,
  checkCard,
  checkCardInput,
  checkCommit,
  checkHead,
  checkOpEntry,
  checkWorkingCopy,
} from '../../src/domain/records';
import { COLUMNS, type CardFields } from '../../src/domain/types';

const card: CardFields = {
  id: 'card-1',
  title: 'Fix login',
  description: '',
  priority: 'medium',
  tags: [],
  columnId: 'todo',
  position: 0,
  createdAt: 1,
  updatedAt: 1,
};

const valid = {
  board: { id: 'board-1', title: 'My board', createdAt: 1, updatedAt: 2 },
  branch: { id: 'branch-1', boardId: 'board-1', name: 'main', createdAt: 1, createdFrom: null },
  head: { boardId: 'board-1', branchId: 'branch-1' },
  card: { ...card, assignee: 'You', tags: ['ui'], boardId: 'board-1', branchId: 'branch-1' },
  commit: {
    id: 'commit-1',
    boardId: 'board-1',
    parents: [],
    createdAt: 1,
    reason: 'board-created',
    state: { cards: [card], columns: [...COLUMNS] },
  },
  working: { boardId: 'board-1', branchId: 'branch-1', baseCommitId: 'commit-1', dirty: false },
  op: { seq: 0, command: 'card.update', before: card, after: { ...card, title: 'Fix logout' } },
};

const reasonOf = (result: { ok: boolean; reason?: string }) => (result.ok ? 'accepted' : result.reason);

describe('stored records are checked before use', () => {
  it('accepts one valid record of every kind', () => {
    expect(checkBoard(valid.board)).toEqual({ ok: true, value: valid.board });
    expect(checkBranch(valid.branch).ok).toBe(true);
    expect(checkHead(valid.head).ok).toBe(true);
    expect(checkCard(valid.card).ok).toBe(true);
    expect(checkCommit(valid.commit).ok).toBe(true);
    expect(checkWorkingCopy(valid.working).ok).toBe(true);
    expect(checkOpEntry(valid.op).ok).toBe(true);
  });

  it.each([
    ['not an object', checkBoard, 'board'],
    ['an array', checkBoard, []],
    ['an extra key', checkBoard, { ...valid.board, owner: 'x' }],
    ['a missing key', checkBoard, { id: 'board-1', title: 'x', createdAt: 1 }],
    ['a key set to undefined', checkCard, { ...valid.card, assignee: undefined }],
    ['an empty id', checkBoard, { ...valid.board, id: '' }],
    ['a time that is not a number', checkBoard, { ...valid.board, createdAt: '1' }],
    ['a time that is not finite', checkBoard, { ...valid.board, updatedAt: Infinity }],
    ['a blank branch name', checkBranch, { ...valid.branch, name: '   ' }],
    ['a branch without a board', checkBranch, { ...valid.branch, boardId: undefined }],
    ['a head without a branch', checkHead, { boardId: 'board-1' }],
    ['a card title that is an object', checkCard, { ...valid.card, title: { text: 'x' } }],
    ['a description that is an array', checkCard, { ...valid.card, description: ['x'] }],
    ['an unknown priority', checkCard, { ...valid.card, priority: 'urgent' }],
    ['an unknown column', checkCard, { ...valid.card, columnId: 'nowhere' }],
    ['a tag that is not text', checkCard, { ...valid.card, tags: [1] }],
    ['a card without a board', checkCard, { ...valid.card, boardId: undefined }],
    ['a card without a branch', checkCard, Object.fromEntries(Object.entries(valid.card).filter(([key]) => key !== 'branchId'))],
    ['three parents', checkCommit, { ...valid.commit, parents: ['a', 'b', 'c'] }],
    ['the same parent twice', checkCommit, { ...valid.commit, parents: ['a', 'a'] }],
    ['an unknown commit reason', checkCommit, { ...valid.commit, reason: 'because' }],
    ['a commit card with a branch id', checkCommit, { ...valid.commit, state: { cards: [valid.card], columns: [...COLUMNS] } }],
    ['the same card twice in a commit', checkCommit, { ...valid.commit, state: { cards: [card, card], columns: [...COLUMNS] } }],
    ['an unknown column in a commit', checkCommit, { ...valid.commit, state: { cards: [], columns: [{ id: 'x', title: 'X', position: 0 }] } }],
    ['a working copy whose dirty flag is not true or false', checkWorkingCopy, { ...valid.working, dirty: 'no' }],
    ['a negative op sequence number', checkOpEntry, { ...valid.op, seq: -1 }],
    ['a fractional op sequence number', checkOpEntry, { ...valid.op, seq: 1.5 }],
    ['an op for an unknown command', checkOpEntry, { ...valid.op, command: 'branch.switch' }],
    ['an op with neither before nor after', checkOpEntry, { ...valid.op, before: null, after: null }],
  ])('rejects %s', (_name, check: (value: unknown) => { ok: boolean }, value) => {
    expect(check(value).ok).toBe(false);
  });

  it('accepts every value the 0.0.2 web app could store, whatever its length or spacing', () => {
    const old = {
      ...valid.card,
      title: '  ' + 't'.repeat(500) + '  ',
      description: 'd'.repeat(50_000),
      assignee: 'Unassigned',
      tags: [...Array.from({ length: 25 }, (_, n) => `tag ${n}`), 'x'.repeat(60), 'tag 0'],
    };
    expect(checkCard(old)).toEqual({ ok: true, value: old });
    expect(checkCard({ ...valid.card, title: '', assignee: '' }).ok).toBe(true);
    expect(checkBranch({ ...valid.branch, name: ' ' + 'b'.repeat(300) }).ok).toBe(true);
    expect(checkBranch({ ...valid.branch, id: 'branch-' + 'x'.repeat(200) }).ok).toBe(true);
  });

  it('names the problem without repeating the stored content', () => {
    const result = checkCard({ ...valid.card, title: { secret: 'card text' } });
    expect(reasonOf(result)).toBe('card: title must be text');
    expect(reasonOf(result)).not.toContain('card text');
  });
});

describe('command inputs are checked', () => {
  it('trims a card title and keeps the fields it was given', () => {
    expect(checkCardInput({ title: '  Fix login  ', priority: 'high' })).toEqual({
      ok: true,
      value: { title: 'Fix login', priority: 'high' },
    });
  });

  it.each([
    ['an empty object', {}],
    ['a blank title', { title: '   ' }],
    ['an unknown field', { title: 'x', owner: 'y' }],
    ['an unknown column', { title: 'x', columnId: 'nowhere' }],
    ['a description over 20,000 characters', { title: 'x', description: 'd'.repeat(20_001) }],
    ['a title over 200 characters', { title: 't'.repeat(201) }],
    ['an assignee over 100 characters', { title: 'x', assignee: 'a'.repeat(101) }],
    ['21 tags', { title: 'x', tags: Array.from({ length: 21 }, (_, n) => `t${n}`) }],
    ['a tag over 50 characters', { title: 'x', tags: ['t'.repeat(51)] }],
    ['the same tag twice once trimmed', { title: 'x', tags: ['ui', ' ui '] }],
  ])('rejects a card input with %s', (_name, value) => {
    expect(checkCardInput(value).ok).toBe(false);
  });

  it('accepts a card input without a title when the title is not required', () => {
    expect(checkCardInput({ columnId: 'done' }, { titleRequired: false })).toEqual({
      ok: true,
      value: { columnId: 'done' },
    });
  });

  it('trims a branch name and refuses blank or long ones', () => {
    expect(checkBranchName('  idea ')).toEqual({ ok: true, value: 'idea' });
    expect(checkBranchName('   ').ok).toBe(false);
    expect(checkBranchName('b'.repeat(101)).ok).toBe(false);
    expect(checkBranchName(42).ok).toBe(false);
  });
});
