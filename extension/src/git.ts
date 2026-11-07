// Git access for the board. No `vscode` import, so the tests run this exact code against real repos.
// Every call goes through execFile with an argument array (never a shell), and only the read-only
// subcommands below plus `switch` can run: `switch -c kl/<slug> refs/heads/<default>` to create a card
// branch, or `switch kl/<slug>` to return to one. Nothing here rebases, resets, cleans, stashes,
// forces or pushes.
import { execFile } from 'node:child_process';

const ALLOWED = new Set(['rev-parse', 'symbolic-ref', 'status', 'show-ref', 'check-ref-format', 'switch']);
const MAX_SLUG = 40;

export type StartResult =
  | { ok: true; branch: string; created: boolean }
  | { ok: false; reason: 'not-repo' | 'bad-name' | 'no-base' | 'dirty' | 'git-error'; message: string };

/** Branches a new card branch may start from, in order of preference. */
export const BASE_BRANCHES = ['main', 'master'] as const;

/** Builds `kl/<slug>` from an untrusted title. Only [a-z0-9-] survive; returns null if nothing does. */
export function branchNameFor(title: string): string | null {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, MAX_SLUG)
    .replace(/^-+|-+$/g, '');
  return slug ? `kl/${slug}` : null;
}

interface GitOut {
  code: number;
  stdout: string;
  stderr: string;
}

function git(gitPath: string, cwd: string, args: string[]): Promise<GitOut> {
  if (!ALLOWED.has(args[0])) return Promise.reject(new Error(`git ${args[0]} is not allowed`));
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' };
  return new Promise((resolve) => {
    execFile(gitPath, ['--no-optional-locks', ...args], { cwd, env, timeout: 10_000 }, (err, stdout, stderr) => {
      const code = err ? (typeof err.code === 'number' ? err.code : -1) : 0;
      resolve({ code, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

export async function isRepo(gitPath: string, dir: string): Promise<boolean> {
  const r = await git(gitPath, dir, ['rev-parse', '--is-inside-work-tree']);
  return r.code === 0 && r.stdout.trim() === 'true';
}

/** Current branch name, '(detached HEAD)', or null when `dir` is not a repo. */
export async function currentBranch(gitPath: string, dir: string): Promise<string | null> {
  if (!(await isRepo(gitPath, dir))) return null;
  const r = await git(gitPath, dir, ['symbolic-ref', '--short', '-q', 'HEAD']);
  return r.code === 0 ? r.stdout.trim() : '(detached HEAD)';
}

/** Absolute path of the repo's top-level folder, or null when `dir` is not inside a repo. */
export async function repoRoot(gitPath: string, dir: string): Promise<string | null> {
  const r = await git(gitPath, dir, ['rev-parse', '--show-toplevel']);
  return r.code === 0 && r.stdout.trim() ? r.stdout.trim() : null;
}

async function branchExists(gitPath: string, dir: string, name: string): Promise<boolean> {
  const r = await git(gitPath, dir, ['show-ref', '--verify', '--quiet', `refs/heads/${name}`]);
  return r.code === 0;
}

/** The local `main` branch, else `master`, else null. Remote branches are not considered. */
export async function defaultBranch(gitPath: string, dir: string): Promise<string | null> {
  for (const name of BASE_BRANCHES) {
    if (await branchExists(gitPath, dir, name)) return name;
  }
  return null;
}

/**
 * Switches to the card's branch `branchNameFor(title)`, creating it from the default branch
 * (`defaultBranch`) when it does not exist yet. Otherwise changes nothing.
 * Blocked when: not a repo, no usable name, tracked files have staged or unstaged changes, or the
 * branch is new and neither `main` nor `master` exists. `git switch` itself would carry tracked
 * changes over silently, so that check is ours. Untracked files do not block: if switching would
 * overwrite one, git refuses on its own and changes nothing.
 */
export async function startCard(gitPath: string, dir: string, title: string): Promise<StartResult> {
  if (!(await isRepo(gitPath, dir))) {
    return { ok: false, reason: 'not-repo', message: 'This folder is not a Git repository. Nothing was changed.' };
  }
  const branch = branchNameFor(title);
  const fmt = branch ? await git(gitPath, dir, ['check-ref-format', '--branch', branch]) : null;
  if (!branch || !fmt || fmt.code !== 0) {
    return { ok: false, reason: 'bad-name', message: 'This card title gives no valid branch name. Nothing was changed.' };
  }
  const status = await git(gitPath, dir, ['status', '--porcelain=v1', '--untracked-files=no']);
  if (status.code !== 0) {
    return { ok: false, reason: 'git-error', message: 'Could not read git status. Nothing was changed.' };
  }
  if (status.stdout.trim() !== '') {
    return {
      ok: false,
      reason: 'dirty',
      message: 'You have uncommitted changes. Commit them first, then move the card again. Nothing was changed.',
    };
  }
  if (await branchExists(gitPath, dir, branch)) {
    const sw = await git(gitPath, dir, ['switch', branch]);
    if (sw.code !== 0) {
      return { ok: false, reason: 'git-error', message: `git switch failed: ${sw.stderr.trim().slice(0, 200)}` };
    }
    return { ok: true, branch, created: false };
  }
  const base = await defaultBranch(gitPath, dir);
  if (!base) {
    return {
      ok: false,
      reason: 'no-base',
      message: 'This repository has no main or master branch to start the card branch from. Nothing was changed.',
    };
  }
  // Full ref, so a tag named `main` can never be picked instead of the branch.
  const sw = await git(gitPath, dir, ['switch', '-c', branch, `refs/heads/${base}`]);
  if (sw.code !== 0) {
    return { ok: false, reason: 'git-error', message: `git switch failed: ${sw.stderr.trim().slice(0, 200)}` };
  }
  return { ok: true, branch, created: true };
}
