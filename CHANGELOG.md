# Changelog

## Unreleased

### Security

- The web app checks every message from the CLI bridge and ignores malformed ones (wrong types, unknown columns or priorities, oversized text, unknown fields). It no longer writes message contents to the browser console.
- Bumped Vite to 5.4.21 for development-server advisories. Affects `npm run dev` only.

### Fixed

- A branch list that cannot be read is no longer replaced with a new, empty one; the recovery screen opens instead. A current-branch pointer to a missing branch, left by the CLI branch bug, is kept as a branch named `recovered`, so switching to `main` no longer overwrites it.
- A board whose stored data cannot be displayed now shows a recovery screen with a download of everything the app has stored in this browser, instead of a blank page.
- CLI `switch` and `compare` accept a branch's name. A name the board does not know, a name shared by several branches, or a blank name is ignored instead of creating a broken branch.

## 0.0.1 — 2026-10-04

Changes since the git tag `pre-audit-2026-09`. The parked code is preserved under that tag.

### Removed (parked)

- WASM plugin system (plugin manager, plugin service, plugin development guide).
- AI-assisted card creation and the AI insights panel. The new-card dialog is now a plain form with a priority field.
- Yjs collaboration, presence cursors and the conflict resolution dialog.
- Branch merge UI.
- CLI standalone mode: the SQLite boards and the `init`, `boards`, `list`, `move`, `status`, `log`, `merge`, `sync`, `remote`, `hooks` and `analyze` commands.
- The unused event-sourcing layer and its providers.

### Fixed

- CLI `add`, `branch`, `checkout` / `switch`, `compare` / `diff` and `exit-diff` print a warning and exit with code 1 when the bridge is not running. Before, `add`, `branch` and `checkout` / `switch` reported success, and `compare` / `diff` and `exit-diff` exited with code 0.
- The production build no longer bundles the unused ML runtime (`@xenova/transformers` with onnxruntime-web).

### Removed

- Dependencies that only parked code used, or that nothing used, including `zustand`, `uuid` and `ws` from the web app, and `sqlite3`, `inquirer`, `table`, `date-fns` and `uuid` from the CLI. The CLI no longer needs the native `sqlite3` build to install.
