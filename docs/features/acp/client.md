# Client

## User facing

ACP UI identifies itself and advertises client capabilities during the `initialize` handshake with each agent.

Agents receive `clientInfo` (name, version, title) from the embedding host's package metadata on
every connect.
If protocol version negotiation fails, the chat shows a clear error with guidance to update ACP UI or the agent.

The most visible capability result today is the Cursor model and thinking-level toolbar in the composer when you use the Cursor ACP agent.
Other capability flags (terminals, terminal auth, boolean config options, elicitation) are planned.
See [session-config](../ui/session-config.md) for the shipped model toolbar.

## Implementation

### Capabilities

[buildAcpClientCapabilities](../../../src/acp/infrastructure/acpAgentProcess.ts#L172-L184) builds the `clientCapabilities` object sent on `initialize`.
All agents advertise filesystem read and write support.

For Cursor spawn configs, [isCursorAcpAgent](../../../src/acp/domain/agentSpawnConfig.ts#L29-L37) gates `_meta.parameterizedModelPicker: true`.
That unlocks agent-ordered `configOptions` rendered in [ConfigOptionControls](../../../webview/acp-ui/src/components/ConfigOptionControls.tsx#L69-L161).

Remaining Zed parity gaps (terminal, terminal auth, boolean config options, elicitation) are listed in the task checklist.
Do not advertise a capability until the matching client callback exists.

Task: [client-capabilities](../../tasks/client-capabilities.md).
Protocol: [extensibility](../../acp/protocol/extensibility.mdx), [session config options](../../acp/protocol/v1/session-config-options.mdx).

### Initialization metadata

`clientInfo` is host input, not activation wiring.
A host sets the process-wide value with
[configureAcpClientInfo](../../../src/acp/infrastructure/acpAgentProcess.ts#L121-L124) — built by
[buildAcpClientInfoFromPackage](../../../src/acp/infrastructure/acpAgentProcess.ts#L127-L145) from
its own `package.json` — or passes `clientInfo` per session through
[AcpAgentProcessOptions](../../../src/acp/infrastructure/acpAgentProcess.ts#L191-L194).
Both reach the webview host through the SDK barrel
[src/sdk/index.ts](../../../src/sdk/index.ts#L33-L40).
The dev bridge is the in-repo caller:
[standalone/server.ts](../../../standalone/server.ts#L56-L64) reads this repo's `package.json` once
at startup.
With neither set, [buildAcpClientInfo](../../../src/acp/infrastructure/acpAgentProcess.ts#L147-L157)
falls back to `ib-acp-ui` / `0.0.0` / `ACP UI`.

[AcpAgentProcess.start](../../../src/acp/infrastructure/acpAgentProcess.ts#L287-L292) sends it on
every `initialize`.

[assertNegotiatedProtocolVersion](../../../src/acp/infrastructure/acpAgentProcess.ts#L159-L169) rejects incompatible agent responses.

It throws [AcpProtocolVersionMismatchError](../../../src/acp/infrastructure/acpAgentProcess.ts#L100-L117).

The error message guides the user to update ACP UI or the agent.

Connect failures surface that message in the chat UI: the host catches it from `connect` and posts
an `error` message, as
[standalone/server.ts](../../../standalone/server.ts#L727-L735) does for the browser shell.

Task: [initialization-metadata](../../tasks/initialization-metadata.md).
Protocol: [initialization](../../acp/protocol/v1/initialization.mdx).
