import * as crypto from 'node:crypto';
import * as vscode from 'vscode';
import { Board, OpenDoc, parseMessage } from './board';

// The parts of the built-in Git extension's API (extensions/git/src/api/git.d.ts) used here.
interface GitApi {
  git: { path: string };
  repositories: GitRepo[];
  onDidOpenRepository: vscode.Event<GitRepo>;
}
type GitRepo = { state: { onDidChange: vscode.Event<void> } };

let panel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(vscode.commands.registerCommand('kanbanlight.openBoard', () => openBoard(context)));
}

async function gitApi(): Promise<GitApi | undefined> {
  const ext = vscode.extensions.getExtension<{ getAPI(v: 1): GitApi }>('vscode.git');
  if (!ext) return undefined;
  try {
    return (await ext.activate()).getAPI(1);
  } catch {
    return undefined;
  }
}

async function openBoard(context: vscode.ExtensionContext): Promise<void> {
  if (panel) {
    panel.reveal();
    return;
  }
  const api = await gitApi();
  // Use the same git binary as VS Code's Git extension; fall back to `git` on PATH.
  const board = new Board(api?.git.path ?? 'git', vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null, openDocs);
  const media = vscode.Uri.joinPath(context.extensionUri, 'media');
  const p = vscode.window.createWebviewPanel('kanbanlight.board', 'KanbanLight', vscode.ViewColumn.One, {
    enableScripts: true,
    localResourceRoots: [media],
  });
  panel = p;
  const post = async (): Promise<void> => {
    await p.webview.postMessage(await board.view());
  };
  p.webview.html = html(p.webview, media);
  const subs: vscode.Disposable[] = [
    p.webview.onDidReceiveMessage(async (raw: unknown) => {
      const msg = parseMessage(raw);
      if (!msg) return; // Drop anything that is not a well-formed message.
      if (msg.type === 'move') await board.move(msg.cardId, msg.column);
      await post();
    }),
    p.onDidChangeViewState(() => void post()),
    // Keep the header's branch current when it changes outside the board.
    ...(api?.repositories ?? []).map((r) => r.state.onDidChange(() => void post())),
  ];
  if (api) subs.push(api.onDidOpenRepository((r) => subs.push(r.state.onDidChange(() => void post()))));
  p.onDidDispose(() => {
    subs.forEach((s) => s.dispose());
    panel = undefined;
  });
}

/** Every open text and notebook document. Board filters to unsaved files inside the repo. */
function openDocs(): OpenDoc[] {
  const docs = [...vscode.workspace.textDocuments, ...vscode.workspace.notebookDocuments];
  return docs.map((d) => ({ fsPath: d.uri.scheme === 'file' ? d.uri.fsPath : null, isDirty: d.isDirty }));
}

function html(webview: vscode.Webview, media: vscode.Uri): string {
  const nonce = crypto.randomBytes(16).toString('base64');
  const css = webview.asWebviewUri(vscode.Uri.joinPath(media, 'board.css'));
  const js = webview.asWebviewUri(vscode.Uri.joinPath(media, 'board.js'));
  const csp = [
    "default-src 'none'",
    `style-src ${webview.cspSource}`,
    `script-src 'nonce-${nonce}'`,
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${css}">
<title>KanbanLight</title>
</head>
<body>
<header><h1>KanbanLight</h1><span id="branch"></span></header>
<div id="notice" role="status" hidden></div>
<main id="board"></main>
<script nonce="${nonce}" src="${js}"></script>
</body>
</html>`;
}
