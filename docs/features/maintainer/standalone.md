# Standalone dev server

## User facing

This surface is for extension developers, not end users.

Run `npm run dev:standalone` to develop the chat webview in a browser without installing the VS Code extension.
A Vite dev server serves the UI on port 5173.
A WebSocket bridge on port 5174 reuses the same [AcpSessionBridge](../../../src/acp/session/acpSessionBridge.ts) and protocol mapping as the extension.

`npm run dev:standalone:demo` runs without a live agent.
Browse fixture chats and model-picker seeds at `/fixtures`.
Send `fixture-markdown`, `fixture-tools`, or `fixture-plan` in the composer to replay samples.

Set `ACP_UI_DEMO_SEED=opus-model` to preview the agent-ordered model toolbar.
Set `ACP_UI_VSCODE_SETTINGS` to point at a VS Code `settings.json` for workbench colors and markdown syntax.
Ports: `ACP_UI_VITE_PORT` (default 5173) and `ACP_WS_PORT` (default 5174). Keep one server pair per port pair —
a second one loses the bind race and exits, and the page then only sees a dead endpoint.

### Control panel over the bridge

`http://localhost:5173/?panel=ws` mounts the control panel against the WebSocket bridge instead of the
in-page fixtures, so the browser runs the same host code the extension webview runs
(`createControlPanelHost` + `bindControlPanelHost` + `renderControlPanel`).
`&panelFixture=<name>` picks the snapshot (`progressive` by default; `ready` / `stale` / `empty` come from
`DEV_SNAPSHOTS`, anything else is read from `standalone/fixtures/panels/<name>.ndjson`, one frame per line),
and `&panelReplay=1` pushes frame by frame instead of only the last one.
These three page params are `panel`-prefixed because the chat pane already owns `?fixture=` / `?replay=`;
the WS request line keeps the short names (`?channel=controlPanel&fixture=&replay=1`).
Up-links are live too: collapsing a tree round-trips through the bridge, which flips `ui.collapsed` and
pushes a full snapshot back.
`standalone/panelBridge.ts` owns this channel and is unit-testable on its own;
`standalone/server.ts` only wires it to the socket.
Close reasons are truncated to the 123 bytes a WebSocket close frame can carry, because `ws` throws
synchronously from inside the upgrade handler and nothing there catches it.

## Implementation

### Server bridge

[standalone/server.ts](../../../standalone/server.ts) hosts the HTTP and WebSocket server.
It configures client info from `package.json`.
When not in demo mode it spawns agents from `standalone/acp-agent.json`.
It forwards webview messages through the same
[tryParseWebviewMessage](../../../src/protocol/extensionHostMessages.ts#L298-L306) gate a real host
uses.

Demo mode replays [ReadmeSessionSeed](../../../src/acp/session/readmeSessionSeed.ts) fixtures from `standalone/fixtures/`.

### Theme and markdown

[resolveStandaloneThemeCssVariables](../../../src/platform/node/resolveStandaloneThemeCssVariables.ts) reads VS Code user settings for workbench colors.
`ACP_UI_THEME=light|dark` pins the demo to one direction (it uses the matching bundled theme under `standalone/themes/`)
instead of whatever the local host reports.
[pickWebviewMarkdownThemeVariables](../../../src/platform/markdownThemeResolver.ts) builds CSS variables for the webview bootstrap.

### RPC logging in standalone

When `ACP_RPC_LOG` is unset, RPC lines append to `standalone/acp-rpc.ndjson` via [FileAcpRpcNdjsonSink](../../../src/platform/node/fileRpcNdjsonSink.ts).
See [rpc-logging](./rpc-logging.md).

### Screenshots

`npm run screenshots` builds fixtures and captures README images via Playwright scripts under `scripts/`.
