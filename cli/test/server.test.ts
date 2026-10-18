import { EventEmitter } from 'node:events';
import { inspect } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ServerOptions = {
  host?: string;
  port?: number;
  maxPayload?: number;
  verifyClient?: (info: { origin: string | undefined; secure: boolean; req: unknown }) => boolean;
};

const fake = vi.hoisted(() => ({ servers: [] as unknown[] }));

// Stands in for the `ws` server: records its options and never opens a socket.
vi.mock('ws', async () => {
  const { EventEmitter: Emitter } = await import('node:events');
  class FakeServer extends Emitter {
    constructor(public readonly options: unknown) {
      super();
      fake.servers.push(this);
    }
    close(done?: () => void) {
      done?.();
    }
  }
  const WebSocket = Object.assign(function WebSocket() {}, { OPEN: 1, Server: FakeServer, WebSocketServer: FakeServer });
  return { default: WebSocket, WebSocket, WebSocketServer: FakeServer, Server: FakeServer };
});

type Fake = EventEmitter & { options: ServerOptions };

class FakeClient extends EventEmitter {
  readyState = 1;
  sent: string[] = [];
  send(data: string) {
    this.sent.push(data);
  }
  close() {}
}

let printed = '';
const signalListeners = { SIGINT: process.listeners('SIGINT'), SIGTERM: process.listeners('SIGTERM') };

async function startServer() {
  const { startCliServer } = await import('../src/server');
  startCliServer(0);
  return fake.servers[fake.servers.length - 1] as Fake;
}

describe('the bridge server', () => {
  beforeEach(() => {
    fake.servers.length = 0;
    printed = '';
    const capture = (...parts: unknown[]) => {
      printed += parts.map((part) => (typeof part === 'string' ? part : inspect(part, { depth: 5 }))).join(' ') + '\n';
    };
    vi.spyOn(console, 'log').mockImplementation(capture);
    vi.spyOn(console, 'error').mockImplementation(capture);
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    process.exitCode = undefined;
    vi.resetModules();
  });

  afterEach(() => {
    for (const server of fake.servers as Fake[]) server.removeAllListeners();
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      for (const listener of process.listeners(signal)) {
        if (!signalListeners[signal].includes(listener)) process.removeListener(signal, listener);
      }
    }
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it('listens on 127.0.0.1 only, with a 64 KiB message limit', async () => {
    const server = await startServer();
    expect(server.options.host).toBe('127.0.0.1');
    expect(server.options.maxPayload).toBe(64 * 1024);
  });

  it('accepts only the CLI and the local web app', async () => {
    const server = await startServer();
    const allows = (origin: string | undefined) =>
      server.options.verifyClient?.({ origin, secure: false, req: {} }) ?? true;
    expect([undefined, 'http://localhost:5173', 'http://127.0.0.1:4173'].map(allows)).toEqual([true, true, true]);
    expect(['null', 'https://kanbanlight.vercel.app', 'http://localhost:3000'].map(allows)).toEqual([
      false,
      false,
      false,
    ]);
  });

  it('says it is listening only once it is', async () => {
    const server = await startServer();
    expect(printed).not.toMatch(/listening/i);
    server.emit('listening');
    expect(printed).toMatch(/listening/i);
  });

  it('reports a busy port and exits 1', async () => {
    const server = await startServer();
    try {
      server.emit('error', Object.assign(new Error('listen EADDRINUSE'), { code: 'EADDRINUSE' }));
    } catch {
      // No error handler: the emit throws; the assertions below decide.
    }
    expect(printed).toContain('already in use');
    expect(vi.mocked(process.exit).mock.calls.flat().concat(process.exitCode ?? [])).toContain(1);
  });

  it('never prints the contents of a relayed message', async () => {
    const server = await startServer();
    const client = new FakeClient();
    server.emit('connection', client);
    client.emit('message', Buffer.from(JSON.stringify({ type: 'CREATE_CARD', payload: { title: 'private text' } })));
    expect(printed).not.toContain('private text');
  });

  it('does not relay a message that is not a JSON object', async () => {
    const server = await startServer();
    const client = new FakeClient();
    server.emit('connection', client);
    client.sent.length = 0;
    client.emit('message', Buffer.from('42'));
    expect(client.sent).toEqual([]);
  });

  it('relays a JSON object to every open client and logs its type', async () => {
    const server = await startServer();
    const sender = new FakeClient();
    const board = new FakeClient();
    server.emit('connection', sender);
    server.emit('connection', board);
    board.sent.length = 0;
    const frame = JSON.stringify({ type: 'SWITCH_BRANCH', payload: 'idea' });
    sender.emit('message', Buffer.from(frame));
    expect(board.sent).toEqual([frame]);
    expect(printed).toContain('Relayed SWITCH_BRANCH to 2 clients');
  });
});
