# Session config

## User facing

When the connected agent advertises session configuration options, ACP UI shows a toolbar of
dropdowns in the composer for model and tuning picks, in the order the agent sent them.

Cursor-style agents that encode tuning in bracketed model ids — for example
`claude-4.6-sonnet-medium-thinking` — get the same treatment: the id is parsed and the model row is
followed by derived selects such as **Fast** and **Thinking**.

Agents that send explicit `model_config` and related options use the same row of dropdowns: model,
thinking, context, effort, and more.

A colored **session mode** label appears when the agent exposes a mode config option and the current value is not the default.

Picks lock after you send the first message in a turn so mid-run changes do not fight the agent.
A host that fixes the agent when it creates the session can opt out of that lock.
Shift+Tab cycles the mode option when one is available.

## Implementation

### Config option normalization

[sessionConfigOptionsFromAgent](../../../src/acp/session/sessionConfigOptions.ts#L396-L436) converts ACP `SessionConfigOption` payloads into UI rows.
See [AcpUiSessionConfigOption](../../../src/acp/session/sessionConfigOptions.ts#L16-L33).

[buildModelId](../../../src/acp/session/modelVariantPicker.ts#L153-L166) handles Cursor bracketed model ids.
[parseModelIdBracketParams](../../../src/acp/session/modelVariantPicker.ts#L46-L74) maps derived boolean params (`fast`, `thinking`).
When an agent advertises no explicit param options,
[deriveModelParamOptionsFromModelSelect](../../../src/acp/session/sessionConfigOptions.ts#L778-L786)
scans the model family and synthesizes the selects.

`config_option_update` in [sessionUpdateToWebviewMessages](../../../src/acp/mapping/sessionUpdateMapping.ts#L966-L979) refreshes options mid-session.

### Composer controls

[ConfigOptionControls](../../../webview/acp-ui/src/components/ConfigOptionControls.tsx#L66-L161) renders one select per option, boolean options included, in agent order.
[ComposerConfigLoading](../../../webview/acp-ui/src/components/ConfigOptionControls.tsx#L29-L64) shows a disabled placeholder while options load.

[SessionModeIndicator](../../../webview/acp-ui/src/components/SessionModeIndicator.tsx#L13-L29) reads mode metadata.
It calls [sessionModeIndicatorFromOption](../../../src/acp/session/sessionModeIndicator.ts#L52-L63).

### Applying picks to the agent

The webview posts [setSessionModel and setSessionConfigOption](../../../src/protocol/extensionHostMessages.ts#L78-L83);
[tryParseWebviewMessage](../../../src/protocol/extensionHostMessages.ts#L346-L357) gates the payload.
The host forwards them to the bridge — in this repo
[standalone/server.ts](../../../standalone/server.ts#L844-L878) is the caller — which reaches the
agent through
[setSessionModel](../../../src/acp/session/acpSessionBridge.ts#L389-L416) and
[setSessionConfigOption](../../../src/acp/session/acpSessionBridge.ts#L418-L454).
A model pick goes over `session/set_config_option` when the agent advertises a model option and
falls back to `session/set_mode` otherwise
([applySessionModelWireValue](../../../src/acp/session/acpSessionBridge.ts#L456-L466)).

[readCachedComposerSeed](../../../src/acp/session/sessionConfigOptionsCache.ts#L86-L95) restores cached param options for an agent name when switching models, so the
toolbar is populated before the agent answers.

[chatReducer](../../../webview/acp-ui/src/chatReducer.ts#L643-L652) sets `composerPicksLocked` on submit;
[pick handlers](../../../webview/acp-ui/src/chatReducer.ts#L654-L688) ignore later picks until the
session resets.
[init.lockSessionAgent](../../../src/protocol/extensionHostMessages.ts#L139-L143) keeps the picks open.

### Client capability gate

Cursor spawn configs advertise the parameterized model picker meta flag during initialize.
[buildAcpClientCapabilities](../../../src/acp/infrastructure/acpAgentProcess.ts#L171-L184) builds that payload.
[isCursorAcpAgent](../../../src/acp/domain/agentSpawnConfig.ts#L29-L37) gates the path.
That unlocks agent-ordered config options from the Cursor agent.

Protocol: [session config options](../../acp/protocol/v1/session-config-options.mdx).
Related: [client](../acp/client.md).
