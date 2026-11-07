// Board state and every change to it. The extension host owns this state and saves it in workspace
// storage; the webview only renders it and asks for changes. No `vscode` import, so the tests drive it
// directly.
import { realpathSync } from 'node:fs';
import * as path from 'node:path';
import { branchExists, branchNameFor, currentBranch, defaultBranch, repoRoot, startBranch } from './git';
import { BoardData, Card, Column, GIT_ACTIONS, GitAction, ID, LIMITS, actionLine, defaultBoard, isName, newId, parseBoard, uniqueBranch } from './model';

export interface Notice {
  kind: 'ok' | 'error';
  text: string;
}

export interface BoardView {
  type: 'state';
  columns: Array<Column & { actionText: string }>;
  cards: Card[];
  currentBranch: string | null;
  notice: Notice | null;
  busy: boolean;
}

export type InboundMessage =
  | { type: 'ready' }
  | { type: 'move'; cardId: string; columnId: string }
  | { type: 'addCard'; columnId: string; title: string; description: string }
  | { type: 'editCard'; cardId: string; title: string; description: string }
  | { type: 'deleteCard'; cardId: string }
  | { type: 'addColumn'; name: string; action: GitAction }
  | { type: 'editColumn'; columnId: string; name: string; action: GitAction }
  | { type: 'moveColumn'; columnId: string; delta: -1 | 1 }
  | { type: 'deleteColumn'; columnId: string };

type Check = (v: unknown) => boolean;
const id: Check = (v) => typeof v === 'string' && ID.test(v);
const title: Check = (v) => isName(v, LIMITS.title);
const description: Check = (v) => typeof v === 'string' && v.length <= LIMITS.description;
const name: Check = (v) => isName(v, LIMITS.columnName);
const action: Check = (v) => (GIT_ACTIONS as readonly unknown[]).includes(v);

/** The fields each message type must have, exactly; any other field rejects the message. */
const SHAPES: Record<InboundMessage['type'], Record<string, Check>> = {
  ready: {},
  move: { cardId: id, columnId: id },
  addCard: { columnId: id, title, description },
  editCard: { cardId: id, title, description },
  deleteCard: { cardId: id },
  addColumn: { name, action },
  editColumn: { columnId: id, name, action },
  moveColumn: { columnId: id, delta: (v) => v === -1 || v === 1 },
  deleteColumn: { columnId: id },
};

/** Accepts only the message shapes above, within LIMITS. Anything else returns null. */
export function parseMessage(raw: unknown): InboundMessage | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.type !== 'string' || !Object.hasOwn(SHAPES, m.type)) return null;
  const shape = SHAPES[m.type as InboundMessage['type']];
  if (Object.keys(m).length !== Object.keys(shape).length + 1) return null;
  for (const [k, check] of Object.entries(shape)) {
    if (!Object.hasOwn(m, k) || !check(m[k])) return null;
  }
  return { ...m } as InboundMessage;
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

/** Workspace storage, as `vscode.ExtensionContext.workspaceState` provides it. */
export interface Store {
  get(key: string): unknown;
  update(key: string, value: unknown): PromiseLike<void>;
}

export const STORE_KEY = 'kanbanlight.board';
export const UNREADABLE_KEY = 'kanbanlight.board.unreadable';

export interface BoardDeps {
  gitPath: string;
  dir: string | null;
  store: Store;
  /** Open documents; asked fresh before every Git action. */
  openDocs?: () => readonly OpenDoc[];
  /** Asks the user to confirm; resolves true to go ahead. */
  confirm?: (text: string) => Promise<boolean>;
}

export class Board {
  notice: Notice | null = null;
  busy = false;

  private constructor(
    private readonly deps: BoardDeps,
    readonly data: BoardData,
  ) {}

  /**
   * Reads the saved board, or seeds the default one on first run. Saved data that fails validation is
   * copied to UNREADABLE_KEY, never silently dropped, and a new board is started.
   */
  static async load(deps: BoardDeps): Promise<Board> {
    const raw: unknown = deps.store.get(STORE_KEY);
    const saved = parseBoard(structuredClone(raw));
    const board = new Board(deps, saved ?? defaultBoard());
    if (!saved) {
      if (raw !== undefined) {
        await deps.store.update(UNREADABLE_KEY, raw);
        board.notice = { kind: 'error', text: `The saved board could not be read, so a new one was started. The old data is kept in workspace storage under ${UNREADABLE_KEY}.` };
      }
      await deps.store.update(STORE_KEY, board.data);
    }
    return board;
  }

  async view(): Promise<BoardView> {
    const { gitPath, dir } = this.deps;
    const branch = dir ? await currentBranch(gitPath, dir) : null;
    const base = dir && branch !== null ? await defaultBranch(gitPath, dir) : null;
    return {
      type: 'state',
      columns: this.data.columns.map((c) => ({ ...c, actionText: actionLine(c.action, base) })),
      cards: this.data.cards.map((c) => ({ ...c })),
      currentBranch: branch,
      notice: this.notice,
      busy: this.busy,
    };
  }

  /** Applies one validated message and saves. Ignored while another change (or a Git action) runs. */
  async handle(msg: InboundMessage): Promise<void> {
    if (msg.type === 'ready' || this.busy) return;
    this.busy = true;
    try {
      this.notice = null;
      if (await this.apply(msg)) await this.deps.store.update(STORE_KEY, this.data);
    } finally {
      this.busy = false;
    }
  }

  /** Returns true when the board changed and needs saving. */
  private async apply(m: Exclude<InboundMessage, { type: 'ready' }>): Promise<boolean> {
    const d = this.data;
    const card = 'cardId' in m ? d.cards.find((c) => c.id === m.cardId) : undefined;
    const col = 'columnId' in m ? d.columns.find((c) => c.id === m.columnId) : undefined;
    switch (m.type) {
      case 'move':
        return !!card && !!col && this.move(card, col);
      case 'addCard':
        if (!col) return false;
        if (d.cards.length >= LIMITS.cards) return this.fail(`A board holds at most ${LIMITS.cards} cards. Nothing was changed.`);
        d.cards.push({ id: this.freshId(), title: m.title.trim(), description: m.description, columnId: col.id, branch: null });
        return true;
      case 'editCard':
        if (!card) return false;
        card.title = m.title.trim(); // The branch, once assigned, stays.
        card.description = m.description;
        return true;
      case 'deleteCard': {
        if (!card) return false;
        const kept = card.branch ? `Its Git branch ${card.branch} is kept; only the card is deleted.` : 'It has no Git branch.';
        if (!(await (this.deps.confirm ?? (async () => false))(`Delete the card "${card.title}"? ${kept}`))) return false;
        d.cards.splice(d.cards.indexOf(card), 1);
        return true;
      }
      case 'addColumn':
        if (d.columns.length >= LIMITS.columns) return this.fail(`A board holds at most ${LIMITS.columns} columns. Nothing was changed.`);
        d.columns.push({ id: this.freshId(), name: m.name.trim(), action: m.action });
        return true;
      case 'editColumn':
        if (!col) return false;
        col.name = m.name.trim();
        col.action = m.action;
        return true;
      case 'moveColumn': {
        const i = col ? d.columns.indexOf(col) : -1;
        const j = i + m.delta;
        if (i < 0 || j < 0 || j >= d.columns.length) return false;
        [d.columns[i], d.columns[j]] = [d.columns[j], d.columns[i]];
        return true;
      }
      case 'deleteColumn':
        if (!col) return false;
        if (d.columns.length === 1) return this.fail('A board needs at least one column. Nothing was changed.');
        if (d.cards.some((c) => c.columnId === col.id)) {
          return this.fail(`Move or delete the cards in "${col.name}" first. Nothing was changed.`);
        }
        d.columns.splice(d.columns.indexOf(col), 1);
        return true;
    }
  }

  private fail(text: string): false {
    this.notice = { kind: 'error', text };
    return false;
  }

  private freshId(): string {
    const taken = new Set([...this.data.columns, ...this.data.cards].map((x) => x.id));
    let id = newId();
    while (taken.has(id)) id = newId();
    return id;
  }

  /**
   * The card's stored branch, or (first start) `branchNameFor(title)` with -2, -3... if another card owns
   * that name or it already exists as a branch in the repo, so a card never takes over a branch it did not make.
   */
  async branchFor(card: Card): Promise<string | null> {
    if (card.branch) return card.branch;
    const base = branchNameFor(card.title);
    if (!base) return null;
    const taken = new Set(this.data.cards.flatMap((c) => (c !== card && c.branch ? [c.branch] : [])));
    const { gitPath, dir } = this.deps;
    let name = uniqueBranch(base, taken);
    while (dir && (await branchExists(gitPath, dir, name))) {
      taken.add(name);
      name = uniqueBranch(base, taken);
    }
    return name;
  }

  private place(card: Card, col: Column): void {
    this.data.cards.splice(this.data.cards.indexOf(card), 1);
    this.data.cards.push(card);
    card.columnId = col.id;
  }

  /**
   * Moves a card. Into a column whose action is "start", the card moves only if its branch was
   * checked out (created from the default branch, or an existing one), and only then is the branch
   * stored on the card. Unsaved files inside the repo block that before any Git action runs.
   */
  private async move(card: Card, col: Column): Promise<boolean> {
    if (card.columnId === col.id) return false;
    if (col.action === 'none') {
      this.place(card, col);
      return true;
    }
    const { gitPath, dir } = this.deps;
    if (!dir) return this.fail('Open a folder first. Nothing was changed.');
    const root = await repoRoot(gitPath, dir);
    if (root) {
      const docs = (this.deps.openDocs?.() ?? []).map((d) => ({ ...d, fsPath: d.fsPath && real(d.fsPath) }));
      const unsaved = unsavedInRepo(docs, real(root));
      if (unsaved.length > 0) return this.fail(unsavedMessage(unsaved));
    }
    const r = await startBranch(gitPath, dir, await this.branchFor(card));
    if (!r.ok) return this.fail(r.message);
    card.branch = r.branch;
    this.place(card, col);
    this.notice = { kind: 'ok', text: `${r.created ? 'Created and switched to' : 'Switched to existing branch'} ${r.branch}.` };
    return true;
  }
}
