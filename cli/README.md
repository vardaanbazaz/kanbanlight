# KanbanLight CLI

Version 0.0.1. Early development.

A small command-line tool that sends commands to an open KanbanLight board through a local WebSocket bridge. The CLI does not store any data itself. Every command except `serve` sends a message to the bridge, and the bridge passes it on to the web app.

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

Use the web app from `npm run dev` (see the main README). The hosted demo is blocked from reaching the bridge in browsers that check local-network access, unless you allow it.

Every command except `serve` prints a warning and exits with code 1 if the bridge is not running.

If the bridge is running but the web app is not open, every command reports success, but nothing happens. The CLI only checks that it could reach the bridge. Success lines such as `✅ Created card "…" (Live UI Synced)` only mean that the message reached the bridge; the board does not confirm commands yet. With two tabs open, each tab applies the command, so `add` creates the card twice.

## Commands

### `serve` (alias `start`)

```bash
npx tsx src/index.ts serve [-p <port>]
```

Starts the WebSocket bridge. The default port is 8080. The bridge forwards every message it receives to all connected clients.

`serve` is the only command with a port option. The other CLI commands always connect to port 8080, and so does the web app, so in practice the bridge must run on 8080.

The bridge has no authentication and listens on all network interfaces. Run it only on a trusted network, and stop it (`Ctrl+C`) when not in use. It sends card text to every program connected to it.

### `add <title>`

```bash
npx tsx src/index.ts add "Write release notes" [-d <description>] [-p <priority>] [-a <assignee>] [-c <column>]
```

Creates a card on the current branch.

- `-d, --description`: card description. Default: empty.
- `-p, --priority`: `low`, `medium` or `high`. Default: `medium`. (Here `-p` means priority, not port.)
- `-a, --assignee`: assignee name. Default: `You`.
- `-c, --column`: column id. One of `backlog`, `todo`, `in-progress`, `review`, `done`. Default: `backlog`.

Other values are not rejected yet. A card with an unknown column is saved but does not appear on the board.

### `branch <name>`

```bash
npx tsx src/index.ts branch <name> [-b]
```

Creates a branch from the current branch, and the web app switches to it straight away. Do not use `-b` (`--checkout`) for now: it sends an extra switch by name, which creates a broken branch (see Known issues).

### `checkout <branch>` (alias `switch`)

```bash
npx tsx src/index.ts checkout <branch>
```

Switches the web app to another branch. Only `main` works for now (see Known issues).

### `compare <branch>` (alias `diff`)

```bash
npx tsx src/index.ts compare <branch>
```

Turns on the comparison in the web app, comparing the current branch with `<branch>`. Only `main` works for now; any other name shows every card as Added.

### `exit-diff`

```bash
npx tsx src/index.ts exit-diff
```

Turns off the comparison.

## Known issues

- CLI branch commands: only `main` works with `checkout`/`switch` and `compare`, and `branch -b` must not be used; other names create a broken branch, and after a reload the board can save that branch's cards as main's. Create and switch branches in the web app.
- The bridge has no authentication, listens on all network interfaces and sends card text to every program connected to it. Run `serve` only on a trusted network and stop it when not in use.
- If port 8080 is already in use, `serve` prints that it is listening and then exits with an error. An invalid port prints a stack trace and exits with code 0.

## Old data

Earlier versions of the CLI created a `.kanban/` directory. The current CLI does not use it, and it can be deleted.
