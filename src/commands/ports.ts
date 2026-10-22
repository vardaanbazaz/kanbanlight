// Ports beside storage: one writer at a time, and a signal to the other instances after each write.
// Browsers use Web Locks and BroadcastChannel (src/platform/web); tests use the memory versions here.

export interface WriterLock {
  // true when this instance is now the writer. Without `steal`, a lock held elsewhere gives false.
  acquire(options?: { steal?: boolean }): Promise<boolean>;
  // Called once when another instance takes the lock away.
  onLost(listener: () => void): () => void;
  release(): Promise<void>;
}

export interface ChangeMessage {
  boardId: string;
}

export interface ChangeFeed {
  // Reaches every other instance on the same feed, never the sender.
  publish(message: ChangeMessage): void;
  subscribe(listener: (message: ChangeMessage) => void): () => void;
  close(): void;
}

// Memory versions: every lock or feed made from one hub shares it, like tabs of one browser.

export function memoryLockHub() {
  let holder: symbol | null = null;
  const lost = new Map<symbol, Set<() => void>>();
  return (): WriterLock => {
    const me = Symbol('lock');
    lost.set(me, new Set());
    return {
      async acquire({ steal = false } = {}) {
        if (holder === me) return true;
        if (holder !== null && !steal) return false;
        const previous = holder;
        holder = me;
        if (previous) lost.get(previous)!.forEach((listener) => listener());
        return true;
      },
      onLost(listener) {
        lost.get(me)!.add(listener);
        return () => lost.get(me)!.delete(listener);
      },
      async release() {
        if (holder === me) holder = null;
      },
    };
  };
}

export function memoryFeedHub() {
  const members = new Set<{ deliver: (message: ChangeMessage) => void }>();
  return (): ChangeFeed => {
    const listeners = new Set<(message: ChangeMessage) => void>();
    const member = { deliver: (message: ChangeMessage) => listeners.forEach((listener) => listener(message)) };
    members.add(member);
    return {
      publish(message) {
        // Delivered later, like a real channel.
        for (const other of members) if (other !== member) queueMicrotask(() => other.deliver(structuredClone(message)));
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      close() {
        members.delete(member);
        listeners.clear();
      },
    };
  };
}
