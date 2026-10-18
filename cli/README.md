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

The CLI's help text and messages call it `kb` (for example, "Start it in another terminal with: kb serve"). Here, `kb <command>` means `npx tsx src/index.ts <command>`.

## Requirements for every command except `serve`

- `serve` must be running in another terminal.
- The web app must be open in a browser, so it is connected to the bridge.

Use the web app from `npm run dev` or `npm run preview` (see the main README). The hosted demo never connects to the bridge.

Every command except `serve` prints `Bridge not running on 127.0.0.1:8080. Start it in another terminal with: kb serve` and exits with code 1 if the bridge is not running.

If the bridge is running but the web app is not open, every command reports that it sent the command, but nothing happens. The CLI only checks that it could reach the bridge. Success lines such as `Sent "add …" to the bridge. The board does not confirm commands yet.` mean exactly that. With two tabs open, each tab applies the command, so `add` creates the card twice.

## Commands

### `serve` (alias `start`)

```bash
npx tsx src/index.ts serve [-p <port>]
```

Starts the WebSocket bridge. The default port is 8080. The bridge forwards every message that is a JSON object to all connected clients and drops anything else. It prints `Bridge listening on 127.0.0.1:<port>` once it is listening. If the port is already in use, it says so and exits with code 1.

`-p, --port` takes a whole number from 1 to 65535; anything else is rejected with exit code 1. `serve` is the only command with a port option. The other CLI commands always connect to port 8080, and so does the web app, so in practice the bridge must run on 8080.

The bridge listens on `127.0.0.1` only, so other computers cannot reach it. It accepts the CLI and the web app served on `http://localhost:5173` or `http://127.0.0.1:5173` (`npm run dev`) and on port 4173 (`npm run preview`); any other web page is refused. Use the default dev port: if Vite falls back to another port, the bridge refuses the page. Messages are limited to 64 KiB, and the bridge prints only each message's type, never its contents.

The bridge has no authentication: any program on this computer can connect to it, and it sends card text to every connected program. Stop it (`Ctrl+C`) when not in use.

### `add <title>`

```bash
npx tsx src/index.ts add "Write release notes" [-d <description>] [-p <priority>] [-a <assignee>] [-c <column>]
```

Creates a card on the current branch.

- `-d, --description`: card description. Default: empty.
- `-p, --priority`: `low`, `medium` or `high`. Default: `medium`. (Here `-p` means priority, not port.)
- `-a, --assignee`: assignee name. Default: `You`.
- `-c, --column`: column id. One of `backlog`, `todo`, `in-progress`, `review`, `done`. Default: `backlog`.

Any other priority or column is rejected and the allowed values are listed. An empty title, or extra words after the title (quote a title with spaces), is rejected too. Rejected commands exit with code 1 and send nothing.

### `branch <name>`

```bash
npx tsx src/index.ts branch <name> [-b]
```

Creates a branch from the current branch, and the web app switches to it straight away. `-b` (`--checkout`) is still accepted but has no effect, since the board always switches to the new branch.

### `switch <branch>` (alias `checkout`)

```bash
npx tsx src/index.ts switch <branch>
```

Switches the web app to another branch, given its name. A name the board does not know, or one shared by several branches, is ignored and nothing changes; the CLI still reports the command as sent.

### `compare <branch>` (alias `diff`)

```bash
npx tsx src/index.ts compare <branch>
```

Turns on the comparison in the web app, comparing the current branch with `<branch>`. Names are handled as for `switch`: an unknown or shared name is ignored.

### `exit-diff`

```bash
npx tsx src/index.ts exit-diff
```

Turns off the comparison.

## Known issues

- The CLI cannot tell whether the board applied a command; it reports only that the bridge received it. Boards where `main` was already overwritten by an earlier CLI branch command are not repaired.
- The bridge has no authentication: any program on this computer can connect to it, and it sends card text to every connected program. Stop it when not in use.

## Old data

Earlier versions of the CLI created a `.kanban/` directory. The current CLI does not use it, and it can be deleted.
