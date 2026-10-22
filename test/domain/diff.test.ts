import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { compareBranches, type CardDifference } from '../../src/domain/diff';
import { COLUMN_IDS, type CardFields } from '../../src/domain/types';

const card = (id: string, patch: Partial<CardFields> = {}): CardFields => ({
  id,
  title: `card ${id}`,
  description: '',
  priority: 'medium',
  tags: [],
  columnId: 'todo',
  position: 0,
  createdAt: 1,
  updatedAt: 1,
  ...patch,
});

const base = [card('kept'), card('edited'), card('gone'), card('both')];

describe('comparing two branches against their base', () => {
  const ours = [card('kept'), card('edited', { title: 'new title', updatedAt: 9 }), card('both', { priority: 'high' }), card('mine')];
  const theirs = [card('kept'), card('edited'), card('both'), card('theirs', { columnId: 'done' })];

  it('says which side added, changed or removed each card, with the changed fields', () => {
    // `gone` was removed on both sides: the branches agree, so it is not listed.
    expect(compareBranches(ours, theirs, base)).toEqual([
      { cardId: 'both', side: 'ours', change: { kind: 'changed', fields: ['priority'] } },
      { cardId: 'edited', side: 'ours', change: { kind: 'changed', fields: ['title'] } },
      { cardId: 'mine', side: 'ours', change: { kind: 'added' } },
      { cardId: 'theirs', side: 'theirs', change: { kind: 'added' } },
    ]);
  });

  it('a card removed on one side only is "removed" on that side', () => {
    expect(compareBranches([card('kept')], [card('kept')], [card('kept'), card('gone')])).toEqual([]);
    expect(compareBranches([card('kept')], [card('kept'), card('gone')], [card('kept'), card('gone')])).toEqual([
      { cardId: 'gone', side: 'ours', change: { kind: 'removed' } },
    ]);
  });

  it('a card deleted on one side and edited on the other is changed on both', () => {
    const result = compareBranches([], [card('gone', { title: 'kept alive' })], [card('gone')]);
    expect(result).toEqual([
      { cardId: 'gone', side: 'both', ours: { kind: 'removed' }, theirs: { kind: 'changed', fields: ['title'] }, fields: [] },
    ]);
  });

  it('the same field edited differently on both sides lists the fields where they end up different', () => {
    const result = compareBranches(
      [card('x', { title: 'A', tags: ['ui'] })],
      [card('x', { title: 'B', priority: 'low' })],
      [card('x', { priority: 'low' })]
    );
    expect(result).toEqual([
      { cardId: 'x', side: 'both', ours: { kind: 'changed', fields: ['priority', 'tags', 'title'] }, theirs: { kind: 'changed', fields: ['title'] }, fields: ['priority', 'tags', 'title'] },
    ]);
  });

  it('the same change made on both sides is not a difference', () => {
    expect(compareBranches([card('x', { title: 'A' })], [card('x', { title: 'A', updatedAt: 5 })], [card('x')])).toEqual([]);
  });

  it('identical branches give no differences; without a base, every difference is an addition', () => {
    expect(compareBranches(base, base, base)).toEqual([]);
    expect(compareBranches([card('a')], [card('a'), card('b')])).toEqual([{ cardId: 'b', side: 'theirs', change: { kind: 'added' } }]);
  });

  it('notices an assignee that was added or cleared', () => {
    expect(compareBranches([card('x', { assignee: 'You' })], [card('x')], [card('x')])).toEqual([
      { cardId: 'x', side: 'ours', change: { kind: 'changed', fields: ['assignee'] } },
    ]);
  });
});

describe('compare is the same in both directions', () => {
  const variant = (id: string) =>
    fc.option(
      fc.record({
        title: fc.constantFrom('a', 'b'),
        columnId: fc.constantFrom(...COLUMN_IDS.slice(0, 2)),
        tags: fc.constantFrom([], ['x']),
      }).map((patch) => card(id, { ...patch, tags: [...patch.tags] })),
      { nil: undefined }
    );
  const side = fc.tuple(variant('1'), variant('2'), variant('3')).map((cards) => cards.filter((item): item is CardFields => !!item));

  const mirror = (item: CardDifference): CardDifference =>
    item.side === 'both'
      ? { ...item, ours: item.theirs, theirs: item.ours }
      : { ...item, side: item.side === 'ours' ? 'theirs' : 'ours' };

  it('swapping the sides mirrors every result', () => {
    fc.assert(
      fc.property(side, side, side, (ours, theirs, baseCards) => {
        expect(compareBranches(theirs, ours, baseCards)).toEqual(compareBranches(ours, theirs, baseCards).map(mirror));
      }),
      { numRuns: 300, seed: 1 }
    );
  });
});
