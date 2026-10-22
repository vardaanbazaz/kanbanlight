// Compare two branches' live cards against their merge base, so every difference says which side
// made it. Without a base (no common ancestor), pass none: every difference is then an addition.

import { canonicalJson } from '../storage/json';
import type { CardFields } from './types';

export const COMPARED_FIELDS = ['assignee', 'columnId', 'description', 'position', 'priority', 'tags', 'title'] as const;

export type ComparedField = (typeof COMPARED_FIELDS)[number];

export type SideChange = { kind: 'added' } | { kind: 'removed' } | { kind: 'changed'; fields: ComparedField[] };

export type CardDifference =
  | { cardId: string; side: 'ours' | 'theirs'; change: SideChange }
  // Both sides changed the card differently; `fields` are those where the two results differ.
  | { cardId: string; side: 'both'; ours: SideChange; theirs: SideChange; fields: ComparedField[] };

const differingFields = (a: CardFields, b: CardFields) =>
  COMPARED_FIELDS.filter((field) => canonicalJson(a[field] ?? null) !== canonicalJson(b[field] ?? null));

function changeOf(base: CardFields | undefined, card: CardFields | undefined): SideChange | null {
  if (!base) return card ? { kind: 'added' } : null;
  if (!card) return { kind: 'removed' };
  const fields = differingFields(base, card);
  return fields.length > 0 ? { kind: 'changed', fields } : null;
}

export function compareBranches(
  ours: readonly CardFields[],
  theirs: readonly CardFields[],
  base: readonly CardFields[] = []
): CardDifference[] {
  const index = (cards: readonly CardFields[]) => new Map(cards.map((card) => [card.id, card]));
  const [o, t, b] = [index(ours), index(theirs), index(base)];
  const ids = [...new Set([...o.keys(), ...t.keys(), ...b.keys()])].sort();
  const differences: CardDifference[] = [];
  for (const cardId of ids) {
    const [mine, other] = [o.get(cardId), t.get(cardId)];
    const oursChange = changeOf(b.get(cardId), mine);
    const theirsChange = changeOf(b.get(cardId), other);
    if (!oursChange && !theirsChange) continue;
    if (!theirsChange) differences.push({ cardId, side: 'ours', change: oursChange! });
    else if (!oursChange) differences.push({ cardId, side: 'theirs', change: theirsChange });
    else {
      // Both sides changed it; the same result on both sides is no difference.
      const fields = mine && other ? differingFields(mine, other) : [];
      if (mine && other ? fields.length === 0 : !mine && !other) continue;
      differences.push({ cardId, side: 'both', ours: oursChange, theirs: theirsChange, fields });
    }
  }
  return differences;
}
