# Sessions

## User facing

One open chat panel is one ACP session: it connects to an agent, streams the conversation, and
cancels or resets on request.

Reopening a chat restores the agent-side conversation when the agent supports `session/load` and
the host remembers the agent session id.
Replayed messages appear in the trace instead of a blank session.
When resume fails or the agent cannot load, the panel falls back to a fresh agent session.

Storing chats is not part of this repo.
The embedding extension owns the session list UI, titles, on-disk transcripts, and composer
history storage; it hands the panel an `init` bootstrap and passes the stored agent session id
back on reopen.
The browser dev shell keeps composer history in `localStorage` for the same reason.

## Implementation

### Session surface this repo ships

[AcpSessionBridge](../../../src/acp/session/acpSessionBridge.ts#L84-L123) owns one agent session:
connect, prompt, cancel, permissions, config options, and disposal.
It re-exports through the SDK barrel with
[AcpAgentProcess](../../../src/sdk/index.ts#L27-L48) so a host can also drive the wire methods
directly.

The ACP session id after `connect` is exposed by
[sessionId](../../../src/acp/session/acpSessionBridge.ts#L707-L710).
That is the value a host persists if it wants to resume later; it is separate from whatever id
the host uses for its own storage.
[connect](../../../src/acp/session/acpSessionBridge.ts#L310-L338) takes it back through
`runtimeSessionId`, and [AcpSessionBridgeHooks](../../../src/acp/session/acpSessionBridge.ts#L56-L62)
lets the host react before a resume and when one fails.

### Resume (`session/load`)

[shouldLoadRuntimeSession](../../../src/acp/session/acpSessionBridge.ts#L69-L78) decides load vs
new on connect: a non-empty runtime id plus an advertised capability.
[supportsLoadSession](../../../src/acp/infrastructure/acpAgentProcess.ts#L327-L329) reads
`loadSession` from agent capabilities.
[loadSession](../../../src/acp/infrastructure/acpAgentProcess.ts#L366-L379) calls the SDK with the
workspace cwd and `mcpServers` (empty today).
[loadSessionWithAuthRetry](../../../src/acp/session/acpSessionBridge.ts#L754-L767) authenticates
once more and retries when the agent answers `load` with an auth-required error; a second failure
propagates and connect falls through to
[newSession](../../../src/acp/infrastructure/acpAgentProcess.ts#L391-L397).

Replayed `session/update` events map through
[sessionUpdateToWebviewMessages](../../../src/acp/mapping/sessionUpdateMapping.ts#L793-L995);
[user_message_chunk](../../../src/acp/mapping/sessionUpdateMapping.ts#L836-L842) becomes user text
in the trace, so a resumed conversation shows both sides.

Protocol: [session setup](../../acp/protocol/v1/session-setup.mdx).

### Composer history handoff

The panel restores recall entries from
[init.history](../../../src/protocol/extensionHostMessages.ts#L138), keeps at most 50 entries,
and emits the whole list on every submit via
[saveHistory](../../../src/protocol/extensionHostMessages.ts#L90-L91).
See [append + cap in submit](../../../webview/acp-ui/src/AcpUiApp.tsx#L391-L398) and the recall
keys in [onComposerKeyDown](../../../webview/acp-ui/src/AcpUiApp.tsx#L518-L557).
The dev shell persists them in the browser:
[standalone/src/main.ts](../../../standalone/src/main.ts#L52-L108).

### List and delete primitives

`session/list` and `session/delete` reach the agent through
[supportsListSessions](../../../src/acp/infrastructure/acpAgentProcess.ts#L320-L325),
[listAllSessions](../../../src/acp/infrastructure/acpAgentProcess.ts#L337-L364) (paginates a cwd
filter), and
[supportsDeleteSessions](../../../src/acp/infrastructure/acpAgentProcess.ts#L331-L335) plus
[deleteSession](../../../src/acp/infrastructure/acpAgentProcess.ts#L381-L389).
`deleteSession` throws when the capability is missing, so a host checks the probe first.
No view or command in this repo calls them; the embedding extension renders whatever list or
delete affordance it wants on top.

Protocol: [session list](../../acp/protocol/v1/session-list.mdx), [session delete](../../acp/protocol/v1/session-delete.mdx).

### Session updates

[handleSessionUpdate](../../../src/acp/session/acpSessionBridge.ts#L792-L798) intercepts two
updates before the mapping layer:
`session_info_update` goes to the host hook (title sync), and `config_option_update` also refreshes
the bridge cache via
[syncConfigOptionsFromAgent](../../../src/acp/session/acpSessionBridge.ts#L629-L653).

The mapping layer has cases for thought, agent message, user message, tool call, tool call update,
available commands, plan, and config options.
Anything else — `current_mode_update` and `usage_update` today — lands in the
[default arm](../../../src/acp/mapping/sessionUpdateMapping.ts#L980-L993) and reaches the trace as
a collapsed raw payload row rather than being dropped.

The last advertised model and config options per agent name stay in
[an in-process cache](../../../src/acp/session/sessionConfigOptionsCache.ts#L8-L10) so a
reconnecting panel can seed before the agent answers.

Task: [session-update-handlers](../../tasks/session-update-handlers.md).
Protocol: [session modes](../../acp/protocol/v1/session-modes.mdx), [session config options](../../acp/protocol/v1/session-config-options.mdx).
See also [prompt turn](../../acp/protocol/v1/prompt-turn.mdx).
