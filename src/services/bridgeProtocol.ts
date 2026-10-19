// Messages the CLI bridge may send to the web app, and the checks every frame must pass.
// Pure: no store or storage imports.

export const MAX_FRAME_BYTES = 64 * 1024;

// Kept here rather than imported from the store, which has side effects on import.
const COLUMN_IDS = ['backlog', 'todo', 'in-progress', 'review', 'done'] as const;
const PRIORITIES = ['low', 'medium', 'high'] as const;

export type ColumnId = (typeof COLUMN_IDS)[number];
export type Priority = (typeof PRIORITIES)[number];

export interface CardPayload {
  title: string;
  description?: string;
  assignee?: string;
  priority?: Priority;
  columnId?: ColumnId;
}

export type BridgeCommand =
  | { type: 'CREATE_CARD'; payload: CardPayload }
  | { type: 'CREATE_BRANCH'; payload: { name: string; checkout?: boolean } }
  | { type: 'SWITCH_BRANCH'; payload: string }
  | { type: 'COMPARE_BRANCH'; payload: string }
  | { type: 'EXIT_DIFF' }
  | { type: 'HANDSHAKE_ACK' };

export type ParseResult = { ok: true; command: BridgeCommand } | { ok: false; reason: string };

const reject = (reason: string): ParseResult => ({ ok: false, reason });

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const onlyKeys = (value: Record<string, unknown>, allowed: string[]) =>
  Object.keys(value).every((key) => allowed.includes(key));

const isText = (value: unknown, min: number, max: number): value is string =>
  typeof value === 'string' && value.length >= min && value.length <= max;

// Branch names are kept as sent, but one that is only whitespace is refused.
const isBranchName = (value: unknown): value is string => isText(value, 1, 100) && value.trim() !== '';
const branchNameReason = (value: unknown) =>
  isText(value, 1, 100) ? 'branch name is blank' : 'branch name must be text of 1 to 100 characters';

const isOneOf = <T extends string>(value: unknown, options: readonly T[]): value is T =>
  typeof value === 'string' && (options as readonly string[]).includes(value);

function parseCard(payload: unknown): ParseResult {
  if (!isObject(payload)) return reject('card payload is not an object');
  if (!onlyKeys(payload, ['title', 'description', 'assignee', 'priority', 'columnId'])) {
    return reject('card payload has unknown fields');
  }
  const { description, assignee, priority, columnId } = payload;
  if (typeof payload.title !== 'string') return reject('card title is not text');
  const title = payload.title.trim();
  if (!isText(title, 1, 200)) return reject('card title must be 1 to 200 characters');
  if (description !== undefined && !isText(description, 0, 20_000)) {
    return reject('card description must be text of at most 20,000 characters');
  }
  if (assignee !== undefined && !isText(assignee, 0, 100)) {
    return reject('card assignee must be text of at most 100 characters');
  }
  if (priority !== undefined && !isOneOf(priority, PRIORITIES)) return reject('card priority is not low, medium or high');
  if (columnId !== undefined && !isOneOf(columnId, COLUMN_IDS)) return reject('card column is not a board column');

  const card: CardPayload = { title };
  if (description !== undefined) card.description = description;
  if (assignee !== undefined) card.assignee = assignee;
  if (priority !== undefined) card.priority = priority;
  if (columnId !== undefined) card.columnId = columnId;
  return { ok: true, command: { type: 'CREATE_CARD', payload: card } };
}

function parseBranch(payload: unknown): ParseResult {
  if (!isObject(payload)) return reject('branch payload is not an object');
  if (!onlyKeys(payload, ['name', 'checkout'])) return reject('branch payload has unknown fields');
  const { name, checkout } = payload;
  if (!isBranchName(name)) return reject(branchNameReason(name));
  if (checkout !== undefined && typeof checkout !== 'boolean') return reject('branch checkout is not true or false');
  return {
    ok: true,
    command: { type: 'CREATE_BRANCH', payload: checkout === undefined ? { name } : { name, checkout } },
  };
}

export function parseBridgeFrame(raw: string): ParseResult {
  if (new TextEncoder().encode(raw).length > MAX_FRAME_BYTES) return reject('frame is larger than 64 KiB');

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return reject('frame is not JSON');
  }
  if (!isObject(data)) return reject('frame is not a JSON object');
  if (!onlyKeys(data, ['type', 'payload'])) return reject('frame has unknown fields');

  switch (data.type) {
    case 'CREATE_CARD':
      return parseCard(data.payload);
    case 'CREATE_BRANCH':
      return parseBranch(data.payload);
    case 'SWITCH_BRANCH':
    case 'COMPARE_BRANCH':
      if (!isBranchName(data.payload)) return reject(branchNameReason(data.payload));
      return { ok: true, command: { type: data.type, payload: data.payload } };
    case 'EXIT_DIFF':
    case 'HANDSHAKE_ACK':
      return { ok: true, command: { type: data.type } };
    default:
      return reject('frame type is not known');
  }
}

export interface BranchRef {
  id: string;
  name: string;
}

export type ResolveResult = { ok: true; id: string } | { ok: false; reason: string };

// An exact id wins; otherwise the name must belong to exactly one branch.
export function resolveBranch(nameOrId: string, branches: BranchRef[]): ResolveResult {
  if (branches.some((branch) => branch.id === nameOrId)) return { ok: true, id: nameOrId };
  const matches = branches.filter((branch) => branch.name === nameOrId);
  if (matches.length === 1) return { ok: true, id: matches[0].id };
  return { ok: false, reason: `${matches.length ? 'several branches' : 'no branch'} named "${nameOrId}"` };
}
