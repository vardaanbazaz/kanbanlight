// Option H: commits are full board states linked to their parents; each branch has a working copy
// based on a commit, plus a bounded log of changes since that commit. Every function is pure: it
// returns the new records and the storage batch that stores them, and writes nothing itself.

import { canonicalJson } from '../storage/json';
import type { Change, WorkingCopyState } from '../storage/types';
import { domainError, type DomainError } from './errors';
import type { Clock, IdSource } from './ids';
import { isNameTaken, normalizeName, type Resolved } from './names';
import type { CardInput } from './records';
import {
  COLUMNS,
  type BoardRecord,
  type BranchId,
  type BranchRecord,
  type CardFields,
  type CardRecord,
  type ColumnId,
  type CommitId,
  type CommitReason,
  type CommitRecord,
  type HeadRecord,
  type OpEntry,
} from './types';

export interface Env {
  clock: Clock;
  ids: IdSource;
}

export interface Applied<T> {
  value: T;
  batch: Change[];
}

export type Outcome<T> = ({ ok: true } & Applied<T>) | { ok: false; error: DomainError };

export const OP_LOG_LIMIT = 100;

const fail = (error: DomainError): { ok: false; error: DomainError } => ({ ok: false, error });

export function toFields(card: CardRecord): CardFields {
  const fields: Partial<CardRecord> = { ...card };
  delete fields.boardId;
  delete fields.branchId;
  return fields as CardFields;
}

const toRecord = (fields: CardFields, boardId: string, branchId: string): CardRecord => ({ ...fields, boardId, branchId });

// What the user sees of a card; the update time is not a change of its own.
const sameCard = (a: CardRecord, b: CardRecord) =>
  canonicalJson({ ...toFields(a), updatedAt: 0 }) === canonicalJson({ ...toFields(b), updatedAt: 0 });

const endOf = (cards: readonly CardRecord[], columnId: ColumnId) =>
  cards.filter((card) => card.columnId === columnId).reduce((last, card) => Math.max(last, card.position + 1), 0);

function withInput(card: CardRecord, input: CardInput): CardRecord {
  const next = { ...card };
  if (input.title !== undefined) next.title = input.title;
  if (input.description !== undefined) next.description = input.description;
  if (input.priority !== undefined) next.priority = input.priority;
  if (input.tags !== undefined) next.tags = [...input.tags];
  if (input.columnId !== undefined) next.columnId = input.columnId;
  if (input.assignee === '') delete next.assignee;
  else if (input.assignee !== undefined) next.assignee = input.assignee;
  return next;
}

export function createBoard(env: Env, title = 'My board'): Applied<{
  board: BoardRecord;
  branch: BranchRecord;
  head: HeadRecord;
  commit: CommitRecord;
  working: WorkingCopyState;
}> {
  const now = env.clock.now();
  const board: BoardRecord = { id: env.ids.next('board'), title, createdAt: now, updatedAt: now };
  const branch: BranchRecord = { id: env.ids.next('branch'), boardId: board.id, name: 'main', createdAt: now, createdFrom: null };
  const commit: CommitRecord = {
    id: env.ids.next('commit'),
    boardId: board.id,
    parents: [],
    createdAt: now,
    reason: 'board-created',
    state: { cards: [], columns: COLUMNS.map((column) => ({ ...column })) },
  };
  const head: HeadRecord = { boardId: board.id, branchId: branch.id };
  const working: WorkingCopyState = {
    copy: { boardId: board.id, branchId: branch.id, baseCommitId: commit.id, dirty: false },
    cards: [],
    ops: [],
  };
  return {
    value: { board, branch, head, commit, working },
    batch: [
      { kind: 'putBoard', board },
      { kind: 'putBranch', branch },
      { kind: 'putCommit', commit },
      { kind: 'setWorkingCopy', copy: working.copy },
      { kind: 'setHead', head },
    ],
  };
}

export type CardChange =
  | { command: 'card.create'; input: CardInput }
  | { command: 'card.update'; cardId: string; input: CardInput }
  | { command: 'card.move'; cardId: string; columnId: ColumnId; position?: number }
  | { command: 'card.delete'; cardId: string };

// One card change in a branch's working copy, logged with its before and after values.
export function applyCardChange(
  env: Env,
  working: WorkingCopyState,
  change: CardChange
): Outcome<{ working: WorkingCopyState; card: CardRecord | null }> {
  const { boardId, branchId } = working.copy;
  const before = change.command === 'card.create' ? null : (working.cards.find((card) => card.id === change.cardId) ?? null);
  if (change.command !== 'card.create' && !before) return fail(domainError('unknown-card'));
  const now = env.clock.now();

  let after: CardRecord | null;
  if (change.command === 'card.create') {
    if (change.input.title === undefined) return fail(domainError('invalid-input', 'a new card needs a title'));
    const columnId = change.input.columnId ?? 'backlog';
    const blank: CardRecord = {
      id: env.ids.next('card'),
      title: '',
      description: '',
      priority: 'medium',
      tags: [],
      columnId,
      position: endOf(working.cards, columnId),
      createdAt: now,
      updatedAt: now,
      boardId,
      branchId,
    };
    after = withInput(blank, change.input);
  } else if (change.command === 'card.update') {
    after = withInput(before!, change.input);
    if (after.columnId !== before!.columnId) after.position = endOf(working.cards, after.columnId);
  } else if (change.command === 'card.move') {
    const position =
      change.position ?? (change.columnId === before!.columnId ? before!.position : endOf(working.cards, change.columnId));
    after = { ...before!, columnId: change.columnId, position };
  } else {
    after = null;
  }

  if (before && after && sameCard(before, after)) return { ok: true, value: { working, card: before }, batch: [] };
  if (before && after) after.updatedAt = now;

  const entry: OpEntry = {
    seq: (working.ops[working.ops.length - 1]?.seq ?? -1) + 1,
    command: change.command,
    before: before && toFields(before),
    after: after && toFields(after),
  };
  const ops = [...working.ops, entry].slice(-OP_LOG_LIMIT);
  const cards = after
    ? before
      ? working.cards.map((card) => (card.id === after!.id ? after! : card))
      : [...working.cards, after]
    : working.cards.filter((card) => card.id !== before!.id);
  const copy = { ...working.copy, dirty: true };

  const batch: Change[] = [
    after ? { kind: 'putCard', card: after } : { kind: 'deleteCard', boardId, branchId, cardId: before!.id },
    { kind: 'appendOp', boardId, branchId, entry },
  ];
  if (ops.length < working.ops.length + 1) batch.push({ kind: 'trimOps', boardId, branchId, keepFromSeq: ops[0].seq });
  if (!working.copy.dirty) batch.push({ kind: 'setWorkingCopy', copy });
  return { ok: true, value: { working: { copy, cards, ops }, card: after }, batch };
}

// Turns a dirty working copy into a commit on top of its base. A clean copy writes nothing.
export function commitWorkingCopy(
  env: Env,
  working: WorkingCopyState,
  base: CommitRecord,
  reason: CommitReason
): Applied<{ working: WorkingCopyState; commit: CommitRecord | null }> {
  if (base.id !== working.copy.baseCommitId) throw new Error('commit base does not match the working copy');
  if (!working.copy.dirty) return { value: { working, commit: null }, batch: [] };
  const { boardId, branchId } = working.copy;
  const commit: CommitRecord = {
    id: env.ids.next('commit'),
    boardId,
    parents: [base.id],
    createdAt: env.clock.now(),
    reason,
    state: {
      cards: working.cards.map(toFields).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
      columns: base.state.columns,
    },
  };
  const copy = { ...working.copy, baseCommitId: commit.id, dirty: false };
  const batch: Change[] = [
    { kind: 'putCommit', commit },
    { kind: 'setWorkingCopy', copy },
  ];
  if (working.ops.length > 0) batch.push({ kind: 'clearOps', boardId, branchId });
  return { value: { working: { copy, cards: working.cards, ops: [] }, commit }, batch };
}

// A new branch starts at the source branch's latest state; a dirty source is committed first.
export function createBranch(
  env: Env,
  args: { name: unknown; branches: readonly BranchRecord[]; source: WorkingCopyState; sourceBase: CommitRecord }
): Outcome<{ branch: BranchRecord; working: WorkingCopyState; source: WorkingCopyState; commit: CommitRecord | null }> {
  const name = normalizeName(args.name);
  if (!name.ok) return name;
  if (isNameTaken(name.value, args.branches)) return fail(domainError('name-taken'));
  const committed = commitWorkingCopy(env, args.source, args.sourceBase, 'branch-created');
  const tip = committed.value.commit ?? args.sourceBase;
  const { boardId } = args.source.copy;
  const branch: BranchRecord = {
    id: env.ids.next('branch'),
    boardId,
    name: name.value,
    createdAt: env.clock.now(),
    createdFrom: args.source.copy.branchId,
  };
  const working: WorkingCopyState = {
    copy: { boardId, branchId: branch.id, baseCommitId: tip.id, dirty: false },
    cards: tip.state.cards.map((fields) => toRecord(fields, boardId, branch.id)),
    ops: [],
  };
  return {
    ok: true,
    value: { branch, working, source: committed.value.working, commit: committed.value.commit },
    batch: [
      ...committed.batch,
      { kind: 'putBranch', branch },
      { kind: 'setWorkingCopy', copy: working.copy },
      ...working.cards.map((card): Change => ({ kind: 'putCard', card })),
    ],
  };
}

// Moves the head to another branch; the branch being left is committed first if it changed.
export function switchBranch(
  env: Env,
  args: { branches: readonly BranchRecord[]; head: HeadRecord; current: WorkingCopyState; currentBase: CommitRecord; target: BranchId }
): Outcome<{ head: HeadRecord; current: WorkingCopyState; commit: CommitRecord | null }> {
  if (!args.branches.some((branch) => branch.id === args.target)) return fail(domainError('unknown-branch'));
  if (args.target === args.head.branchId) {
    return { ok: true, value: { head: args.head, current: args.current, commit: null }, batch: [] };
  }
  if (args.current.copy.branchId !== args.head.branchId) throw new Error('the current working copy is not the head branch');
  const committed = commitWorkingCopy(env, args.current, args.currentBase, 'switch');
  const head: HeadRecord = { boardId: args.head.boardId, branchId: args.target };
  return {
    ok: true,
    value: { head, current: committed.value.working, commit: committed.value.commit },
    batch: [...committed.batch, { kind: 'setHead', head }],
  };
}

// Every commit reachable from `start` through parents, itself included; null when one is missing.
function ancestors(start: CommitId, commits: ReadonlyMap<CommitId, CommitRecord>): Set<CommitId> | null {
  const seen = new Set<CommitId>();
  const queue = [start];
  while (queue.length > 0) {
    const id = queue.pop()!;
    if (seen.has(id)) continue;
    const commit = commits.get(id);
    if (!commit) return null;
    seen.add(id);
    queue.push(...commit.parents);
  }
  return seen;
}

// The nearest common ancestor of two commits (the merge base); null when they share none.
// With several equally near ones (criss-cross merges), the newest wins, then the smaller id.
export function mergeBase(a: CommitId, b: CommitId, commits: ReadonlyMap<CommitId, CommitRecord>): Resolved<CommitId | null> {
  const ofA = ancestors(a, commits);
  const ofB = ancestors(b, commits);
  if (!ofA || !ofB) return fail(domainError('missing-commit'));
  const common = [...ofA].filter((id) => ofB.has(id));
  const nearest = common.filter((id) => !common.some((other) => other !== id && ancestors(other, commits)!.has(id)));
  nearest.sort((x, y) => commits.get(y)!.createdAt - commits.get(x)!.createdAt || (x < y ? -1 : 1));
  return { ok: true, value: nearest[0] ?? null };
}

// Commits no branch can reach any more: what garbage collection may delete.
export function unreachableCommits(tips: readonly CommitId[], commits: readonly CommitRecord[]): CommitId[] {
  const byId = new Map(commits.map((commit) => [commit.id, commit]));
  const reached = new Set<CommitId>();
  const queue = [...tips];
  while (queue.length > 0) {
    const id = queue.pop()!;
    if (reached.has(id) || !byId.has(id)) continue;
    reached.add(id);
    queue.push(...byId.get(id)!.parents);
  }
  return commits.map((commit) => commit.id).filter((id) => !reached.has(id)).sort();
}
