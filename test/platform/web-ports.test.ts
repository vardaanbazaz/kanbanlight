import { describe, expect, it } from 'vitest';
import { broadcastFeed } from '../../src/platform/web/feed';
import { webLock } from '../../src/platform/web/locks';

// jsdom has no Web Locks: a small stand-in with the parts used (ifAvailable, steal, release).
function fakeLocks(): LockManager {
  let held: { reject: (error: unknown) => void } | null = null;
  return {
    request(_name: string, options: LockOptions, callback: LockGrantedCallback<unknown>) {
      return new Promise((resolve, reject) => {
        if (held && options.ifAvailable) {
          Promise.resolve(callback(null)).then(resolve, reject);
          return;
        }
        if (held && options.steal) held.reject(new DOMException('stolen', 'AbortError'));
        const entry = { reject };
        held = entry;
        Promise.resolve(callback({ name: _name, mode: 'exclusive' } as Lock)).then((value) => {
          if (held === entry) held = null;
          resolve(value);
        }, reject);
      });
    },
    query: async () => ({ held: [], pending: [] }),
  } as unknown as LockManager;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

describe('Web Locks writer lock', () => {
  it('one holder at a time; stealing tells the old holder; release frees it', async () => {
    const locks = fakeLocks();
    const [a, b, c] = [webLock('board', locks), webLock('board', locks), webLock('board', locks)];
    let lost = 0;
    a.onLost(() => (lost += 1));
    expect(await a.acquire()).toBe(true);
    expect(await a.acquire()).toBe(true);
    expect(await b.acquire()).toBe(false);
    expect(await b.acquire({ steal: true })).toBe(true);
    await tick();
    expect(lost).toBe(1);
    await b.release();
    await tick();
    expect(await c.acquire()).toBe(true);
  });
});

describe('BroadcastChannel change feed', () => {
  it('reaches other tabs, never the sender, and ignores foreign messages', async () => {
    const [a, b] = [broadcastFeed('kanbanlight-test'), broadcastFeed('kanbanlight-test')];
    const got = { a: [] as unknown[], b: [] as unknown[] };
    a.subscribe((message) => got.a.push(message));
    b.subscribe((message) => got.b.push(message));
    a.publish({ boardId: 'board-1' });
    const stranger = new BroadcastChannel('kanbanlight-test');
    stranger.postMessage({ something: 'else' });
    await tick();
    expect(got).toEqual({ a: [], b: [{ boardId: 'board-1' }] });
    b.close();
    a.publish({ boardId: 'board-1' });
    await tick();
    expect(got.b).toHaveLength(1);
    a.close();
    stranger.close();
  });
});
