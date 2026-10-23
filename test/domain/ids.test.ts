import { describe, expect, it } from 'vitest';
import { counterClock, counterIds, randomIds, systemClock } from '../../src/domain/ids';

describe('clock and id seams', () => {
  it('counter ids never repeat, even across sources that share a counter', () => {
    const counter = { value: 0 };
    const first = counterIds(counter);
    const ids = [first.next('card'), first.next('card'), first.next('branch')];
    const afterReload = counterIds(counter);
    ids.push(afterReload.next('card'), afterReload.next('commit'));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(['card-1', 'card-2', 'branch-3', 'card-4', 'commit-5']);
  });

  it('the counter clock always moves forward', () => {
    const clock = counterClock({ value: 100 }, 10);
    expect([clock.now(), clock.now(), clock.now()]).toEqual([110, 120, 130]);
  });

  it('the default ids are UUIDs and differ every time', () => {
    const ids = Array.from({ length: 50 }, () => randomIds.next('card'));
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('the default clock reads the system time', () => {
    const before = Date.now();
    const now = systemClock.now();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });
});
