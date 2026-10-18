# Execution flow

How execution moves through KanbanLight 0.0.1. This describes the current code; it will be replaced when the data layer is rebuilt. There are two programs. One is the browser app in `src/`. The other is the optional `kb` CLI in `cli/`, which talks to the app over a local WebSocket bridge.

## Entry points

| Entry | Started by | File |
|---|---|---|
| Browser app | `npm run dev` / `npm run build` (Vite), loads `index.html` | `index.html`, then `src/main.tsx` |
| CLI | `npx tsx src/index.ts <command>` from `cli/` (written `kb <command>` below; `kb` is not installed by any step) | `cli/src/index.ts` |
| CLI bridge server | `kb serve` (alias `kb start`), default port 8080 | `cli/src/server.ts:startCliServer` |

The app has no routes. It is a single page. There are no background jobs except the bridge reconnect timer (below).

## Browser app: startup order

1. `index.html` loads `/src/main.tsx`.
2. Module evaluation creates singletons before React renders:
   - `src/services/BranchingService.ts:branchingService`. The constructor runs `loadBranches()`, which reads `localStorage['kanban-branches']`:
     - missing: creates and saves the `main` branch;
     - not JSON, or not `[id, {id, name}]` pairs with a text pointer (`readSavedBranches` returns `null`): sets `loadError`, keeps the list empty and never saves, so the stored value is kept;
     - pointer to a branch that is not listed: `keepUnknownPointer` adds it as a branch named `recovered` (or `recovered-2`, …) with parent `main`, and saves.
   - `src/services/DatabaseService.ts:databaseService` (no I/O yet).
   - `src/services/CliSyncService.ts:cliSyncService` (port 8080, not connected yet).
   - `src/store/useKanbanStore.ts:useKanbanStore`, a hand-rolled Zustand-style store on `useSyncExternalStore`.
3. `src/main.tsx` renders `<App/>` inside `StrictMode` and `src/components/RecoveryScreen.tsx:RecoveryBoundary`. In dev mode, StrictMode runs effects twice. If any render below throws, the boundary replaces the page with `RecoveryScreen:RecoveryView`, which uses no store or provider. Its "Download data" button runs `RecoveryScreen:downloadData`: it reads every IndexedDB `kanban-light` object store read-only (opening with no version, and aborting the upgrade if no database exists so none is created) plus every `localStorage` key starting with `kanban`, and saves them as `kanbanlight-data-<date>.json`. Nothing is written or deleted.
4. `src/App.tsx:App` renders `RecoveryScreen:RecoveryView` instead of the board when `branchingService.loadError` is set, so the store never initialises over an unreadable branch list. Otherwise it renders `ThemeProvider`, then `KanbanBoard` and `CommandPalette`.
5. `src/components/KanbanBoard.tsx:KanbanBoard` runs `useEffect` → `useKanbanStore:initializeStore`:
   - `DatabaseService:initialize` opens IndexedDB `kanban-light` v2 and creates stores in `upgrade`.
   - `DatabaseService:getAllBoards`. If there is none, it creates `default-board` (`saveBoard`).
   - `DatabaseService:getCardsByBoard` and `getEventsByBoard`.
   - It builds the local user (`name: 'You'`).
   - `CliSyncService:connect` opens `ws://localhost:8080`. On close it reconnects every 3 s (`scheduleReconnect`).
   - `activeBranchId` comes from `BranchingService:getCurrentBranch`.
   - If the branch has no snapshot (`DatabaseService:getLatestSnapshotByBranch`), it calls `useKanbanStore:createSnapshot`.
6. `KanbanBoard` opens `GuidedTour` on first visit, when `localStorage['kanbanlight-tour-completed']` is not `'true'`.

## Browser app: main user actions

| Action | UI entry | Call chain |
|---|---|---|
| Add card (column) | `Column.tsx` add button | `useKanbanStore:createCard` → `DatabaseService:saveCard` → `useKanbanStore:dispatchBoardEvent` → `DatabaseService:saveEvent` |
| Add card (modal) | sidebar Quick Actions "New card" (or palette) → `SmartCardCreator.tsx` | `KanbanBoard:handleCreateCard` → `useKanbanStore:createCard` |
| Open / expand card | `Card.tsx:handleCardClick` (double-click opens, single click expands) | opens `CardDetailModal.tsx` |
| Edit / move / delete | `CardDetailModal.tsx` | `useKanbanStore:updateCard` / `deleteCard` → `DatabaseService:saveCard` / `deleteCard` → `dispatchBoardEvent` |
| Open Branch Manager | header button, sidebar "Manage Branches", or palette | `useKanbanStore:setShowBranchManager(true)` → `KanbanBoard` renders `BranchManager.tsx` |
| Create branch | `BranchManager.tsx:handleCreateBranch` | `BranchingService:createBranch` → `useKanbanStore:createSnapshot` → `useKanbanStore:switchBranch` |
| Switch branch | `BranchManager.tsx` switch button | `BranchingService:switchBranch` → `useKanbanStore:switchBranch` → `createSnapshot` (current) → `DatabaseService:getLatestSnapshotByBranch` (target) → `DatabaseService:syncActiveBoardCardsAndEvents` → `BranchingService:setActiveBranchId` |
| Compare | `BranchManager.tsx` compare button | `useKanbanStore:startBranchDiff`, which diffs the in-memory cards against the target's latest snapshot. `Column.tsx` reads `branchDiff` and renders `Card` with `diffStatus` |
| Exit compare | banner button in `KanbanBoard.tsx` | `useKanbanStore:exitDiffMode` |
| Export | header Database button in `KanbanBoard.tsx` | inline handler serializes the store's `events` array only (not cards, branches or snapshots) → Blob download `kanban-export-<ts>.json`. `DatabaseService:exportData` exists but nothing calls it |
| Command palette | Ctrl/Cmd+K (`CommandPalette.tsx`) | `setShowSmartCardCreator` / `setShowBranchManager` / other actions |
| Theme | header toggle | `ThemeProvider.tsx:toggleTheme` → `localStorage` |

Storage split: branches and the active branch id live in `localStorage` (`BranchingService`). Cards, events, boards and per-branch snapshots live in IndexedDB (`DatabaseService`).

## CLI flow

1. `cli/src/index.ts` parses argv with `commander`.
2. `kb serve` → `cli/src/server.ts:startCliServer` → `CliBridgeServer:start`. This is a `ws` server that broadcasts every message it receives to all connected clients.
3. Every other command (`checkout`/`switch`, `add`, `branch [-b]`, `compare`/`diff`, `exit-diff`) → `cli/src/commands/index.ts:<command>` → `cli/src/services/BridgeClient.ts:sendToBridge`. That opens a socket, sends one JSON message and closes. If the bridge is down it returns `false` after a 1.2 s timeout, and the command sets `process.exitCode = 1`.
4. The bridge broadcasts to the browser → `src/services/CliSyncService.ts:onmessage` → `src/services/bridgeProtocol.ts:parseBridgeFrame`, which checks the frame (size, JSON object, known type, no extra keys, field types and lengths, known column and priority). A rejected frame logs one `console.warn` with the reason (never the frame) and changes nothing. An accepted frame goes to `CliSyncService:handleCommand`:
   - `SWITCH_BRANCH` → `bridgeProtocol:resolveBranch` → `BranchingService:switchBranch`
   - `CREATE_BRANCH` → `BranchingService:createBranch` (then `switchBranch` if `checkout`)
   - `COMPARE_BRANCH` → `bridgeProtocol:resolveBranch` → `useKanbanStore:startBranchDiff`
   - `EXIT_DIFF` → `useKanbanStore:exitDiffMode`
   - `CREATE_CARD` → `useKanbanStore:createCard`
   - `HANDSHAKE_ACK` (the bridge's greeting) → ignored

`resolveBranch` takes the CLI's branch name or id: an exact id wins, otherwise the name must belong to exactly one branch. An unknown or shared name logs one `console.warn` and changes nothing.

```mermaid
flowchart TD
  html[index.html] --> main[src/main.tsx]
  main --> RB[RecoveryBoundary] --> App[App.tsx] --> KB[KanbanBoard.tsx]
  RB -->|render error| RV[RecoveryView: download only]
  App -->|branch list unreadable| RV
  App --> CP[CommandPalette.tsx]
  KB -->|useEffect| init[useKanbanStore:initializeStore]
  init --> DB[(IndexedDB via DatabaseService)]
  init --> WS[CliSyncService:connect]
  KB --> Col[Column.tsx] --> Card[Card.tsx] --> Modal[CardDetailModal.tsx]
  Modal --> store[useKanbanStore actions] --> DB
  KB --> BM[BranchManager.tsx] --> BS[BranchingService] --> LS[(localStorage)]
  BS --> store
  BM -->|compare| diff[useKanbanStore:startBranchDiff]
  kb[kb CLI cli/src/index.ts] --> cmds[cli/src/commands] --> BC[BridgeClient:sendToBridge]
  BC --> srv[kb serve: CliBridgeServer] --> WS
  WS --> parse[bridgeProtocol:parseBridgeFrame] --> handle[CliSyncService:handleCommand] --> store
```
