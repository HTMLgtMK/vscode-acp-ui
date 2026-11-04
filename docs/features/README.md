# Feature index

Shipped and in-progress product features for ACP UI.
Each file combines a user-facing story with implementation notes.
See [AGENTS.md](./AGENTS.md) for authoring rules.

Extension product surface (commands, views, keybindings, settings) lives in the embedding
extension, not in this repo; see [README.md](../../README.md).

## ACP client surfaces

| Feature | Doc |
| --- | --- |
| Initialize handshake, client capabilities | [client](./acp/client.md) |
| Agent authentication | [authentication](./acp/authentication.md) |
| Tool permission prompts | [permissions](./acp/permissions.md) |
| Session lifecycle, resume, list/delete primitives | [sessions](./acp/sessions.md) |
| Filesystem read/write for agents | [filesystem](./acp/filesystem.md) |
| Client-hosted terminals | [terminal](./acp/terminal.md) (planned) |
| MCP server forwarding | [mcp](./acp/mcp.md) (planned) |
| ACP agent registry catalog | [agent-registry](./acp/agent-registry.md) (planned) |

## Chat UI surfaces

| Feature | Doc |
| --- | --- |
| Chat transcript and tool display | [chat-trace](./ui/chat-trace.md) |
| Composer input, autocomplete, history | [composer](./ui/composer.md) |
| Model and session config toolbar | [session-config](./ui/session-config.md) |

## Maintainer surfaces

| Feature | Doc |
| --- | --- |
| Protocol v2 and SDK unstables | [platform](./maintainer/platform.md) |
| Standalone webview dev server | [standalone](./maintainer/standalone.md) |
| ACP RPC NDJSON logging | [rpc-logging](./maintainer/rpc-logging.md) |
