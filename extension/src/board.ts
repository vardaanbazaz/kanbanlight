// Board state and move handling. The extension host owns this state; the webview only renders it
// and asks for moves. No `vscode` import, so the tests drive it directly.
import { realpathSync } from 'node:fs';
import * as path from 'node:path';
import { branchNameFor, currentBranch, repoRoot, startCard } from './git';

export const COLUMNS = ['backlog', 'todo', 'inprogress', 'review', 'done'] as const;
export type Column = (typeof COLUMNS)[number];

export interface Card {
  id: string;
  title: string;
  column: Column;
  branch: string | null;
}

export interface Notice {
  kind: 'ok' | 'error';
  text: string;
}

export interface BoardView {
  type: 'state';
  cards: Card[];
  currentBranch: string | null;
  notice: Notice | null;
  busy: boolean;
}

export type InboundMessage = { type: 'ready' } | { type: 'move'; cardId: string; column: Column };

const SAMPLES: Array<[string, string, Column]> = [
  ['c1', 'Fix login', 'todo'],
  ['c2', 'Add dark mode', 'backlog'],
  ['c3', 'Write README', 'backlog'],
  ['c4', 'Speed up search', 'todo'],
  ['c5', 'Release notes', 'done'],
];

export function sampleCards(): Card[] {
  return SAMPLES.map(([id, title, column]) => ({ id, title, column, branch: branchNameFor(title) }));
}

const CARD_ID = /^[a-z0-9]{1,16}$/;

/** Accepts only the two message shapes the webview may send. Anything else returns null. */
export function parseMessage(raw: unknown): InboundMessage | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const m = raw as Record<string, unknown>;
  const keys = Object.keys(m).sort().join(',');
  if (m.type === 'ready' && keys === 'type') return { type: 'ready' };
  if (m.type !== 'move' || keys !== 'cardId,column,type') return null;
  const { cardId, column } = m;
  if (typeof cardId !== 'string' || !CARD_ID.test(cardId)) return null;
  if (typeof column !== 'string' || !(COLUMNS as readonly string[]).includes(column)) return null;
  return { type: 'move', cardId, column: column as Column };
}

/** An open editor document, as the extension host reports it. */
export interface OpenDoc {
  /** File-system path; null for documents that are not files (untitled, settings, output). */
  fsPath: string | null;
  isDirty: boolean;
}

const MAX_NAMED = 5;

/**
 * Paths, relative to `root`, of open documents inside `root` with unsaved changes. Pure: paths are
 * compared as given, so callers resolve symlinks first. Reads only `isDirty`, which VS Code sets
 * whatever the auto save setting is, so the result never assumes auto save has already run.
 */
export function unsavedInRepo(docs: readonly OpenDoc[], root: string): string[] {
  const out = new Set<string>();
  for (const d of docs) {
    if (!d.isDirty || !d.fsPath) continue;
    const rel = path.relative(root, d.fsPath);
    if (rel === '' || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) continue;
    out.add(rel.split(path.sep).join('/'));
  }
  return [...out].sort();
}

/** The notice text naming unsaved files; lists at most MAX_NAMED of them. */
export function unsavedMessage(files: readonly string[]): string {
  const named = files.slice(0, MAX_NAMED).join(', ');
  const more = files.length > MAX_NAMED ? ` and ${files.length - MAX_NAMED} more` : '';
  return `Save or close these files first: ${named}${more}. Nothing was changed.`;
}

function real(p: string): string {
  try {
    return realpathSync.native(p);
  } catch {
    return p; // A file not yet on disk keeps its path as given.
  }
}

export class Board {
  readonly cards: Card[] = sampleCards();
  notice: Notice | null = null;
  busy = false;

  constructor(
    private readonly gitPath: string,
    private readonly dir: string | null,
    /** Open documents; asked fresh before every Git action. */
    private readonly openDocs: () => readonly OpenDoc[] = () => [],
  ) {}

  async view(): Promise<BoardView> {
    const branch = this.dir ? await currentBranch(this.gitPath, this.dir) : null;
    return { type: 'state', cards: this.cards.map((c) => ({ ...c })), currentBranch: branch, notice: this.notice, busy: this.busy };
  }

  /**
   * Moves a card. Into In Progress, the card moves only if its branch was checked out (created from
   * the default branch, or an existing one). Unsaved files inside the repo block that before any Git
   * action runs.
   */
  async move(cardId: string, column: Column): Promise<void> {
    const card = this.cards.find((c) => c.id === cardId);
    if (!card || card.column === column || this.busy) return;
    if (column !== 'inprogress') {
      card.column = column;
      this.notice = null;
      return;
    }
    if (!this.dir) {
      this.notice = { kind: 'error', text: 'Open a folder first. Nothing was changed.' };
      return;
    }
    this.busy = true;
    try {
      const root = await repoRoot(this.gitPath, this.dir);
      if (root) {
        const docs = this.openDocs().map((d) => ({ ...d, fsPath: d.fsPath && real(d.fsPath) }));
        const unsaved = unsavedInRepo(docs, real(root));
        if (unsaved.length > 0) {
          this.notice = { kind: 'error', text: unsavedMessage(unsaved) };
          return;
        }
      }
      const r = await startCard(this.gitPath, this.dir, card.title);
      if (r.ok) {
        card.column = column;
        this.notice = { kind: 'ok', text: `${r.created ? 'Created and switched to' : 'Switched to existing branch'} ${r.branch}.` };
      } else {
        this.notice = { kind: 'error', text: r.message };
      }
    } finally {
      this.busy = false;
    }
  }
}
