// Renders the state the extension host sends. Text goes in through textContent only, never as HTML.
// Every change is a message to the host, which validates it, applies it and sends the new state back.
(function () {
  const vscode = acquireVsCodeApi();
  const ACTIONS = [
    ['none', 'None'],
    ['start', 'Start work'],
  ];
  const board = document.getElementById('board');
  const branchEl = document.getElementById('branch');
  const noticeEl = document.getElementById('notice');
  const dialog = document.getElementById('dialog');
  let waiting = false;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function button(text, onClick, hint) {
    const b = el('button', '', text);
    b.type = 'button';
    if (hint) b.title = hint;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  /** Returns false (the dialog stays open) while the host is still busy with an earlier change. */
  function send(msg) {
    if (waiting) return false;
    waiting = true;
    document.body.classList.add('busy');
    vscode.postMessage(msg);
  }

  /** fields: [{key, label, kind: 'input'|'area'|'select', max, value}]; actions: [[label, fn(values) -> false keeps it open]]. */
  function openDialog(heading, fields, actions) {
    dialog.replaceChildren(el('h3', '', heading));
    const inputs = {};
    for (const f of fields) {
      const label = el('label', '', f.label);
      const input = el(f.kind === 'area' ? 'textarea' : f.kind === 'select' ? 'select' : 'input');
      if (f.kind === 'select') for (const [v, t] of ACTIONS) input.append(Object.assign(el('option', '', t), { value: v }));
      else input.maxLength = f.max;
      input.value = f.value;
      label.append(input);
      dialog.append(label);
      inputs[f.key] = input;
    }
    const row = el('div', 'buttons');
    for (const [text, fn] of actions) {
      row.append(
        button(text, () => {
          const values = {};
          for (const k in inputs) values[k] = inputs[k].value;
          if (fn(values) !== false) dialog.close();
        }),
      );
    }
    row.append(button('Cancel', () => dialog.close()));
    dialog.append(row);
    dialog.showModal(); // Esc closes it (the dialog's own cancel).
  }

  /** Keeps the dialog open on a blank required field. */
  function filled(v) {
    return v.trim() !== '';
  }

  function cardDialog(card, columnId) {
    const fields = [
      { key: 'title', label: 'Title', kind: 'input', max: 200, value: card ? card.title : '' },
      { key: 'description', label: 'Description (optional)', kind: 'area', max: 20000, value: card ? card.description : '' },
    ];
    if (!card) {
      openDialog('New card', fields, [
        ['Add', (v) => filled(v.title) && send({ type: 'addCard', columnId, title: v.title, description: v.description })],
      ]);
      return;
    }
    openDialog('Card', fields, [
      ['Save', (v) => filled(v.title) && send({ type: 'editCard', cardId: card.id, title: v.title, description: v.description })],
      ['Delete…', () => send({ type: 'deleteCard', cardId: card.id })],
    ]);
  }

  function columnDialog(col) {
    const fields = [
      { key: 'name', label: 'Name', kind: 'input', max: 50, value: col ? col.name : '' },
      { key: 'action', label: 'When a card moves here', kind: 'select', value: col ? col.action : 'none' },
    ];
    const save = (v) =>
      filled(v.name) &&
      send(col ? { type: 'editColumn', columnId: col.id, name: v.name, action: v.action } : { type: 'addColumn', name: v.name, action: v.action });
    openDialog(col ? 'Column' : 'New column', fields, [[col ? 'Save' : 'Add', save]]);
  }

  function render(state) {
    waiting = state.busy;
    document.body.classList.toggle('busy', waiting);
    branchEl.textContent = state.currentBranch === null ? 'Not a Git repository' : 'On branch: ' + state.currentBranch;
    noticeEl.hidden = !state.notice;
    if (state.notice) {
      noticeEl.textContent = state.notice.text;
      noticeEl.className = state.notice.kind;
    }
    board.replaceChildren();
    state.columns.forEach((colData, i) => {
      const id = colData.id;
      const col = el('section', 'column');
      const head = el('div', 'column-head');
      const tools = el('div', 'tools');
      if (i > 0) tools.append(button('←', () => send({ type: 'moveColumn', columnId: id, delta: -1 }), 'Move column left'));
      if (i < state.columns.length - 1) tools.append(button('→', () => send({ type: 'moveColumn', columnId: id, delta: 1 }), 'Move column right'));
      tools.append(button('Edit', () => columnDialog(colData), 'Rename or change the Git action'));
      tools.append(button('Delete', () => send({ type: 'deleteColumn', columnId: id }), 'Delete this column (it must be empty)'));
      head.append(el('h2', '', colData.name), tools);
      col.append(head, el('p', 'action', colData.actionText));
      for (const card of state.cards.filter((c) => c.columnId === id)) {
        const active = card.branch !== null && card.branch === state.currentBranch;
        const c = el('article', active ? 'card active' : 'card');
        c.draggable = true;
        c.tabIndex = 0;
        c.append(el('div', 'title', card.title), el('code', 'branch', card.branch || 'No branch yet'));
        if (active) c.append(el('div', 'here', 'Current branch'));
        c.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', card.id));
        c.addEventListener('click', () => cardDialog(card));
        c.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') cardDialog(card);
        });
        col.append(c);
      }
      col.append(button('Add card', () => cardDialog(null, id)));
      col.addEventListener('dragover', (e) => {
        if (!waiting) e.preventDefault();
      });
      col.addEventListener('drop', (e) => {
        e.preventDefault();
        const cardId = e.dataTransfer.getData('text/plain');
        if (cardId) send({ type: 'move', cardId: cardId, columnId: id });
      });
      board.append(col);
    });
  }

  document.getElementById('add-column').addEventListener('click', () => columnDialog(null));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'state') render(e.data);
  });
  vscode.postMessage({ type: 'ready' });
})();
