import { describe, expect, it } from 'vitest';
import { freeName, isNameTaken, normalizeName, resolveBranch, sameName } from '../../src/domain/names';
import type { BranchRecord } from '../../src/domain/types';

const branch = (id: string, name: string): BranchRecord => ({ id, boardId: 'board-1', name, createdAt: 1, createdFrom: null });
const branches = [branch('main', 'main'), branch('branch-2', 'Idea'), branch('branch-3', 'fix login')];

describe('branch names', () => {
  it('trims a name and refuses blank or over-long ones', () => {
    expect(normalizeName('  try it ')).toEqual({ ok: true, value: 'try it' });
    expect(normalizeName('   ')).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(normalizeName('n'.repeat(101))).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(normalizeName(undefined)).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
  });

  it('compares names ignoring case', () => {
    expect(sameName('Idea', 'idea')).toBe(true);
    expect(sameName('idea', 'idea2')).toBe(false);
  });

  it('a name is taken when another branch has it in any case, but not by the branch itself', () => {
    expect(isNameTaken('IDEA', branches)).toBe(true);
    expect(isNameTaken('idea', branches, 'branch-2')).toBe(false);
    expect(isNameTaken('ideas', branches)).toBe(false);
  });

  it('finds the first free numbered name, ignoring case', () => {
    expect(freeName('new', branches)).toBe('new');
    expect(freeName('idea', branches)).toBe('idea-2');
    expect(freeName('idea', [...branches, branch('b4', 'IDEA-2')])).toBe('idea-3');
  });
});

describe('resolving what the user typed to a branch', () => {
  it('takes an exact id first', () => {
    expect(resolveBranch('branch-3', branches)).toMatchObject({ ok: true, value: { id: 'branch-3' } });
    // An id wins even when another branch is named like it.
    expect(resolveBranch('main', [...branches, branch('b5', 'MAIN ')])).toMatchObject({ ok: true, value: { id: 'main' } });
  });

  it('then a name, ignoring case and surrounding spaces', () => {
    expect(resolveBranch(' idea ', branches)).toMatchObject({ ok: true, value: { id: 'branch-2' } });
    expect(resolveBranch('Fix Login', branches)).toMatchObject({ ok: true, value: { id: 'branch-3' } });
  });

  it('refuses an unknown name and changes nothing', () => {
    expect(resolveBranch('nope', branches)).toEqual({ ok: false, error: { code: 'unknown-branch' } });
    expect(resolveBranch('   ', branches)).toEqual({ ok: false, error: { code: 'unknown-branch' } });
  });

  it('refuses a name two branches share (old data), naming neither', () => {
    const old = [...branches, branch('branch-9', 'idea')];
    expect(resolveBranch('idea', old)).toEqual({ ok: false, error: { code: 'ambiguous-branch' } });
  });
});
