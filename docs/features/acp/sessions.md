# Sessions

## User facing

ACP UI manages chat sessions end to end: creating chats, resuming conversations, persisting history locally, and reacting to agent-driven session updates.

When you reopen a chat, ACP UI restores the conversation when the agent supports `session/load` and the chat has a stored agent session id.
Agent-side context and replayed messages appear in the trace without starting a blank session.
If resume fails or the agent does not support load, ACP UI falls back to a new agent session.
Composer prompt history (Arrow-Up recall) is restored from the local `.acp` file when present.

Each chat is backed by a local session file that stores metadata and composer history.
Closing and reopening the chat restores composer history from disk.
A sibling `.jsonl` file stores the last screen of the transcript.
Reopening shows that screen immediately, instead of a conversation loader.
You can scroll inside that screen while the agent loads older messages.
When the older messages arrive, the screen you are looking at stays where it is.
The live transcript still comes from the agent via `session/load` replay when resume succeeds.

The Chats sidebar lists agent sessions when the active agent supports `session/list`, and falls back to local `.acp` files when it does not.
Deleting a chat removes the local transcript and notifies the agent when it supports `session/delete` and the chat has a stored runtime session id.

The chat UI will also react to more agent-driven updates such as mode changes, config option updates, title sync, and usage meters.
User message chunks during `session/load` replay already appear in the trace.

## Implementation

### Resume (`session/load`)

The UI session id (`.acp` header UUID) is separate from the runtime session id (`header.runtimeSessionId`) used for ACP `session/load`.

[shouldLoadRuntimeSession](../../../src/acp/session/acpSessionBridge.test.ts) decides load vs new on connect.
[supportsLoadSession](../../../src/acp/infrastructure/acpAgentProcess.ts#L259-L261) reads `loadSession` from agent capabilities.
[loadSession](../../../src/acp/infrastructure/acpAgentProcess.ts#L298-L311) calls the SDK with cwd and `mcpServers` (today empty).

[loadSessionWithAuthRetry](../../../src/acp/session/acpSessionBridge.ts#L914-L927) handles auth-required errors during load.
Replay `session/update` events map through [sessionUpdateMapping.ts](../../../src/acp/mapping/sessionUpdateMapping.ts).
That includes `user_message_chunk` to user text in the trace.

[acpUiSessionController.ts](../../../src/extension/acpUiSessionController.ts) passes `runtimeSessionId` on connect and clears it on chat reset.
[acpUiSessionsStore.ts](../../../src/extension/acpUiSessionsStore.ts) persists the runtime id in the session header.

Protocol: [session setup](../../acp/protocol/v1/session-setup.mdx).

### Local persistence

ACP UI uses client-owned session files (`acpUi/session/1` schema) for session metadata and composer user-message history.

[acpUiSessionJsonl.ts](../../../src/extension/acpUiSessionJsonl.ts) handles read and write.
[resolveSessionsDirectoryUri](../../../src/extension/acpUiSessionJsonl.ts#L55-L77) honors `ib-acp-ui.sessionsDirectory` when set.
See [editor-shell](../ui/editor-shell.md).
[acpUiSessionController.ts](../../../src/extension/acpUiSessionController.ts) passes composer `history` in the `init` bootstrap payload.
[deleteSessionFile](../../../src/extension/acpUiSessionJsonl.ts) removes the per-session folder (or a legacy flat file only).

ACP transcript events are not persisted in `.acp` files.
[visibleTraceFileNameForSessionFile](../../../src/extension/acpUiSessionJsonlFormat.ts#L10-L15) names a `.jsonl` file beside the session file, with the same stem.
That sibling file is the store for the last on-screen transcript and for UI-only metadata (for example thought and tool `durationMs`).
[serializeVisibleTraceJsonl](../../../src/protocol/visibleTrace.ts#L222-L243) writes an optional `meta` header that references the session id and `.acp` file name (`acpUi/visibleTrace/1`), then one trace item per line.
[writeVisibleTraceBesideSession](../../../src/extension/acpUiSessionJsonl.ts#L124-L150) stores that document, capped at the last screen.
[readVisibleTraceBesideSession](../../../src/extension/acpUiSessionJsonl.ts#L112-L122) sends the items on `init`.
Renaming or moving the `.acp` file moves the `.jsonl` with it.
Deleting a flat session file deletes the sibling cache.
Deleting a session folder removes both.
When `session/load` succeeds, agent replay is authoritative for the transcript text.
The webview keeps the cached screen until replay finishes, then swaps the full transcript in without moving the scroll position.
[mergeThoughtDurationsFromCache](../../../webview/acp-ui/src/chatReducer.ts#L307-L335) copies thought durations from the cached `.jsonl` onto the replayed thoughts.
[mergeToolDurationsFromCache](../../../webview/acp-ui/src/chatReducer.ts#L341-L372) copies command durations by `toolCallId`.
On load failure, the bridge falls back to `session/new` and the cached screen stays if replay produced no items (composer history still comes from `init.history`).

### List and delete

When the active agent advertises `sessionCapabilities.list`, the Chats sidebar is driven by `session/list` for the workspace cwd.
[refreshFromAgent](../../../src/extension/acpUiSessionsView.ts#L243-L285) calls [fetchAgentSessionsForWorkspace](../../../src/extension/acpAgentSessionLister.ts#L64-L93).
That helper probes capabilities after `initialize` and paginates via [listAllSessions](../../../src/acp/infrastructure/acpAgentProcess.ts#L281-L296).
When list is not advertised, the tree falls back to [listAcpUiSessionsForAgent](../../../src/extension/acpUiSessionsStore.ts#L151-L155).

Deleting a chat calls [notifyAgentSessionDelete](../../../src/extension/acpUiSessionsView.ts#L457-L468).
That invokes [deleteAgentSession](../../../src/extension/acpAgentSessionLister.ts#L98-L129) when a runtime session id is known.
[deleteAgentSession](../../../src/extension/acpAgentSessionLister.ts#L98-L129) no-ops unless [supportsDeleteSessions](../../../src/acp/infrastructure/acpAgentProcess.ts#L263-L267) is true.
Agent RPC failures are logged and local removal still completes.

Protocol: [session list](../../acp/protocol/v1/session-list.mdx), [session delete](../../acp/protocol/v1/session-delete.mdx).

### Session updates

[sessionUpdateMapping.ts](../../../src/acp/mapping/sessionUpdateMapping.ts) maps `session/update` notifications to webview messages.
`user_message_chunk` maps to append user text (shipped).
`config_option_update` maps to `sessionConfigOptions` and syncs bridge cache via [syncConfigOptionsFromAgent](../../../src/acp/session/acpSessionBridge.ts).

Still no-op in the default branch: `current_mode_update` and `usage_update`.
`session_info_update` updates the session title via a bridge hook, not the trace.

Task: [session-update-handlers](../../tasks/session-update-handlers.md).
Protocol: [session modes](../../acp/protocol/v1/session-modes.mdx), [session config options](../../acp/protocol/v1/session-config-options.mdx).
See also [prompt turn](../../acp/protocol/v1/prompt-turn.mdx).
