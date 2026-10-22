// Why a domain operation refused to act. Plain data, like storage errors, so it can cross a process boundary.

export const DOMAIN_ERROR_CODES = [
  'invalid-input',
  'unknown-branch',
  'ambiguous-branch',
  'name-taken',
  'unknown-card',
  'missing-commit',
] as const;

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];

export interface DomainError {
  code: DomainErrorCode;
  reason?: string;
}

export const domainError = (code: DomainErrorCode, reason?: string): DomainError =>
  reason === undefined ? { code } : { code, reason };
