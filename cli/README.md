# KanbanLight CLI

Version 0.0.1. Early development.

A small command-line tool that controls an open KanbanLight board through a local WebSocket bridge. The CLI does not store any data itself. Every command except `serve` sends a message to the bridge, and the bridge passes it on to the web app.

## Setup

From the `kanbanlight` repository root:

```bash
cd cli
npm install
```

Run commands from inside `cli/`:

```bash
npx tsx src/index.ts <command>
npx tsx src/index.ts --help
```

The CLI's help text and messages call it `kb` (for example, "Run kb serve"). Here, `kb <command>` means `npx tsx src/index.ts <command>`.

## Requirements for every command except `serve`

- `serve` must be running in another terminal.
- The web app must be open in a browser, so it is connected to the bridge.

Every command except `serve` prints a warning and exits with code 1 if the bridge is not running.

If the bridge is running but the web app is not open, every command reports success, but nothing happens. The CLI only checks that it could reach the bridge.

## Commands

### `serve` (alias `start`)

```bash
npx tsx src/index.ts serve [-p <port>]
```

Starts the WebSocket bridge. The default port is 8080. The bridge forwards every message it receives to all connected clients.

`serve` is the only command with a port option. The other CLI commands always connect to port 8080, and so does the web app, so in practice the bridge must run on 8080.

The bridge has no authentication and listens on all network interfaces. Run it only on a trusted network, and stop it (`Ctrl+C`) when not in use.

### `add <title>`

```bash
npx tsx src/index.ts add "Write release notes" [-d <description>] [-p <priority>] [-a <assignee>] [-c <column>]
```

Creates a card on the active branch.

- `-d, --description`: card description. Default: empty.
- `-p, --priority`: `low`, `medium` or `high`. Default: `medium`. (Here `-p` means priority, not port.)
- `-a, --assignee`: assignee name. Default: `You`.
- `-c, --column`: column id. One of `backlog`, `todo`, `in-progress`, `review`, `done`. Default: `backlog`.

### `branch <name>`

```bash
npx tsx src/index.ts branch <name> [-b]
```

Creates a branch from the active branch. With `-b` (`--checkout`), also switches to it.

### `checkout <branch>` (alias `switch`)

```bash
npx tsx src/index.ts checkout <branch>
```

Switches the web app to another branch.

### `compare <branch>` (alias `diff`)

```bash
npx tsx src/index.ts compare <branch>
```

Turns on the visual diff in the web app, comparing the active branch with `<branch>`.

### `exit-diff`

```bash
npx tsx src/index.ts exit-diff
```

Turns off the visual diff.

## Known issue

`branch`, `switch` and `compare` currently work reliably only with `main`; other names can create inconsistent branch state.

## Old data

Earlier versions of the CLI created a `.kanban/` directory. The current CLI does not use it, and it can be deleted.
