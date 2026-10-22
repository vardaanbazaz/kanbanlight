// Branch names: unique per board ignoring case, and resolved to a branch id before anything acts on them.

import { domainError, type DomainError } from './errors';
import { checkBranchName } from './records';
import type { BranchRecord } from './types';

export type Resolved<T> = { ok: true; value: T } | { ok: false; error: DomainError };

export const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function normalizeName(raw: unknown): Resolved<string> {
  const result = checkBranchName(raw);
  return result.ok ? result : { ok: false, error: domainError('invalid-input', result.reason) };
}

export const isNameTaken = (name: string, branches: readonly BranchRecord[], exceptId?: string) =>
  branches.some((branch) => branch.id !== exceptId && sameName(branch.name, name));

// `name` if free, else the first free `name-2`, `name-3`, …
export function freeName(name: string, branches: readonly BranchRecord[]): string {
  if (!isNameTaken(name, branches)) return name;
  let suffix = 2;
  while (isNameTaken(`${name}-${suffix}`, branches)) suffix += 1;
  return `${name}-${suffix}`;
}

// An exact id wins; otherwise exactly one branch must have the name.
export function resolveBranch(nameOrId: string, branches: readonly BranchRecord[]): Resolved<BranchRecord> {
  const byId = branches.find((branch) => branch.id === nameOrId);
  if (byId) return { ok: true, value: byId };
  const name = nameOrId.trim();
  const matches = name === '' ? [] : branches.filter((branch) => sameName(branch.name.trim(), name));
  if (matches.length === 1) return { ok: true, value: matches[0] };
  return { ok: false, error: domainError(matches.length === 0 ? 'unknown-branch' : 'ambiguous-branch') };
}
