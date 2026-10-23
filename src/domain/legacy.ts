// Converts a 0.0.2 board (the `kanban-light` v2 database and the `kanban-branches` list, in the
// shape of the recovery download) into new records, showing on each branch what 0.0.2 showed there.
// Tolerant of old data: values are tidied and repaired, never refused for a limit 0.0.2 did not
// enforce, and every change is listed. Only an unreadable branch list fails the conversion.

import { canonicalJson } from '../storage/json';
import type { Change } from '../storage/types';
import type { Env } from './history';
import { freeName, sameName } from './names';
import type { Checked } from './records';
import {
  COLUMN_IDS,
  COLUMNS,
  PRIORITIES,
  type BranchRecord,
  type CardFields,
  type ColumnId,
  type CommitRecord,
  type JsonValue,
  type Priority,
} from './types';

export interface LegacyData {
  indexedDB: Record<string, unknown[]>;
  localStorage: Record<string, string>;
}

// What migration changed. Ids and fixed wording only, except a rename, which names both names.
export interface MigrationNote {
  branchId?: string;
  cardId?: string;
  what: string;
}

export interface Converted {
  boardId: string;
  batch: Change[];
  notes: MigrationNote[];
}

type Fields = Record<string, unknown>;
type Listed = { id: string; name: unknown; parentId: unknown; createdAt: unknown; boardSnapshot: unknown };

const isObject = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);
const isTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isId = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';

// The same check 0.0.2 made before loading the list; anything it refused fails here too.
function readBranchList(saved: string | undefined): { entries: [string, Fields][]; current: string } | null {
  if (saved === undefined) return { entries: [], current: 'main' };
  try {
    const data = JSON.parse(saved);
    const isEntry = (entry: unknown) =>
      Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1]?.id === 'string' && typeof entry[1]?.name === 'string';
    if (!Array.isArray(data?.branches) || !data.branches.every(isEntry) || typeof data.currentBranch !== 'string') return null;
    return { entries: data.branches, current: data.currentBranch || 'main' };
  } catch {
    return null;
  }
}

function textOf(value: unknown): string {
  if (value === undefined) return '';
  return isObject(value) || Array.isArray(value) ? JSON.stringify(value) : String(value);
}

// One card as 0.0.2 kept it, tidied and repaired. Returns null (and a note) only for a non-object.
function toCard(env: Env, raw: unknown, index: number, ids: Set<string>, now: number, note: (what: string, cardId?: string) => void): CardFields | null {
  if (!isObject(raw)) {
    note(`entry ${index} is not a card and was skipped`);
    return null;
  }
  let id = raw.id;
  if (!isId(id) || ids.has(id)) {
    const why = !isId(id) ? 'had no usable id' : 'repeated another card id';
    id = env.ids.next('card');
    note(`${why}; given a new id`, id as string);
  }
  const cardId = id as string;
  ids.add(cardId);
  const fix = (what: string) => note(what, cardId);

  let title = typeof raw.title === 'string' ? raw.title : textOf(raw.title);
  if (typeof raw.title !== 'string') fix('title was not text; converted');
  if (title.trim() !== title) fix('title trimmed');
  title = title.trim();

  const description = typeof raw.description === 'string' ? raw.description : '';
  if (typeof raw.description !== 'string') fix('description was not text; emptied');

  const priority: Priority = (PRIORITIES as readonly unknown[]).includes(raw.priority) ? (raw.priority as Priority) : 'medium';
  if (priority !== raw.priority) fix('unknown priority; set to medium');

  const columnId: ColumnId = (COLUMN_IDS as readonly unknown[]).includes(raw.columnId) ? (raw.columnId as ColumnId) : 'backlog';
  if (columnId !== raw.columnId) fix('unknown column; moved to backlog');

  const tags: string[] = [];
  if (raw.tags !== undefined && !Array.isArray(raw.tags)) fix('tags were not a list; emptied');
  for (const tag of Array.isArray(raw.tags) ? raw.tags : []) {
    if (typeof tag !== 'string' || tag.trim() === '') fix('an empty or non-text tag was dropped');
    else if (tags.includes(tag.trim())) fix('a repeated tag was dropped');
    else {
      if (tag.trim() !== tag) fix('tag trimmed');
      tags.push(tag.trim());
    }
  }

  const card: CardFields = { id: cardId, title, description, priority, tags, columnId, position: index, createdAt: now, updatedAt: now };
  if (isTime(raw.position)) card.position = raw.position;
  else fix('position was not a number; set from the list order');
  if (isTime(raw.createdAt)) card.createdAt = raw.createdAt;
  else fix('creation time was not a number; set');
  if (isTime(raw.updatedAt)) card.updatedAt = raw.updatedAt;
  else {
    card.updatedAt = card.createdAt;
    fix('update time was not a number; set');
  }
  if (typeof raw.assignee === 'string' && raw.assignee.trim() !== '' && raw.assignee.trim() !== 'Unassigned') {
    if (raw.assignee.trim() !== raw.assignee) fix('assignee trimmed');
    card.assignee = raw.assignee.trim();
  } else if (raw.assignee !== undefined) {
    fix('empty, "Unassigned" or non-text assignee dropped');
  }
  return card;
}

const sameCards = (a: CardFields[], b: CardFields[]) => {
  const sorted = (cards: CardFields[]) => canonicalJson([...cards].sort((x, y) => (x.id < y.id ? -1 : 1)));
  return sorted(a) === sorted(b);
};

export function convertLegacy(env: Env, data: LegacyData): Checked<Converted> {
  const listed = readBranchList(data.localStorage['kanban-branches']);
  if (!listed) return { ok: false, reason: 'the 0.0.2 branch list cannot be read' };
  const now = env.clock.now();
  const notes: MigrationNote[] = [];
  const store = (name: string) => (Array.isArray(data.indexedDB[name]) ? data.indexedDB[name] : []);

  // 0.0.2 opened the first stored board.
  const legacyBoard = store('boards').find(isObject) ?? {};
  const boardId = isId(legacyBoard.id) ? legacyBoard.id : 'default-board';
  const boardTitle = typeof legacyBoard.title === 'string' && legacyBoard.title.trim() !== '' ? legacyBoard.title.trim() : 'My board';
  const boardCreated = isTime(legacyBoard.createdAt) ? legacyBoard.createdAt : now;

  // The branch list as 0.0.2 loaded it: a Map (a repeated id keeps its first place, last value),
  // an unlisted pointer listed as `recovered`, and main present.
  const branches = new Map<string, Listed>();
  for (const [id, value] of listed.entries) branches.set(id, { ...value, id } as Listed);
  let current = listed.current;
  if (!branches.has(current) && current !== 'main') {
    const taken = [...branches.values()].map((branch) => ({ name: String(branch.name) }) as BranchRecord);
    branches.set(current, { id: current, name: freeName('recovered', taken), parentId: 'main', createdAt: now, boardSnapshot: null });
    notes.push({ branchId: current, what: 'the current branch was not listed; listed as recovered' });
  }
  if (!branches.has('main')) {
    branches.set('main', { id: 'main', name: 'main', parentId: null, createdAt: now, boardSnapshot: null });
    notes.push({ branchId: 'main', what: 'main was not listed; recreated' });
  }

  // A blank id cannot be stored; such a branch gets a new id.
  const order = [...branches.values()].map((branch) => {
    if (isId(branch.id)) return branch;
    const id = env.ids.next('branch');
    if (current === branch.id) current = id;
    notes.push({ branchId: id, what: 'had a blank id; given a new id' });
    return { ...branch, id };
  });
  for (const branch of order) {
    if (!isTime(branch.createdAt)) {
      branch.createdAt = now;
      notes.push({ branchId: branch.id, what: 'creation time was not a number; set' });
    }
  }
  // Creation order, main first (stable, so equal times keep the list order).
  order.sort((a, b) => (a.id === 'main' ? -1 : b.id === 'main' ? 1 : (a.createdAt as number) - (b.createdAt as number)));
  const main = order[0];
  const oldest = Math.min(...order.slice(1).map((branch) => branch.createdAt as number));
  if (oldest <= (main.createdAt as number)) {
    main.createdAt = oldest - 1;
    notes.push({ branchId: 'main', what: 'creation time moved before every other branch, so main is listed first' });
  }

  const snapshots = store('snapshots').filter(isObject);
  const known = new Set(order.map((branch) => branch.id));
  const phantom = snapshots.filter((snapshot) => !known.has(typeof snapshot.branchId === 'string' ? snapshot.branchId : 'main')).length;
  if (phantom > 0) notes.push({ what: `${phantom} snapshots of branches that are not listed were not migrated` });

  const records: BranchRecord[] = [];
  const commits = new Map<string, CommitRecord>();
  const batch: Change[] = [{ kind: 'putBoard', board: { id: boardId, title: boardTitle, createdAt: boardCreated, updatedAt: now } }];

  for (const branch of order) {
    const note = (what: string, cardId?: string) => notes.push(cardId === undefined ? { branchId: branch.id, what } : { branchId: branch.id, cardId, what });
    const raw = typeof branch.name === 'string' ? branch.name.trim() : '';
    // A taken name is renamed after the first branch that has it: `Idea` after `idea` becomes `idea-3`.
    const holder = records.find((record) => sameName(record.name, raw === '' ? 'branch' : raw));
    const name = freeName(holder ? holder.name : raw === '' ? 'branch' : raw, records);
    if (name !== branch.name) note(`renamed from "${String(branch.name)}" to "${name}"`);
    const earlier = records.find((record) => record.id === branch.parentId);
    const createdFrom = branch.id === main.id ? null : (earlier ?? records[0]).id;
    records.push({ id: branch.id, boardId, name, createdAt: branch.createdAt as number, createdFrom });

    // The newest snapshot with data, as 0.0.2 found it (no branchId counts as main; ties keep store order).
    const latest = snapshots
      .filter((snapshot) => (typeof snapshot.branchId === 'string' ? snapshot.branchId : 'main') === branch.id)
      .sort((a, b) => (isTime(b.timestamp) ? b.timestamp : 0) - (isTime(a.timestamp) ? a.timestamp : 0))[0];
    let source: unknown[];
    if (latest && isObject(latest.data)) {
      source = Array.isArray(latest.data.cards) ? latest.data.cards : [];
    } else {
      const fork = isObject(branch.boardSnapshot) && Array.isArray(branch.boardSnapshot.cards) ? branch.boardSnapshot.cards : [];
      source = fork;
      note(fork.length ? 'had no snapshot; started from the board it was created from' : 'had no snapshot; started empty');
    }
    const ids = new Set<string>();
    const cards = source.map((card, index) => toCard(env, card, index, ids, now, note)).filter((card): card is CardFields => card !== null);
    const commit: CommitRecord = {
      id: env.ids.next('commit'),
      boardId,
      parents: createdFrom === null ? [] : [commits.get(createdFrom)!.id],
      createdAt: latest && isTime(latest.timestamp) ? latest.timestamp : (branch.createdAt as number),
      reason: 'migration',
      state: { cards, columns: COLUMNS.map((column) => ({ ...column })) },
    };
    commits.set(branch.id, commit);

    // The current branch shows the live cards store; every other branch its snapshot.
    let working = cards;
    if (branch.id === current) {
      const ids = new Set<string>();
      const live = store('cards').filter((card) => !isObject(card) || card.boardId === undefined || card.boardId === boardId);
      const other = store('cards').length - live.length;
      if (other > 0) note(`${other} cards of another board were not migrated`);
      working = live.map((card, index) => toCard(env, card, index, ids, now, note)).filter((card): card is CardFields => card !== null);
    }
    batch.push(
      { kind: 'putBranch', branch: records[records.length - 1] },
      { kind: 'putCommit', commit },
      ...working.map((card): Change => ({ kind: 'putCard', card: { ...card, boardId, branchId: branch.id } })),
      { kind: 'setWorkingCopy', copy: { boardId, branchId: branch.id, baseCommitId: commit.id, dirty: !sameCards(working, cards) } }
    );
  }
  batch.push({ kind: 'setHead', head: { boardId, branchId: current } });
  return { ok: true, value: { boardId, batch, notes } };
}

// Stored under the `migration` meta key in the same batch as the migrated board (or the fresh one).
export const migrationMarker = (at: number, outcome: { notes: MigrationNote[] } | { failed: string }): JsonValue =>
  ({ from: 'kanban-light', at, ...outcome }) as unknown as JsonValue;
