# IrishBruse ACP — architecture

This repo is the ACP UI **engine** the goworker workbench runs on: one SDK barrel plus two self-drawn webview bundles. It is no longer a product on its own — activation, views, commands and settings belong to the extension that consumes it (FR-019). The layout keeps clear boundaries between protocol types, ACP infrastructure, and VS Code adapters.

## Layers

1. **`protocol/`** — Serialized messages between the extension host and a UI host (webview today, other surfaces later). Pure types + `tryParseWebviewMessage` for untrusted `postMessage` input.

2. **`acp/domain/`** — Spawn configuration parsing and types with **no** VS Code imports. Safe to unit test and reuse in standalone servers or tests.

3. **`acp/ports/`** — Narrow interfaces the ACP stack needs from the host:
   - **`AcpHostFilesystem`** — maps ACP `readTextFile` / `writeTextFile` to workspace I/O.
   - **`AcpRpcNdjsonSink`** — optional raw NDJSON-RPC logging (Output channel + file).

4. **`acp/infrastructure/`** — `AcpAgentProcess`: subprocess + `@agentclientprotocol/sdk` connection. Depends only on domain types and ports (no globals).

5. **`acp/mapping/`** — Translates ACP `session/update` payloads into `ExtensionToWebviewMessage` batches. Depends on the protocol types, not on VS Code.

6. **`acp/session/`** — `AcpSessionBridge` orchestrates one agent session: permissions, model selection, prompt/cancel, and update forwarding.

7. **`platform/vscode/`** — Adapters: `createVscodeAcpHostFilesystem`, `VscodeAcpRpcNdjsonSink`, `createDefaultAcpSessionHostRuntime`.

8. **`sdk/`** — the only public entry: `src/sdk/index.ts`, shipped as `dist-sdk` under the name **`@htmlgtmk/acp-ui`**. `vscode`-free on purpose (session core, agent transports, host ports, the host↔webview message contract, mapping helpers, and the webview HTML/asset helpers in `acpUiWebviewHtml.ts`). VS Code–specific glue stays in `platform/vscode/`.

## Migration notes

- **No settings live here.** The `ib-acp-ui.*` configuration keys were removed with the extension shell (FR-019); the consuming extension builds one `AcpAgentSpawnConfig` per agent — `name`, `command`, optional `args`, optional `env` — and hands it to the session bridge.
- Import **`@htmlgtmk/acp-ui`** (or `src/sdk/index.ts` inside this repo) from feature code instead of deep relative paths.
- UI code should construct **`AcpSessionBridge`** with `createDefaultAcpSessionHostRuntime(rpcNdjsonSink)` so stdio taps and FS behavior stay consistent with the RPC log.

## Webview and standalone dev

- **`webview/acp-ui/`** — React chat UI bundled to `media/acp-ui` (`npm run build:webview`). Imports protocol types from `src/protocol/extensionHostMessages` so the same messages are used in VS Code and in the browser.
- **`webview/control-panel/`** — the sidebar workbench panel (task / worker / chat trees, connection rows), bundled to `media/control-panel`. Same host↔webview contract, its own snapshot message.
- **`standalone/`** — Vite app (`npm run dev:standalone`) with hot reload: the browser entry in `standalone/src/main.ts` reuses `webview/acp-ui/src/ui.tsx` (`mountChatView`). A small WebSocket server (`standalone/server.ts`) speaks the same `WebviewToExtensionMessage` / `ExtensionToWebviewMessage` protocol and drives **`AcpSessionBridge`** with **`createNodeAcpSessionHostRuntime`** (`src/platform/node/`). Configure agents in `standalone/acp-agent.json`; optional NDJSON RPC log via `ACP_RPC_LOG`.
- **VS Code** — this repo contributes nothing to the workbench: `contributes` and `activationEvents` are empty and `src/extension.ts` `activate()` is a documented no-op (kept only so `npm run package` still emits an installable extension). The **goworker** extension is the host: it calls `buildAcpUiWebviewHtml()` for the `media/acp-ui` / `media/control-panel` bundles, and wires `postMessage` to **`AcpSessionBridge`** with **`createDefaultAcpSessionHostRuntime`**.

## Testing

- **Domain** parsing is covered with Vitest (`src/**/*.test.ts`).
- **Ports** allow fakes: `NullAcpRpcNdjsonSink`, in-memory `AcpHostFilesystem` for integration-style tests without VS Code.
