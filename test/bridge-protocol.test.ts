import { describe, expect, it } from 'vitest';
import { parseBridgeFrame, resolveBranch } from '../src/services/bridgeProtocol';

const card = { title: 'ok', columnId: 'todo', priority: 'medium', description: '', assignee: 'You' };

const frame = (value: unknown) => JSON.stringify(value);

describe('parseBridgeFrame', () => {
  describe('accepts one valid frame per type', () => {
    it('a card', () => {
      expect(parseBridgeFrame(frame({ type: 'CREATE_CARD', payload: card }))).toEqual({
        ok: true,
        command: { type: 'CREATE_CARD', payload: card },
      });
    });

    it('a card with only a title, trimmed', () => {
      expect(parseBridgeFrame(frame({ type: 'CREATE_CARD', payload: { title: '  ok  ' } }))).toEqual({
        ok: true,
        command: { type: 'CREATE_CARD', payload: { title: 'ok' } },
      });
    });

    it('a branch, with and without checkout', () => {
      expect(parseBridgeFrame(frame({ type: 'CREATE_BRANCH', payload: { name: 'y', checkout: true } }))).toEqual({
        ok: true,
        command: { type: 'CREATE_BRANCH', payload: { name: 'y', checkout: true } },
      });
      expect(parseBridgeFrame(frame({ type: 'CREATE_BRANCH', payload: { name: 'y' } }))).toEqual({
        ok: true,
        command: { type: 'CREATE_BRANCH', payload: { name: 'y' } },
      });
    });

    it('a switch and a compare', () => {
      expect(parseBridgeFrame(frame({ type: 'SWITCH_BRANCH', payload: 'y' }))).toEqual({
        ok: true,
        command: { type: 'SWITCH_BRANCH', payload: 'y' },
      });
      expect(parseBridgeFrame(frame({ type: 'COMPARE_BRANCH', payload: 'y' }))).toEqual({
        ok: true,
        command: { type: 'COMPARE_BRANCH', payload: 'y' },
      });
    });

    it('an exit from compare, whatever its payload', () => {
      expect(parseBridgeFrame(frame({ type: 'EXIT_DIFF', payload: {} }))).toEqual({
        ok: true,
        command: { type: 'EXIT_DIFF' },
      });
    });

    it("the bridge's greeting", () => {
      expect(parseBridgeFrame(frame({ type: 'HANDSHAKE_ACK', payload: { connectedClients: 1 } }))).toEqual({
        ok: true,
        command: { type: 'HANDSHAKE_ACK' },
      });
    });
  });

  const rejected: [string, string, RegExp][] = [
    ['text that is not JSON', '{', /not JSON/],
    ['JSON that is not an object', frame(['CREATE_CARD']), /not a JSON object/],
    ['null', 'null', /not a JSON object/],
    ['an unknown type', frame({ type: 'DROP_TABLES', payload: {} }), /type is not known/],
    ['a missing type', frame({ payload: card }), /type is not known/],
    ['an extra key next to the payload', frame({ type: 'EXIT_DIFF', payload: {}, extra: 1 }), /frame has unknown fields/],
    ['a frame over 64 KiB', frame({ type: 'CREATE_CARD', payload: { ...card, description: 'x'.repeat(64 * 1024) } }), /64 KiB/],
    ['a card payload that is not an object', frame({ type: 'CREATE_CARD', payload: 'ok' }), /card payload is not an object/],
    ['a card with a title that is an object', frame({ type: 'CREATE_CARD', payload: { ...card, title: { pwned: 1 } } }), /title is not text/],
    ['a card with a priority that is an object', frame({ type: 'CREATE_CARD', payload: { ...card, priority: { x: 1 } } }), /priority/],
    ['a card with an unknown priority', frame({ type: 'CREATE_CARD', payload: { ...card, priority: 'urgent' } }), /priority/],
    ['a card with a description that is a list', frame({ type: 'CREATE_CARD', payload: { ...card, description: ['x'] } }), /description/],
    ['a card with an unknown column', frame({ type: 'CREATE_CARD', payload: { ...card, columnId: 'nowhere' } }), /column/],
    ['a card with a title over 200 characters', frame({ type: 'CREATE_CARD', payload: { ...card, title: 'x'.repeat(201) } }), /title must be 1 to 200/],
    [
      'a card with a description over 20,000 characters',
      frame({ type: 'CREATE_CARD', payload: { ...card, description: 'x'.repeat(20_001) } }),
      /description/,
    ],
    ['a card with an assignee over 100 characters', frame({ type: 'CREATE_CARD', payload: { ...card, assignee: 'x'.repeat(101) } }), /assignee/],
    ['a card with an extra field', frame({ type: 'CREATE_CARD', payload: { ...card, extra: 'x' } }), /card payload has unknown fields/],
    ['a card with an empty title', frame({ type: 'CREATE_CARD', payload: { ...card, title: '' } }), /title must be 1 to 200/],
    ['a card with a blank title', frame({ type: 'CREATE_CARD', payload: { ...card, title: '   ' } }), /title must be 1 to 200/],
    ['a branch whose name is an object', frame({ type: 'CREATE_BRANCH', payload: { name: { pwned: 1 } } }), /branch name/],
    ['a branch with an empty name', frame({ type: 'CREATE_BRANCH', payload: { name: '' } }), /branch name/],
    ['a branch with a name over 100 characters', frame({ type: 'CREATE_BRANCH', payload: { name: 'x'.repeat(101) } }), /branch name/],
    ['a branch with a checkout that is not true or false', frame({ type: 'CREATE_BRANCH', payload: { name: 'y', checkout: 'yes' } }), /checkout/],
    ['a branch with an extra field', frame({ type: 'CREATE_BRANCH', payload: { name: 'y', extra: 1 } }), /branch payload has unknown fields/],
    ['a switch to a name that is not text', frame({ type: 'SWITCH_BRANCH', payload: { name: 'y' } }), /branch name/],
    ['a switch to an empty name', frame({ type: 'SWITCH_BRANCH', payload: '' }), /branch name/],
    ['a compare with a name over 100 characters', frame({ type: 'COMPARE_BRANCH', payload: 'x'.repeat(101) }), /branch name/],
    ['a branch with a blank name', frame({ type: 'CREATE_BRANCH', payload: { name: '   ' } }), /branch name is blank/],
    ['a switch to a blank name', frame({ type: 'SWITCH_BRANCH', payload: ' \t ' }), /branch name is blank/],
    ['a compare with a blank name', frame({ type: 'COMPARE_BRANCH', payload: '  ' }), /branch name is blank/],
  ];

  it.each(rejected)('rejects %s, with a reason that does not repeat the frame', (_label, raw, reason) => {
    const result = parseBridgeFrame(raw);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(reason);
    expect(result.reason).not.toContain('pwned');
    expect(result.reason.length).toBeLessThan(100);
  });

  it('measures the size limit in bytes, not characters', () => {
    // 'é' is one character but two bytes in UTF-8.
    const overhead = frame({ type: 'EXIT_DIFF', payload: '' }).length;
    const fits = Math.floor((64 * 1024 - overhead) / 2);
    const under = frame({ type: 'EXIT_DIFF', payload: 'é'.repeat(fits) });
    const over = frame({ type: 'EXIT_DIFF', payload: 'é'.repeat(fits + 1) });
    expect(new TextEncoder().encode(under).length).toBeLessThanOrEqual(64 * 1024);
    expect(new TextEncoder().encode(over).length).toBeGreaterThan(64 * 1024);
    expect(over.length).toBeLessThan(64 * 1024);

    expect(parseBridgeFrame(under).ok).toBe(true);
    expect(parseBridgeFrame(over)).toEqual({ ok: false, reason: 'frame is larger than 64 KiB' });
  });
});

describe('resolveBranch', () => {
  const branches = [
    { id: 'main', name: 'main' },
    { id: 'branch-1', name: 'idea' },
    { id: 'branch-2', name: 'twin' },
    { id: 'branch-3', name: 'twin' },
    { id: 'branch-4', name: 'branch-1' },
  ];

  it('finds a branch by id', () => {
    expect(resolveBranch('branch-2', branches)).toEqual({ ok: true, id: 'branch-2' });
  });

  it('prefers an id over a branch with that name', () => {
    expect(resolveBranch('branch-1', branches)).toEqual({ ok: true, id: 'branch-1' });
  });

  it('finds a branch by its unique name', () => {
    expect(resolveBranch('idea', branches)).toEqual({ ok: true, id: 'branch-1' });
  });

  it('rejects a name it does not know', () => {
    expect(resolveBranch('nope', branches)).toEqual({ ok: false, reason: 'no branch named "nope"' });
  });

  it('rejects a name that several branches share', () => {
    expect(resolveBranch('twin', branches)).toEqual({ ok: false, reason: 'several branches named "twin"' });
  });
});
