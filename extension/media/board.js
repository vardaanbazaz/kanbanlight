// Renders the state the extension host sends. Text goes in through textContent only, never as HTML.
// The only messages sent back are {type:'ready'} and {type:'move', cardId, column}.
(function () {
  const vscode = acquireVsCodeApi();
  const COLUMNS = [
    ['backlog', 'Backlog'],
    ['todo', 'To Do'],
    ['inprogress', 'In Progress'],
    ['review', 'Review'],
    ['done', 'Done'],
  ];
  const board = document.getElementById('board');
  const branchEl = document.getElementById('branch');
  const noticeEl = document.getElementById('notice');
  let waiting = false;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
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
    for (const [id, label] of COLUMNS) {
      const col = el('section', 'column');
      col.dataset.column = id;
      col.append(el('h2', '', label));
      for (const card of state.cards.filter((c) => c.column === id)) {
        const c = el('article', 'card');
        c.draggable = true;
        c.dataset.id = card.id;
        c.append(el('div', 'title', card.title), el('code', 'branch', card.branch || '(no valid branch name)'));
        c.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', card.id));
        col.append(c);
      }
      col.addEventListener('dragover', (e) => {
        if (!waiting) e.preventDefault();
      });
      col.addEventListener('drop', (e) => {
        e.preventDefault();
        const cardId = e.dataTransfer.getData('text/plain');
        if (waiting || !cardId) return;
        waiting = true;
        document.body.classList.add('busy');
        vscode.postMessage({ type: 'move', cardId: cardId, column: id });
      });
      board.append(col);
    }
  }

  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'state') render(e.data);
  });
  vscode.postMessage({ type: 'ready' });
})();
