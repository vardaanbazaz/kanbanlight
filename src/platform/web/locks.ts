// The single-writer lock for browser tabs, on Web Locks. A tab holds the lock until it releases it
// or another tab steals it ("Use here"); the tab that lost it is told through onLost.

import type { WriterLock } from '../../commands/ports';

export function webLock(name: string, locks: LockManager = navigator.locks): WriterLock {
  const lostListeners = new Set<() => void>();
  let release: (() => void) | null = null;

  return {
    acquire({ steal = false } = {}) {
      if (release) return Promise.resolve(true);
      return new Promise<boolean>((resolve) => {
        const held = locks.request(name, steal ? { steal: true } : { ifAvailable: true }, (lock) => {
          if (!lock) {
            resolve(false);
            return undefined;
          }
          resolve(true);
          // Held until release() resolves this promise.
          return new Promise<void>((done) => (release = done));
        });
        // A stolen lock's request rejects (AbortError): this tab is no longer the writer.
        held.catch(() => {
          if (release) {
            release = null;
            lostListeners.forEach((listener) => listener());
          }
        });
      });
    },
    onLost(listener) {
      lostListeners.add(listener);
      return () => lostListeners.delete(listener);
    },
    async release() {
      release?.();
      release = null;
    },
  };
}
