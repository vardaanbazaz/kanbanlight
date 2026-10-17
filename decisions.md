# Decisions

Newest first. Each entry records what was decided, the reason given at the time, the alternatives considered, and the tradeoff accepted.

Some entries were written after the fact. They say so in **Source**. Where nobody wrote a reason down, the entry says "Not recorded"; reasons are never reconstructed.

### 2026-10-17: Rebuild plan
- **Decision:** how KanbanLight is rebuilt after 0.0.1, and in what order.
  - **Data**
    - Commits are full board states (cards and columns) linked to their parent commits. A branch is a pointer to a commit. Each branch has a working copy and a short log of recent changes with their previous values, used only for undo and cleared at every commit.
    - Every branch has one internal id, and branch names are unique per board. Every entry point (web app, CLI, dialogs) turns a name into that id.
    - The current-branch pointer is stored in IndexedDB, in the same transaction as the board data. Every record carries a board id and a branch id.
    - All changes, from the web app, the CLI and dialogs, go through one command queue.
    - Only one tab can write. A second tab shows "This board is open in another tab", is read-only, and has a "Use here" button that takes over.
    - Board data moves to a new IndexedDB database instead of upgrading the old one. On first run, each real branch's latest snapshot becomes a root commit, with its parent taken from the branch list and `main` as the root. The old database stays untouched for one release. If migration fails, the app starts fresh, keeps the old data, and offers a download of it. Broken branches created through the CLI are not migrated.
    - App state lives in Zustand v5 as a view of the data, written only by the command layer.
    - Commits are automatic, with no commit message in 0.1. A commit is written when a branch is created, before and after a merge, when switching away from a branch with changes, and before taking a card from another branch or discarding a branch. The working copy saves continuously.
    - Deleting a card removes it from the branch's working copy; history keeps it until the branch is deleted and its unreachable commits are cleaned up. Settings get a "Delete all data" control. Export saves the current state by default, with history as an option. The delete confirmation says that history keeps the card.
    - Multiple boards come last. The data model is scoped by board from the start, so adding them is not a migration.
  - **Compare and merge**
    - A comparison is chosen explicitly ("Compare idea with main"), defaulting to the branch's parent. It reads live state, updates on every change, and ends when you switch.
    - Labels say which side made a change: "Added on idea", "Changed on idea", "Removed on idea", the same set for the other branch, and "Changed on both" for conflicts. A list of changes sits next to the board. When there are no differences, the app says so in a sentence. "Done" ends the comparison.
    - Merge is three-way at card level, and merges automatically when the two sides changed different fields of the same card. A conflict is the same field changed on both sides, or one side deleting a card the other edited. Merge starts from the comparison ("Merge idea into main"), with a preview of how many cards will change. Conflicts are resolved per card ("Keep main's" / "Keep idea's"). The result is a merge commit with two parents; the branch is kept, with an offer to delete it.
    - Discard deletes a branch from the same view and states how many changes will be lost.
    - Not in 0.1: merging into a branch other than the one being compared, and partial merges.
    - The new-branch form gets a "From" choice for which branch to branch from, defaulting to the current branch. The CLI gets `kb branch <name> [<from>]`.
    - No collaboration in this plan. Exchanging a branch as a file may be considered after import exists.
  - **Interface**
    - No permanent sidebar: "New card" and the branch switcher move into the header, where the current branch name is the most prominent element. All five columns fit on a laptop screen without horizontal scrolling. Columns size to their content; the board scrolls as a whole, with sticky column headers.
    - A click, or Enter or Space on a focused card, opens it. The editor has Write and Preview tabs, closes with Esc or a click outside, and asks before discarding unsaved edits.
    - On phones: one column at a time with a column switcher, readable cards, full-screen dialogs, and a "Move to" menu instead of drag-and-drop.
    - Dialogs, menus, popovers, tooltips, tabs, toasts and radio groups come from Radix UI Primitives, and drag-and-drop from dnd-kit. Their focus and keyboard behaviour is checked before they are adopted.
    - Product direction rule 9 is amended: tooltips show on hover and on keyboard focus only, the accessible name matches the tooltip text, Esc dismisses a tooltip, it hides on activation and when a dialog opens, and native `title` attributes are not used.
    - First visit opens a seeded sample board, including a ready-made branch `try-idea` that differs from `main` in a few cards, with the two lines from rule 7 above it (the second only once tooltips follow the amended rule 9). Settings get "Restore sample board". The guided tour is removed.
    - Words: branch, switch, compare / comparison, current branch, "Stop comparing", You. In the CLI, `switch` is primary with `checkout` as an alias, `compare` is primary with `diff` as an alias, and `compare --stop` is primary with `exit-diff` as an alias.
    - A privacy line in the app footer, from the redesign on.
  - **Bridge and CLI**
    - First, in the 0.0.2 patch: the bridge listens on `127.0.0.1` only, accepts only local web-app origins, limits message size and stops logging message contents; the web app validates every message. The hosted site never connects to the bridge; only a page served from `localhost` or `127.0.0.1` does. The content security policy does not allow `ws:`.
    - Then, in 0.2: a command router with JSON-RPC 2.0 messages, pairing between the CLI and the web app, one connected web app (the tab that holds the write lock), and replies only after a command is saved. Having the CLI serve the web app itself is reconsidered at that point.
    - The CLI is bundled into one file and published as `@vardaanbazaz/kanbanlight-cli`, marked private until then, with `engines` set and the `kb` command name kept.
  - **Process**
    - Tests use Vitest, jsdom, fake-indexeddb and fast-check, including a randomized property test written against a driver interface so it survives the rewrite. Regression tests for the known data bugs go in first, marked as expected failures. Playwright covers a few end-to-end journeys, plus one WebKit run per release.
    - `build` runs the type check and `vite build`. CI runs on every push. All rebuild work happens on branches with Vercel preview deployments, and merging to `main` is the release. Production stays on 0.0.1 / 0.0.2 until 0.1.0. Prettier is applied in one separate commit listed in `.git-blame-ignore-revs`. npm workspaces with a shared protocol package arrive with the bridge rework.
    - `vercel.json` adds security headers, long-term caching for built assets and an explicit build command, with no catch-all rewrite. The page gets a description and link-preview text now, and a preview image after the redesign. The app asks the browser for persistent storage on the first real write.
    - The app may later start offline through a service worker, after 0.1.0, with a "new version available" prompt.
    - The new data layer is built as tested modules alongside the old code, then the app switches over in one change on a branch. There is no long-lived parallel interface.
    - Undo: card delete gets "Undo" in its notice with the redesign, replacing the browser's confirm dialog; full single-step undo per branch comes in 0.4.
    - Versions: 0.0.2 is a safety patch; 0.1.0 is the core loop including merge; then 0.2 bridge, 0.3 export/import, 0.4 cherry-pick and undo, 0.5 git linking, 0.6 multiple boards.
- **Why:**
  - Data: merging, taking a card from another branch and history all become functions of plain board states, and the merge base comes from parent links. A new database means a code rollback can never leave the page blank, and the old data survives a failed migration.
  - Compare and merge: labels must say which side made a change, because the old labels were easy to misread. Without merge, the loop stops at compare; collaboration needs accounts and a server, which is a different product.
  - Interface: someone seeing the board for the first time must understand it within minutes on a laptop, and it must not break on a phone. Hand-built dialogs and overlays have repeatedly failed on focus and keyboard use, so tested libraries supply them.
  - Bridge and CLI: nobody running the CLI needs the hosted page, and the open bridge is the biggest security risk. The CLI must be safe and reliable before git features are built on it.
  - Process: the riskiest part, the data, gets tests before anything depends on it, and a merge to `main` becomes the release gate. 0.1.0 waits for merge so the first redesigned release does not end at a comparison with nothing to do next.
- **Alternatives considered:**
  - Event-sourced storage: rejected, because it needs replay and schema changes forever, and conflicts between individual operations are harder to explain.
  - Upgrading the old database in place: rejected, because rolling back the code could then leave the page blank, and old open tabs could block the upgrade.
  - A fresh start without migration: rejected, because existing boards would be lost.
  - React Aria: stronger accessibility defaults, but a heavier API.
  - Hand-built dialogs: rejected, because the earlier hand-built overlays were not accessible.
- **Tradeoff accepted:**
  - a second tab is read-only;
  - the CLI cannot be used from the hosted site;
  - 0.1.0 waits for merge, which leaves a long gap without a visible release.
- **Source:** recorded at the time.

### 2026-10-16: Remove the `feature/*` preservation branches; the tag keeps the parked code
- **Decision:** delete `feature/ai-assist`, `feature/cli-sqlite`, `feature/wasm-plugins` and `feature/yjs-collab`, locally and on GitHub. The parked code stays available under the tag `pre-audit-2026-09`.
- **Why:** all four branches pointed at the same commit as the tag, so they held nothing extra. Each one also showed the old README, which described features that never worked, one click from the repository page.
- **Alternatives considered:** keeping the branches and mentioning them in the CHANGELOG.
- **Tradeoff accepted:** the parked work is found through a tag rather than a branch list.
- **Source:** recorded at the time.

### 2026-10-04: Product direction
- **Status:** rule 9 amended by "2026-10-17: Rebuild plan" (not built yet).
- **Decision:** ten rules for what KanbanLight is and in what order it is built:
  1. Drag-and-drop and card ordering within a column are table stakes, ranked alongside merge.
  2. One board with five fixed columns for now. Every record carries a board id, so multiple boards later is an addition, not a migration. Multiple boards come after merge.
  3. Local-first: no accounts and no backend. A full export and import of the whole board (cards, branches, history) is required.
  4. Desktop-first. On phones the page must not break and cards must be viewable.
  5. The CLI's role grows. It must be safe and reliable before git features are built on it.
  6. Git integration means local integration: the CLI reads the user's repository and links commits and branches to cards. No GitHub API, no OAuth, no server.
  7. A seeded sample board replaces the guided tour, with two lines: "Create a branch, change something, compare." and "Hover or focus any icon to see what it does."
  8. The UI uses the words branch, switch and compare. The CLI keeps `checkout` and `diff` as aliases. There is one identity name, "You".
  9. Every icon-only control has a tooltip and an accessible name. Text buttons get no tooltip. No control exists without an action.
  10. History and time travel come after merge. The data model must not rule them out.

  Loop features to add besides merge: delete a branch, rename a branch, bring one card over from another branch, undo the last change.

  Out of scope for now: accounts, a backend, the GitHub API, custom columns, real-time collaboration, plugins, AI features.
- **Why:** the product is for developers who think in git, and it must be understandable within minutes by someone seeing it for the first time.
  - Decision 1: drag-and-drop is expected of any Kanban board.
  - Decision 3: local-first is not credible without a full export.
  - Decision 5: git integration runs through the CLI.
  - Decision 9: the owner wants every button explained on hover, as the old tour did.
  - Other reasons: not recorded.
- **Alternatives considered:**
  - Decision 6: a GitHub API integration (rejected in favour of local integration).
  - Decision 2: multiple boards now (deferred).
  - Others: not recorded.
- **Tradeoff accepted:** most of these are not built in 0.0.1. The guided tour still ships until the redesign.
- **Source:** recorded at the time.

### 2026-10-04: Keep the IndexedDB database at version 2 and keep the `plugins` store after parking plugins
- **Status:** superseded by "2026-10-17: Rebuild plan" (not built yet; 0.0.1 still works as described here).
- **Decision:** `openDB('kanban-light', 2)` is unchanged, and the `plugins` object store is still created, although the plugin system is parked.
- **Why:** bumping to version 3 would make the parked code's `openDB(…, 2)` fail with `VersionError` for every existing user. Dropping only the store-creation line would leave users who arrive after parking without the store, so un-parking would break for them.
- **Alternatives considered:** bump to version 3 and delete the store; delete only the store-creation line.
- **Tradeoff accepted:** existing users keep inert plugin records and their storage cost.
- **Source:** written during the parking work.

### 2026-10-04: Park unfinished subsystems instead of shipping them (released as 0.0.1)
- **Decision:** remove from `main`:
  - Yjs collaboration;
  - WASM plugins;
  - AI-assisted card creation;
  - the CLI's SQLite side;
  - the branch merge UI;
  - the unused event-sourcing layer.

  Their code is preserved under the tag `pre-audit-2026-09`.
- **Why:** the shipped app should contain only working features. None of these worked end to end.
- **Alternatives considered:** finishing them in place; shipping them labelled "experimental" (considered for merge only).
- **Tradeoff accepted:** fewer advertised features; merge has to be rebuilt from scratch.
- **Source:** recorded at the time.

### Date not recorded: CLI talks to the app through a local WebSocket broadcast bridge
- **Status:** superseded by "2026-10-17: Rebuild plan" (not built yet; 0.0.1 still works as described here).
- **Decision:** `kb serve` runs a `ws` server on port 8080 that rebroadcasts every message. Other `kb` commands are one-shot clients. The browser tab connects to the bridge.
- **Why:** not recorded.
- **Alternatives considered:** a CLI with its own SQLite store. It was built, then parked, because it never synced with the browser.
- **Tradeoff accepted:** commands do nothing unless `kb serve` and a browser tab are both running. Bridge security limits are listed under Known issues in the README.
- **Source:** written after the fact from the code.

### Date not recorded: Branches stored as full per-branch snapshots
- **Status:** superseded by "2026-10-17: Rebuild plan" (not built yet; 0.0.1 still works as described here).
- **Decision:**
  - A switch saves a snapshot of the current board and loads the target branch's latest snapshot.
  - Compare is a two-way diff of the current cards against the target's latest snapshot.
  - Branch metadata lives in `localStorage`; board data lives in IndexedDB.
- **Why:** not recorded.
- **Alternatives considered:** not recorded.
- **Tradeoff accepted (as it turned out):**
  - there is no merge base in use;
  - a diff cannot say which side made a change;
  - branch metadata and data are split across two storage systems.
- **Source:** written after the fact from the code.

### Date not recorded: Hand-rolled Zustand-style store instead of the `zustand` package
- **Status:** superseded by "2026-10-17: Rebuild plan" (not built yet; 0.0.1 still works as described here).
- **Decision:** `src/store/useKanbanStore.ts` implements a small Zustand-like API on React's `useSyncExternalStore`.
- **Why:** not recorded. The first commit message names Zustand, so the package was replaced at some point.
- **Alternatives considered:** the `zustand` package.
- **Tradeoff accepted:** no middleware or devtools; custom code to maintain.
- **Source:** written after the fact from the code.

### 2026-08: React 18, Vite, TypeScript, Tailwind CSS, IndexedDB through `idb`
- **Decision:**
  - a single-page React 18 app built with Vite;
  - styled with Tailwind CSS and its typography plugin;
  - icons from `lucide-react`;
  - markdown through `react-markdown` and `remark-gfm`;
  - data in IndexedDB through `idb`.
- **Why:** not recorded.
- **Alternatives considered:** not recorded.
- **Tradeoff accepted:** data lives in one browser profile unless exported.
- **Source:** written after the fact from the code and the earliest commits.
