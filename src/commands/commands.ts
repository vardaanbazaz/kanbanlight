// The commands every source sends (the web app now; the CLI through the desktop app later), and
// their checks. Names are transport-neutral so they can become protocol methods unchanged.

import { checkCardInput, type CardInput, type Checked } from '../domain/records';
import { COLUMN_IDS, type ColumnId } from '../domain/types';
import type { DomainErrorCode } from '../domain/errors';

export type Command =
  | { method: 'card.create'; params: CardInput }
  | { method: 'card.update'; params: { cardId: string; changes: CardInput } }
  | { method: 'card.move'; params: { cardId: string; columnId: ColumnId; position?: number } }
  | { method: 'card.delete'; params: { cardId: string } }
  | { method: 'branch.create'; params: { name: string; from?: string } }
  | { method: 'branch.switch'; params: { branch: string } };

export type Query =
  | { method: 'board.view'; params: Record<string, never> }
  | { method: 'branch.list'; params: Record<string, never> }
  | { method: 'branch.compare'; params: { a: string; b: string } };

export type CommandErrorCode =
  | DomainErrorCode
  | 'read-only'
  | 'storage-failed'
  | 'storage-unavailable'
  | 'internal-error';

// Plain data: callers check `error.code`. `reason` names the problem, never user content.
export interface CommandError {
  code: CommandErrorCode;
  reason?: string;
}

export const commandError = (code: CommandErrorCode, reason?: string): CommandError =>
  reason === undefined ? { code } : { code, reason };

type Fields = Record<string, unknown>;

const isObject = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);
const isId = (value: unknown): value is string => typeof value === 'string' && value !== '' && value.length <= 200;
const onlyKeys = (value: Fields, keys: string[]) => Object.keys(value).every((key) => keys.includes(key));
const bad = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

function split(params: Fields, keys: string[]): [Fields, Fields] {
  const picked: Fields = {};
  const rest: Fields = {};
  for (const [key, value] of Object.entries(params)) (keys.includes(key) ? picked : rest)[key] = value;
  return [picked, rest];
}

// Checks one command as it arrives from any source.
export function checkCommand(raw: unknown): Checked<Command | Query> {
  if (!isObject(raw) || !onlyKeys(raw, ['method', 'params'])) return bad('command must be { method, params }');
  const params = raw.params === undefined ? {} : raw.params;
  if (!isObject(params)) return bad('params must be an object');
  const empty = (method: 'board.view' | 'branch.list'): Checked<Query> =>
    Object.keys(params).length === 0 ? { ok: true, value: { method, params: {} } } : bad(`${method} takes no params`);

  switch (raw.method) {
    case 'card.create': {
      const input = checkCardInput(params);
      return input.ok ? { ok: true, value: { method: 'card.create', params: input.value } } : input;
    }
    case 'card.update': {
      const [{ cardId }, changes] = split(params, ['cardId']);
      if (!isId(cardId)) return bad('cardId must be an id');
      const input = checkCardInput(changes, { titleRequired: false });
      return input.ok ? { ok: true, value: { method: 'card.update', params: { cardId, changes: input.value } } } : input;
    }
    case 'card.move': {
      const { cardId, columnId, position } = params;
      if (!onlyKeys(params, ['cardId', 'columnId', 'position'])) return bad('card.move has unknown params');
      if (!isId(cardId)) return bad('cardId must be an id');
      if (!(COLUMN_IDS as readonly unknown[]).includes(columnId)) return bad('columnId is not a known column');
      if (position !== undefined && (typeof position !== 'number' || !Number.isFinite(position))) {
        return bad('position must be a finite number');
      }
      return { ok: true, value: { method: 'card.move', params: { cardId, columnId: columnId as ColumnId, ...(position === undefined ? {} : { position }) } } };
    }
    case 'card.delete':
      if (!onlyKeys(params, ['cardId']) || !isId(params.cardId)) return bad('card.delete needs only a cardId');
      return { ok: true, value: { method: 'card.delete', params: { cardId: params.cardId } } };
    case 'branch.create': {
      if (!onlyKeys(params, ['name', 'from'])) return bad('branch.create has unknown params');
      if (typeof params.name !== 'string') return bad('name must be text');
      if (params.from !== undefined && !isId(params.from)) return bad('from must be a branch name or id');
      return { ok: true, value: { method: 'branch.create', params: { name: params.name, ...(params.from === undefined ? {} : { from: params.from }) } } };
    }
    case 'branch.switch':
      if (!onlyKeys(params, ['branch']) || !isId(params.branch)) return bad('branch.switch needs only a branch');
      return { ok: true, value: { method: 'branch.switch', params: { branch: params.branch } } };
    case 'board.view':
    case 'branch.list':
      return empty(raw.method);
    case 'branch.compare':
      if (!onlyKeys(params, ['a', 'b']) || !isId(params.a) || !isId(params.b)) return bad('branch.compare needs a and b');
      return { ok: true, value: { method: 'branch.compare', params: { a: params.a, b: params.b } } };
    default:
      return bad('unknown method');
  }
}

export const isQuery = (command: Command | Query): command is Query =>
  command.method === 'board.view' || command.method === 'branch.list' || command.method === 'branch.compare';
