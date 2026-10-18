# KanbanLight

A Kanban board in the browser that borrows a few ideas from Git: create branches of a board, switch between them, and compare the current branch with another one. Board data is stored in your browser; there is no backend.

Version 0.0.1, an early build. Live demo: https://kanbanlight.vercel.app

An optional Node.js CLI can send commands to an open board over a local WebSocket bridge. It needs the local setup below and is meant for the web app running locally.

---

## Features

- **Branches:** create a branch of the board and switch between branches.
- **Per-branch snapshots:** each branch keeps its own snapshot of cards, columns and events, which is loaded when you switch to it.
- **Compare:** compare the current branch with another branch. Cards are marked as:
  - **Added** (green ring and tint): on the current branch, not in the other branch's last saved state.
  - **Modified** (amber ring and tint): on both, with different content.
  - **Deleted** (red dashed ring, shown faded in its original column): only in the other branch's last saved state.

  The comparison uses the other branch's last saved state, which is saved when that branch was created or last switched away from. It does not update while it is open, and it stays on when you switch branches, so turn it off before switching. The labels describe differences relative to the current branch, not which branch made the change: a card deleted on the other branch shows as Added here.
- **Markdown card descriptions**, rendered with `react-markdown` and `remark-gfm`.
- **Command palette**, opened with `Ctrl+K` (`Cmd+K` on macOS).
- **Light and dark mode.** The board follows the system setting until you use the toggle.
- **Local storage:** board data is stored in the browser's IndexedDB. The branch list, including a copy of the board from when each branch was created, is stored in `localStorage`. Your board is stored only in this browser; KanbanLight has no server and collects nothing (the host keeps standard request logs). Clearing this site's data deletes everything. On the hosted site, images from other sites in card descriptions do not load; when you run the app yourself, they load from the sites that host them. While the CLI bridge runs, it sends card text to every program connected to it.
- **CLI bridge commands:** `serve`, `add`, `branch`, `switch` / `checkout`, `compare` / `diff` and `exit-diff`. See [cli/README.md](cli/README.md).

---

## Architecture

```mermaid
graph TD
    subgraph Browser Frontend
        UI[React UI / KanbanBoard]
        Store[useKanbanStore - small custom store on useSyncExternalStore, includes branch comparison]
        CliClient[CliSyncService - WebSocket client]
    end

    subgraph Browser Storage
        IDB[(DatabaseService - IndexedDB)]
        IDB_Cards[Boards, Cards and Events stores]
        IDB_Snapshots[Branch Snapshots store]
        LS[(localStorage - branch list and fork-point copies)]
    end

    subgraph Local Machine
        WsBridge[CLI bridge - 127.0.0.1:8080 only]
        CliTool[CLI - Commander.js]
    end

    UI <--> Store
    Store <--> IDB
    IDB <--> IDB_Cards
    IDB <--> IDB_Snapshots
    Store <--> LS
    CliTool -->|JSON messages| WsBridge
    WsBridge -->|ws://127.0.0.1:8080| CliClient
    CliClient -->|State actions| Store
```

---

## Tech stack

- **Core:** React 18, TypeScript, Vite
- **State management:** a small custom store on React's `useSyncExternalStore`
- **Styling:** Tailwind CSS, Lucide React icons
- **Local database:** IndexedDB, through the `idb` wrapper
- **CLI:** Node.js, Commander.js, WebSocket (`ws`)

---

## Setup

Requires Node.js and npm. Developed with Node.js 22.

### Terminal 1: web app

```bash
git clone https://github.com/vardaanbazaz/kanbanlight.git
cd kanbanlight
npm install
npm run dev
```

Open the URL that Vite prints.

To make a production build instead:

```bash
npm run build
```

### Terminal 2: CLI bridge (optional)

Read the security note under "Known issues" first. The CLI works only with the web app served by `npm run dev` (or `npm run preview`) on its default port; the hosted demo never connects to a bridge.

Then, from the `kanbanlight` directory:

```bash
cd cli
npm install
npx tsx src/index.ts serve
```

Leave it running.

### Terminal 3: CLI commands

From the `kanbanlight/cli` directory, with the bridge running and the web app open in a browser:

```bash
npx tsx src/index.ts --help
npx tsx src/index.ts add "Write release notes" -p high -c backlog
npx tsx src/index.ts branch idea
npx tsx src/index.ts compare main
npx tsx src/index.ts exit-diff
npx tsx src/index.ts switch main
```

The CLI's help text and messages refer to it as `kb`. In this setup, `kb <command>` means `npx tsx src/index.ts <command>` run from `cli/`.

---

## Known issues

1. Branching stops on large boards: the branch list can outgrow the browser's localStorage limit; after that no new branch can be created, and branches cannot be deleted yet.
2. Two tabs share one working copy: edits in one tab can land on another tab's branch, and every CLI command is applied once per open tab.
3. The CLI cannot tell whether the board applied a command; it reports only that the bridge received it. Boards where `main` was already overwritten by an earlier CLI branch command are not repaired.
4. The bridge has no authentication: any program on this computer can connect to it, and it sends card text to every connected program. Stop it (`Ctrl+C`) when not in use.
5. If a board cannot be displayed, the recovery screen lets you download its data; starting over still means clearing the site's data, which deletes the board.
6. The layout is desktop-only; export saves only the current branch's event log and there is no import, so browser storage is the only copy of a board.

---

## Roadmap

Planned, in no fixed order:

- Reliable branch commands from the CLI, and a bridge that only accepts paired clients.
- A redesigned interface, with a sample board on first visit.
- Drag-and-drop and card ordering.
- Merging branches, and deleting and renaming branches.
- Full export and import of a board.

## Parked prototypes

Earlier prototypes of branch merging, WASM plugins, real-time collaboration and a standalone CLI mode were removed in 0.0.1 because they did not work end to end (see CHANGELOG). Their code is preserved under the git tag `pre-audit-2026-09`.

---

## License

MIT License. Copyright (c) 2026 Vardaan Bajaj. See [LICENSE](LICENSE) for details.
