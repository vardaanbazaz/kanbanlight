import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const spinner = vi.hoisted(() => ({
  succeeded: [] as string[],
  failed: [] as string[],
}));

vi.mock('ora', () => ({
  default: () => ({
    start() {
      return {
        succeed: (text: string) => spinner.succeeded.push(text),
        fail: (text: string) => spinner.failed.push(text),
      };
    },
  }),
}));

vi.mock('../src/services/BridgeClient', () => ({
  sendToBridge: vi.fn(async () => false),
}));

import { compareBranch, createBranch, createCard, exitDiff, switchBoard } from '../src/commands';

const commands: [string, () => Promise<void>][] = [
  ['switch', () => switchBoard('main')],
  ['add', () => createCard('A card', {})],
  ['branch', () => createBranch('idea', {})],
  ['compare', () => compareBranch('main')],
  ['exit-diff', () => exitDiff()],
];

describe('commands when the bridge is not running', () => {
  beforeEach(() => {
    spinner.succeeded.length = 0;
    spinner.failed.length = 0;
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it.each(commands)('%s exits 1 with a warning', async (_name, run) => {
    await run();
    expect(process.exitCode).toBe(1);
    expect(spinner.failed).toHaveLength(1);
    expect(spinner.succeeded).toHaveLength(0);
  });
});
