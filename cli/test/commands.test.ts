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
import { sendToBridge } from '../src/services/BridgeClient';

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

describe('commands when the bridge is running', () => {
  beforeEach(() => {
    spinner.succeeded.length = 0;
    spinner.failed.length = 0;
    vi.mocked(sendToBridge).mockClear();
    vi.mocked(sendToBridge).mockResolvedValue(true);
    process.exitCode = undefined;
  });

  afterEach(() => {
    vi.mocked(sendToBridge).mockResolvedValue(false);
    process.exitCode = undefined;
  });

  it.fails.each(commands)('%s says the command was sent, not that it was applied', async (_name, run) => {
    await run();
    expect(spinner.succeeded).toHaveLength(1);
    expect(spinner.succeeded[0]).toMatch(/^Sent "/);
  });

  it.fails('no message uses emoji', async () => {
    for (const [, run] of commands) await run();
    vi.mocked(sendToBridge).mockResolvedValue(false);
    for (const [, run] of commands) await run();
    expect([...spinner.succeeded, ...spinner.failed].join('\n')).not.toMatch(/[\u{1F300}-\u{1FAFF}\u2705\u274C\u26A0]/u);
  });

  it.fails('branch -b sends one message', async () => {
    await createBranch('idea', { checkout: true });
    expect(vi.mocked(sendToBridge).mock.calls).toHaveLength(1);
  });
});
