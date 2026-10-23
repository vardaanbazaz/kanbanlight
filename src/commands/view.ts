// The board as the UI shows it, for the Stage 3 store. Built with structural sharing: anything that
// did not change keeps the same object, so memoised cards and narrow selectors skip unchanged parts,
// and a view with nothing changed is the previous view itself.

import { COLUMN_IDS, type BoardRecord, type BranchRecord, type CardRecord, type ColumnId, type HeadRecord } from '../domain/types';
import type { CommandError } from './commands';
import type { BoardState } from './service';

export interface BoardView {
  board: BoardRecord;
  branches: readonly BranchRecord[]; // oldest first
  head: HeadRecord;
  columns: Readonly<Record<ColumnId, readonly CardRecord[]>>; // each in position order
  readOnly: boolean;
  // The last command's error; null once a command succeeds. A new error is a new object.
  lastError: CommandError | null;
}

export interface ViewInput {
  state: BoardState | null;
  readOnly: boolean;
  lastError: CommandError | null;
}

// Records are plain JSON data, so equal content means equal records.
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return false;
  const [x, y] = [a as Record<string, unknown>, b as Record<string, unknown>];
  const keys = Object.keys(x);
  return keys.length === Object.keys(y).length && keys.every((key) => key in y && same(x[key], y[key]));
}

const keep = <T>(previous: T | undefined, next: T): T => (previous !== undefined && same(previous, next) ? previous : next);
const sameItems = <T>(a: readonly T[], b: readonly T[]) => a.length === b.length && a.every((item, i) => item === b[i]);
const byPosition = (a: CardRecord, b: CardRecord) => a.position - b.position || (a.id < b.id ? -1 : 1);

export function toView(previous: BoardView | null, { state, readOnly, lastError }: ViewInput): BoardView | null {
  if (!state) return null;
  const known = new Map(previous ? COLUMN_IDS.flatMap((id) => previous.columns[id]).map((card) => [card.id, card]) : []);
  const columns = {} as Record<ColumnId, readonly CardRecord[]>;
  for (const id of COLUMN_IDS) {
    const cards = state.current.cards.filter((card) => card.columnId === id).sort(byPosition).map((card) => keep(known.get(card.id), card));
    columns[id] = previous && sameItems(previous.columns[id], cards) ? previous.columns[id] : cards;
  }
  const view: BoardView = {
    board: keep(previous?.board, state.board),
    branches: keep(previous?.branches, state.branches),
    head: keep(previous?.head, state.head),
    columns: previous && COLUMN_IDS.every((id) => columns[id] === previous.columns[id]) ? previous.columns : columns,
    readOnly,
    lastError,
  };
  const unchanged = previous && (Object.keys(view) as (keyof BoardView)[]).every((key) => view[key] === previous[key]);
  return unchanged ? previous : view;
}
