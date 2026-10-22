import { describe, expect, it } from 'vitest';
import type { BoardService } from '../../src/commands/service';
import type { BranchRecord, CardRecord } from '../../src/domain/types';
import type { IdSource } from '../../src/domain/ids';
import { storageError, type StorageAdapter } from '../../src/storage/types';
import { faulty } from '../storage/faulty';
import { backends, harness, rejection, titles } from './backends';

const create = (service: BoardService, title: string, columnId = 'todo') =>
  service.run({ method: 'card.create', params: { title, columnId } }) as Promise<CardRecord>;
const cards = (service: BoardService) => service.state()!.current.cards;
const headName = (service: BoardService) =>
  service.state()!.branches.find((branch) => branch.id === service.state()!.head.branchId)!.name;

describe.each(backends)('board service on %s storage', (_name, makeBackend) => {
  it('a new store gets a board with main and no cards, and reopening shows the same board', async () => {
    const h = harness(makeBackend);
    const first = await h.open();
    expect(first.readOnly()).toBe(false);
    expect(headName(first)).toBe('main');
    expect(cards(first)).toEqual([]);
    const boardId = first.state()!.board.id;
    await first.close();
    const again = await h.open();
    expect(again.state()!.board.id).toBe(boardId);
  });

  it('card commands answer only after storing, and survive a reload', async () => {
    const h = harness(makeBackend);
    const service = await h.open();
    const card = await create(service, 'Fix login');
    expect(card).toMatchObject({ title: 'Fix login', columnId: 'todo' });
    await service.run({ method: 'card.update', params: { cardId: card.id, title: '  Fix logout ', assignee: 'You' } });
    await service.run({ method: 'card.move', params: { cardId: card.id, columnId: 'done' } });
    const other = await create(service, 'Gone');
    await service.run({ method: 'card.delete', params: { cardId: other.id } });
    expect(cards(service)).toEqual([expect.objectContaining({ title: 'Fix logout', assignee: 'You', columnId: 'done' })]);
    await service.close();
    const reloaded = await h.open();
    expect(cards(reloaded)).toEqual(cards(service));
  });

  it('refuses bad input and unknown cards, and stores nothing', async () => {
    const service = await harness(makeBackend).open();
    for (const raw of [
      'card.create',
      { method: 'card.explode', params: {} },
      { method: 'card.create', params: { title: '   ' } },
      { method: 'card.create', params: { title: 'x', columnId: 'nowhere' } },
      { method: 'card.create', params: { title: 't'.repeat(201) } },
      { method: 'card.move', params: { cardId: 'x', columnId: 'todo', extra: 1 } },
      { method: 'branch.switch', params: {} },
    ]) {
      expect(await rejection(service.run(raw))).toMatchObject({ code: 'invalid-input' });
    }
    expect(await rejection(service.run({ method: 'card.delete', params: { cardId: 'nope' } }))).toEqual({ code: 'unknown-card' });
    expect(cards(service)).toEqual([]);
  });

  it('branch.create copies the source, switches to the new branch, and refuses taken or blank names', async () => {
    const service = await harness(makeBackend).open();
    await create(service, 'On main');
    const idea = (await service.run({ method: 'branch.create', params: { name: 'idea' } })) as BranchRecord;
    expect(headName(service)).toBe('idea');
    expect(titles(cards(service))).toEqual(['On main']);
    await create(service, 'Only on idea');
    await service.run({ method: 'branch.create', params: { name: 'from-main', from: 'MAIN' } });
    expect(titles(cards(service))).toEqual(['On main']);
    expect(idea.createdFrom).toBe(service.state()!.branches.find((branch) => branch.name === 'main')!.id);
    expect(await rejection(service.run({ method: 'branch.create', params: { name: 'Idea' } }))).toEqual({ code: 'name-taken' });
    expect(await rejection(service.run({ method: 'branch.create', params: { name: '  ' } }))).toMatchObject({ code: 'invalid-input' });
    expect(await rejection(service.run({ method: 'branch.create', params: { name: 'x', from: 'nope' } }))).toEqual({ code: 'unknown-branch' });
    expect(service.state()!.branches.map((branch) => branch.name)).toEqual(['main', 'idea', 'from-main']);
  });

  it('switching keeps each branch\'s cards, by name or id, across reloads', async () => {
    const h = harness(makeBackend);
    const service = await h.open();
    await create(service, 'Shared');
    const idea = (await service.run({ method: 'branch.create', params: { name: 'idea' } })) as BranchRecord;
    await create(service, 'Idea only');
    await service.run({ method: 'branch.switch', params: { branch: 'Main' } });
    expect(titles(cards(service))).toEqual(['Shared']);
    await service.run({ method: 'branch.switch', params: { branch: idea.id } });
    expect(titles(cards(service))).toEqual(['Idea only', 'Shared']);
    expect(await rejection(service.run({ method: 'branch.switch', params: { branch: 'nope' } }))).toEqual({ code: 'unknown-branch' });
    expect(headName(service)).toBe('idea');
    await service.close();
    const reloaded = await h.open();
    expect(headName(reloaded)).toBe('idea');
    expect(titles(cards(reloaded))).toEqual(['Idea only', 'Shared']);
  });

  it('a name two old branches share is refused as ambiguous', async () => {
    const h = harness(makeBackend);
    const service = await h.open();
    await service.run({ method: 'branch.create', params: { name: 'idea' } });
    const twin = { ...service.state()!.branches[1], id: 'twin', name: 'IDEA' };
    const copy = { ...service.state()!.current.copy, branchId: 'twin' };
    await service.close();
    const raw = h.storage();
    await raw.open();
    await raw.apply([{ kind: 'putBranch', branch: twin }, { kind: 'setWorkingCopy', copy }]);
    const reloaded = await h.open();
    expect(await rejection(reloaded.run({ method: 'branch.switch', params: { branch: 'idea' } }))).toEqual({ code: 'ambiguous-branch' });
    await reloaded.run({ method: 'branch.switch', params: { branch: 'twin' } });
    expect(headName(reloaded)).toBe('IDEA');
  });

  it('a card created while a switch is still running lands on the branch active when it runs', async () => {
    const h = harness(makeBackend);
    const service = await h.open();
    await service.run({ method: 'branch.create', params: { name: 'idea' } });
    await service.run({ method: 'branch.switch', params: { branch: 'main' } });
    const switching = service.run({ method: 'branch.switch', params: { branch: 'idea' } });
    const creating = create(service, 'During the switch');
    await Promise.all([switching, creating]);
    expect(titles(cards(service))).toEqual(['During the switch']);
    await service.close();
    const reloaded = await h.open();
    expect(titles(cards(reloaded))).toEqual(['During the switch']);
    await reloaded.run({ method: 'branch.switch', params: { branch: 'main' } });
    expect(cards(reloaded)).toEqual([]);
  });

  it('answers in the order commands were sent, failures included', async () => {
    const service = await harness(makeBackend).open();
    const order: string[] = [];
    const sent = ['a', 'bad', 'b', 'c'].map((title) =>
      service
        .run(title === 'bad' ? { method: 'card.create', params: {} } : { method: 'card.create', params: { title } })
        .then(
          () => order.push(title),
          () => order.push(`${title} refused`)
        )
    );
    await Promise.all(sent);
    expect(order).toEqual(['a', 'bad refused', 'b', 'c']);
  });

  it('a failed write changes nothing, in storage or in memory, and the next command works', async () => {
    const h = harness(makeBackend);
    // Apply 1 stores the new board, 2 stores Kept, 3 fails.
    const service = await h.open({ storage: faulty(h.storage(), { failApply: 3 }) });
    await create(service, 'Kept');
    const before = service.state();
    expect(await rejection(create(service, 'Lost'))).toEqual({ code: 'storage-failed' });
    expect(service.state()).toBe(before);
    await create(service, 'After');
    expect(titles(cards(service))).toEqual(['After', 'Kept']);
  });

  it('reports storage that went away as unavailable, and changes nothing', async () => {
    const h = harness(makeBackend);
    const inner = h.storage();
    let gone = false;
    const storage: StorageAdapter = { ...inner, apply: (batch) => (gone ? Promise.reject(storageError('unavailable')) : inner.apply(batch)) };
    const service = await h.open({ storage });
    await create(service, 'Kept');
    gone = true;
    expect(await rejection(create(service, 'Lost'))).toEqual({ code: 'storage-unavailable' });
    expect(titles(cards(service))).toEqual(['Kept']);
  });

  it('a thrown bug fails only its own command; later commands still run', async () => {
    let calls = 0;
    const h = harness(makeBackend);
    const counter = { value: 1000 };
    const ids: IdSource = {
      next(kind) {
        calls += 1;
        if (calls === 5) throw new Error('id source broke');
        counter.value += 1;
        return `${kind}-${counter.value}`;
      },
    };
    const service = await h.open({ ids });
    expect(calls).toBe(3); // board, branch, commit
    await create(service, 'First');
    const before = service.state();
    expect(await rejection(create(service, 'Broken'))).toEqual({ code: 'internal-error' });
    expect(service.state()).toBe(before);
    await create(service, 'After');
    expect(titles(cards(service))).toEqual(['After', 'First']);
  });

  it('queries: the board, the branches, and a comparison against the merge base', async () => {
    const service = await harness(makeBackend).open();
    const shared = await create(service, 'Shared');
    await service.run({ method: 'branch.create', params: { name: 'idea' } });
    await service.run({ method: 'card.update', params: { cardId: shared.id, title: 'Shared, edited on idea' } });
    const added = await create(service, 'Idea only');
    const view = (await service.run({ method: 'board.view' })) as { cards: CardRecord[] };
    expect(titles(view.cards)).toEqual(['Idea only', 'Shared, edited on idea']);
    expect(((await service.run({ method: 'branch.list', params: {} })) as BranchRecord[]).map((b) => b.name)).toEqual(['main', 'idea']);
    const comparison = (await service.run({ method: 'branch.compare', params: { a: 'idea', b: 'main' } })) as { differences: unknown[]; base: string };
    expect(comparison.base).toBeTruthy();
    expect(comparison.differences).toEqual([
      { cardId: shared.id, side: 'ours', change: { kind: 'changed', fields: ['title'] } },
      { cardId: added.id, side: 'ours', change: { kind: 'added' } },
    ].sort((x, y) => (x.cardId < y.cardId ? -1 : 1)));
    expect(await rejection(service.run({ method: 'branch.compare', params: { a: 'idea', b: 'nope' } }))).toEqual({ code: 'unknown-branch' });
  });

  it('refuses with plain data that survives JSON', async () => {
    const service = await harness(makeBackend).open();
    const error = await rejection(service.run({ method: 'branch.switch', params: { branch: 'nope' } }));
    expect(Object.getPrototypeOf(error)).toBe(Object.prototype);
    expect(JSON.parse(JSON.stringify(error))).toEqual(error);
  });
});
