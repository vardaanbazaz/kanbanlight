# Changelog

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
- The production build no longer bundles the unused ML runtime (`@xenova/transformers` with onnxruntime-web, about 888 KB minified).
- Removed dependencies that only parked code used, or that nothing used, including `zustand`, `uuid` and `ws` from the web app, and `sqlite3`, `inquirer`, `table`, `date-fns` and `uuid` from the CLI. The CLI no longer needs the native `sqlite3` build to install.
