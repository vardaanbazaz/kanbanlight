import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sent = vi.hoisted(() => ({ frames: [] as unknown[], serverPorts: [] as unknown[] }));

vi.mock('ora', () => ({
  default: () => ({ start: () => ({ succeed: () => {}, fail: () => {} }) }),
}));

vi.mock('../src/services/BridgeClient', () => ({
  sendToBridge: async (frame: unknown) => {
    sent.frames.push(frame);
    return true;
  },
}));

// `serve` must never bind a real port in these tests.
vi.mock('../src/server', () => ({
  startCliServer: (port: unknown) => {
    sent.serverPorts.push(port);
  },
}));

class ExitCalled extends Error {
  constructor(public readonly code: number | undefined) {
    super(`process.exit(${code})`);
  }
}

// Runs `kb <args>` in-process and returns what it printed and what it did.
async function run(...args: string[]) {
  let output = '';
  const capture = (chunk: unknown) => {
    output += String(chunk);
    return true;
  };
  vi.spyOn(process.stderr, 'write').mockImplementation(capture);
  vi.spyOn(process.stdout, 'write').mockImplementation(capture);
  vi.spyOn(console, 'error').mockImplementation((...parts: unknown[]) => capture(parts.join(' ')));
  vi.spyOn(console, 'log').mockImplementation((...parts: unknown[]) => capture(parts.join(' ')));
  vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
    throw new ExitCalled(code === undefined || code === null ? undefined : Number(code));
  });
  process.argv = ['node', 'kb', ...args];
  vi.resetModules();
  let exitCode: number | undefined;
  try {
    await import('../src/index');
    await new Promise((resolve) => setTimeout(resolve, 20));
  } catch (error) {
    if (!(error instanceof ExitCalled)) throw error;
    exitCode = error.code;
  }
  vi.restoreAllMocks();
  return { output, exitCode: exitCode ?? process.exitCode };
}

const savedArgv = process.argv;

describe('command-line arguments', () => {
  beforeEach(() => {
    sent.frames.length = 0;
    sent.serverPorts.length = 0;
    process.exitCode = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.argv = savedArgv;
    process.exitCode = undefined;
  });

  it.fails('rejects a priority the board does not have', async () => {
    const result = await run('add', 'x', '-p', 'urgent');
    expect(sent.frames).toEqual([]);
    expect(result.output).toMatch(/low.*medium.*high/s);
  });

  it.fails('rejects a column the board does not have', async () => {
    const result = await run('add', 'x', '-c', 'nowhere');
    expect(sent.frames).toEqual([]);
    expect(result.output).toMatch(/backlog/);
  });

  it.fails.each([
    ['an empty card title', ['add', '']],
    ['a blank branch name', ['branch', '  ']],
    ['extra words after the title', ['add', 'Fix', 'login', 'bug']],
  ])('rejects %s', async (_label, args) => {
    const result = await run(...args);
    expect(sent.frames).toEqual([]);
    expect(result.exitCode).toBe(1);
    expect(result.output.trim()).not.toBe('');
  });

  it.fails.each([['abc'], ['99999'], ['18080abc']])('rejects the port %s', async (port) => {
    const result = await run('serve', '-p', port);
    expect(sent.serverPorts).toEqual([]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('not a valid port');
  });
});
