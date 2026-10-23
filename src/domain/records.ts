// Checks for every record read from storage and for command inputs. Pure, so every storage adapter
// and every command source gets the same rules. Reasons name the problem, never the stored content.
// Strict on new input, tolerant of old data: stored-record checks reject corruption (wrong types,
// missing ids, unknown columns or priorities), never a length or spacing that 0.0.2 could have stored.
// The limits apply to command inputs only.

import {
  COLUMN_IDS,
  COMMIT_REASONS,
  OP_COMMANDS,
  PRIORITIES,
  type BoardRecord,
  type BranchRecord,
  type CardFields,
  type CardRecord,
  type ColumnId,
  type ColumnRecord,
  type CommitRecord,
  type HeadRecord,
  type OpEntry,
  type Priority,
  type WorkingCopy,
} from './types';

export type Checked<T> = { ok: true; value: T } | { ok: false; reason: string };

// Limits for command inputs. Title, description, assignee and branch name match the 0.0.2 bridge checks.
export const LIMITS = { title: 200, description: 20_000, assignee: 100, branchName: 100, tags: 20, tag: 50 };

type Fields = Record<string, unknown>;
type Rule = (value: unknown) => string | null;

const isObject = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Input text, checked before trimming.
const text = (min: number, max: number): Rule => (value) => {
  if (typeof value !== 'string') return 'must be text';
  if (value.length < min || value.length > max) return `must be ${min} to ${max} characters`;
  if (min > 0 && value.trim() === '') return 'must not be blank';
  return null;
};

// Stored values: type checks only, so data written by 0.0.2 always reads back.
const anyText: Rule = (value) => (typeof value === 'string' ? null : 'must be text');
const nonEmptyText: Rule = (value) =>
  typeof value === 'string' && value.trim() !== '' ? null : 'must be text that is not blank';
const textList: Rule = (value) =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? null : 'must be a list of text';
const id = nonEmptyText;
const time: Rule = (value) => (typeof value === 'number' && Number.isFinite(value) ? null : 'must be a finite number');
const flag: Rule = (value) => (typeof value === 'boolean' ? null : 'must be true or false');
const oneOf = (options: readonly string[]): Rule => (value) =>
  typeof value === 'string' && options.includes(value) ? null : 'is not a known value';
const nullable = (rule: Rule): Rule => (value) => (value === null ? null : rule(value));
const nested = (check: (value: unknown) => Checked<unknown>): Rule => (value) => {
  const result = check(value);
  return result.ok ? null : result.reason;
};

const distinctList = (max: number, item: Rule): Rule => (value) => {
  if (!Array.isArray(value)) return 'must be a list';
  if (value.length > max) return `must have at most ${max} entries`;
  for (const entry of value) {
    const problem = item(entry);
    if (problem) return `entry ${problem}`;
  }
  return new Set(value).size === value.length ? null : 'must not repeat an entry';
};

// Checks the exact key set: required keys present, optional keys allowed, nothing else, nothing undefined.
function record<T>(kind: string, required: Record<string, Rule>, optional: Record<string, Rule> = {}) {
  return (value: unknown): Checked<T> => {
    if (!isObject(value)) return { ok: false, reason: `${kind}: is not an object` };
    for (const key of Object.keys(value)) {
      if (!(key in required) && !(key in optional)) return { ok: false, reason: `${kind}: unknown field ${key}` };
    }
    for (const [key, rule] of Object.entries({ ...required, ...optional })) {
      if (!(key in value)) {
        if (key in required) return { ok: false, reason: `${kind}: missing ${key}` };
        continue;
      }
      const problem = value[key] === undefined ? 'must not be undefined' : rule(value[key]);
      if (problem) return { ok: false, reason: `${kind}: ${key} ${problem}` };
    }
    return { ok: true, value: value as T };
  };
}

const cardRules = {
  id,
  title: anyText,
  description: anyText,
  priority: oneOf(PRIORITIES),
  tags: textList,
  columnId: oneOf(COLUMN_IDS),
  position: time,
  createdAt: time,
  updatedAt: time,
};
const cardOptional = { assignee: anyText };

export const checkBoard = record<BoardRecord>('board', { id, title: anyText, createdAt: time, updatedAt: time });

export const checkBranch = record<BranchRecord>('branch', {
  id,
  boardId: id,
  name: nonEmptyText,
  createdAt: time,
  createdFrom: nullable(id),
});

export const checkHead = record<HeadRecord>('head', { boardId: id, branchId: id });

export const checkCardFields = record<CardFields>('card', cardRules, cardOptional);

export const checkCard = record<CardRecord>('card', { ...cardRules, boardId: id, branchId: id }, cardOptional);

export const checkColumn = record<ColumnRecord>('column', {
  id: oneOf(COLUMN_IDS),
  title: anyText,
  position: time,
});

const distinctIds = (items: unknown[]) => new Set(items.map((item) => (item as { id: string }).id)).size === items.length;

const listOf = (check: (value: unknown) => Checked<unknown>): Rule => (value) => {
  if (!Array.isArray(value)) return 'must be a list';
  for (const item of value) {
    const problem = nested(check)(item);
    if (problem) return `has an invalid entry (${problem})`;
  }
  return distinctIds(value) ? null : 'must not repeat an id';
};

const checkState = record<CommitRecord['state']>('state', {
  cards: listOf(checkCardFields),
  columns: listOf(checkColumn),
});

export const checkCommit = record<CommitRecord>('commit', {
  id,
  boardId: id,
  parents: distinctList(2, id),
  createdAt: time,
  reason: oneOf(COMMIT_REASONS),
  state: nested(checkState),
});

export const checkWorkingCopy = record<WorkingCopy>('working copy', { boardId: id, branchId: id, baseCommitId: id, dirty: flag });

const opRecord = record<OpEntry>('op', {
  seq: (value) => (Number.isSafeInteger(value) && (value as number) >= 0 ? null : 'must be a whole number from 0'),
  command: oneOf(OP_COMMANDS),
  before: nullable(nested(checkCardFields)),
  after: nullable(nested(checkCardFields)),
});

export function checkOpEntry(value: unknown): Checked<OpEntry> {
  const result = opRecord(value);
  if (result.ok && result.value.before === null && result.value.after === null) {
    return { ok: false, reason: 'op: needs a before or an after value' };
  }
  return result;
}

// Command inputs: text is trimmed here, so stored records never start or end with spaces.

export interface CardInput {
  title?: string;
  description?: string;
  assignee?: string; // '' clears it
  priority?: Priority;
  columnId?: ColumnId;
  tags?: string[];
}

const cardInput = record<CardInput>('card input', {}, {
  title: text(1, LIMITS.title),
  description: text(0, LIMITS.description),
  assignee: text(0, LIMITS.assignee),
  priority: oneOf(PRIORITIES),
  columnId: oneOf(COLUMN_IDS),
  tags: distinctList(LIMITS.tags, text(1, LIMITS.tag)),
});

export function checkCardInput(value: unknown, { titleRequired = true } = {}): Checked<CardInput> {
  const result = cardInput(value);
  if (!result.ok) return result;
  const input = { ...result.value };
  if (input.title !== undefined) input.title = input.title.trim();
  if (input.assignee !== undefined) input.assignee = input.assignee.trim();
  if (input.tags !== undefined) input.tags = input.tags.map((tag) => tag.trim());
  if (titleRequired && input.title === undefined) return { ok: false, reason: 'card input: missing title' };
  if (input.tags && new Set(input.tags).size !== input.tags.length) {
    return { ok: false, reason: 'card input: tags must not repeat an entry' };
  }
  return { ok: true, value: input };
}

export function checkBranchName(value: unknown): Checked<string> {
  const problem = text(1, LIMITS.branchName)(value);
  return problem ? { ok: false, reason: `branch name ${problem}` } : { ok: true, value: (value as string).trim() };
}
