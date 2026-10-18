# Editor shell

## User facing

ACP UI lives in VS Code as a custom editor for `*.acp` session files, an activity bar container, and a **Chats** tree view.

Open **ACP UI** from the activity bar to focus the session list.
Create a chat from the Chats view **+**, from the `.acp` editor tab **New Chat** split control (`+ ▾`), or use **Open ACP UI**.
`Ctrl+T` / `Cmd+T` opens a new chat when the Chats view or an ACP UI editor tab is focused.

Each chat opens as an editor tab with the ACP UI webview.
The editor title **…** menu includes switching between the visual UI and the raw JSONL text editor.

The Chats sidebar lists sessions from the agent when `session/list` is supported, otherwise from local `.acp` files.
Rename (`F2` when focused), delete, and refresh from the view toolbar and context menus.

Configure where session files are stored with `ib-acp-ui.sessionsDirectory`.
Empty uses extension global storage.
Absolute paths and workspace-relative paths are supported.

## Implementation

### Extension activation

[activate](../../../src/extension.ts#L16-L29) wires RPC logging, session store init, the Chats tree, custom editor registration, and panel commands.
The manifest starts the extension with `onStartupFinished` in [package.json](../../../package.json#L367-L369); commands, the Chats view, and `.acp` editors reuse the activation events VS Code generates from those contributions.

### Custom editor

[acpUiCustomEditorViewType](../../../src/extension/acpUiCustomEditorProvider.ts#L20) is `ibAcpUi.session`.
[AcpUiCustomEditorProvider.resolveCustomTextEditor](../../../src/extension/acpUiCustomEditorProvider.ts#L70-L80) hosts the webview and creates an [AcpUiSessionController](../../../src/extension/acpUiSessionController.ts#L66) per document.

[getAcpUiWebviewHtml](../../../src/extension/acpUiWebviewShell.ts#L11-L43) paints the connecting state in HTML and loads `main.js` as a module.
The chat UI and the markdown renderer load as later chunks from `media/acp-ui/chunks/`.

### Chats tree view

[AcpUiSessionsViewProvider](../../../src/extension/acpUiSessionsView.ts#L202) implements the tree data provider for `acpUiSessionsView`.
[refreshFromAgent](../../../src/extension/acpUiSessionsView.ts#L243-L285) merges agent `session/list` results with local records.

### Commands and keybindings

[registerAcpUiPanel](../../../src/extension/acpUiPanel.ts#L105) registers open, new, rename, delete, focus, and agent picker commands declared in `package.json`.

### Session file layout

[ACP_UI_SESSION_SCHEMA](../../../src/extension/acpUiSessionJsonlFormat.ts#L3) is `acpUi/session/1`.
[resolveSessionsDirectoryUri](../../../src/extension/acpUiSessionJsonl.ts#L55-L77) resolves the configured or default storage directory.
Each session lives in a folder named by UUID with a title-based `.acp` file inside.

Related: [sessions](../acp/sessions.md), [agents](./agents.md).
