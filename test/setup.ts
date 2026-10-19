import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, vi } from 'vitest';

// Records every socket the app opens; tests deliver frames through `onmessage`.
export class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => unknown) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(public readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(): void {}

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
  }
}

globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList,
});

// The app logs card contents; keep test output readable.
vi.spyOn(console, 'log').mockImplementation(() => {});

beforeEach(() => {
  // A fresh origin per test: new IndexedDB, empty localStorage, fresh module graph.
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  FakeWebSocket.instances.length = 0;
  vi.resetModules();
});
