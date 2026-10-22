// Time and ids come in through these seams, so tests can make them deterministic.

export interface Clock {
  now(): number;
}

export type IdKind = 'board' | 'branch' | 'commit' | 'card';

export interface IdSource {
  next(kind: IdKind): string;
}

export const systemClock: Clock = { now: () => Date.now() };

export const randomIds: IdSource = { next: () => crypto.randomUUID() };

// Test seams. Share one counter between the sources of a "reload" so ids never repeat.
export interface Counter {
  value: number;
}

export function counterClock(counter: Counter = { value: 0 }, step = 1): Clock {
  return {
    now() {
      counter.value += step;
      return counter.value;
    },
  };
}

export function counterIds(counter: Counter = { value: 0 }): IdSource {
  return {
    next(kind) {
      counter.value += 1;
      return `${kind}-${counter.value}`;
    },
  };
}
