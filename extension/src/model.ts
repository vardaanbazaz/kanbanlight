// Board data: columns, cards, limits, the stored schema and its validation. No `vscode` import.
import { randomBytes } from 'node:crypto';

/** Git actions a column can run when a card moves into it. Later slices add more. */
export const GIT_ACTIONS = ['none', 'start'] as const;
export type GitAction = (typeof GIT_ACTIONS)[number];

export const LIMITS = { title: 200, description: 20_000, columnName: 50, columns: 20, cards: 500 } as const;
export const SCHEMA_VERSION = 1;

export interface Column {
  id: string;
  name: string;
  action: GitAction;
}

export interface Card {
  id: string;
  title: string;
  description: string;
  columnId: string;
  /** Assigned the first time the card starts work, then kept even if the title changes. */
  branch: string | null;
}

export interface BoardData {
  version: typeof SCHEMA_VERSION;
  columns: Column[];
  cards: Card[];
}

export const ID = /^[a-z0-9]{1,16}$/;
/** Every card branch: kl/ plus lowercase words joined by single hyphens. */
export const CARD_BRANCH = /^kl\/[a-z0-9]+(-[a-z0-9]+)*$/;

export function newId(): string {
  return randomBytes(6).toString('hex');
}

export function defaultBoard(): BoardData {
  const cols: Array<[string, GitAction]> = [
    ['Backlog', 'none'],
    ['To Do', 'none'],
    ['In Progress', 'start'],
    ['Review', 'none'],
    ['Done', 'none'],
  ];
  return { version: SCHEMA_VERSION, columns: cols.map(([name, action]) => ({ id: newId(), name, action })), cards: [] };
}

/** True for a string that, trimmed, is 1..max characters long. */
export function isName(v: unknown, max: number): v is string {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= max;
}

function hasKeys(o: Record<string, unknown>, keys: string): boolean {
  return Object.keys(o).sort().join(',') === keys;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Validates data read back from storage with the same limits as webview messages. Null if anything is off. */
export function parseBoard(raw: unknown): BoardData | null {
  if (!isObject(raw) || !hasKeys(raw, 'cards,columns,version') || raw.version !== SCHEMA_VERSION) return null;
  const { columns, cards } = raw;
  if (!Array.isArray(columns) || !Array.isArray(cards)) return null;
  if (columns.length < 1 || columns.length > LIMITS.columns || cards.length > LIMITS.cards) return null;
  const ids = new Set<string>();
  const freshId = (id: unknown): boolean => typeof id === 'string' && ID.test(id) && !ids.has(id) && !!ids.add(id);
  for (const c of columns) {
    if (!isObject(c) || !hasKeys(c, 'action,id,name') || !freshId(c.id)) return null;
    if (!isName(c.name, LIMITS.columnName) || !(GIT_ACTIONS as readonly unknown[]).includes(c.action)) return null;
  }
  const colIds = new Set(columns.map((c: Column) => c.id));
  const branches = new Set<string>();
  for (const c of cards) {
    if (!isObject(c) || !hasKeys(c, 'branch,columnId,description,id,title') || !freshId(c.id)) return null;
    if (!isName(c.title, LIMITS.title) || typeof c.description !== 'string' || c.description.length > LIMITS.description) return null;
    if (typeof c.columnId !== 'string' || !colIds.has(c.columnId)) return null;
    if (c.branch !== null && (typeof c.branch !== 'string' || !CARD_BRANCH.test(c.branch) || branches.has(c.branch))) return null;
    if (c.branch) branches.add(c.branch);
  }
  return raw as unknown as BoardData;
}

/** `base`, or `base-2`, `base-3`, ... : the first name no card in `taken` owns. */
export function uniqueBranch(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** The plain line under a column's name saying what moving a card there does in Git. */
export function actionLine(action: GitAction, base: string | null): string {
  if (action === 'none') return 'No Git action';
  return base
    ? `Moving a card here creates its branch from ${base} and switches to it`
    : 'Moving a card here switches to its branch (a new branch needs a main or master branch)';
}
