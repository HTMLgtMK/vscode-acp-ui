# Permissions

## User facing

When an agent needs approval before running a tool, the chat panel replaces its composer with an
approval card.
The card names the tool (for example a shell command or a file write), shows the options the agent
sent — nothing is hardcoded — and counts the queue (`2 / 3 pending`) when several requests arrive
in one turn.

Pick an option to answer, or press Dismiss / Esc to close the card without answering: the decision
then lands when the agent's own timeout rejects it.
The composer is not rendered while a card is on screen, so no other message can be sent.

## Implementation

### ACP callback

[AcpAgentProcess.start](../../../src/acp/infrastructure/acpAgentProcess.ts#L260-L262) wires the SDK
client's `requestPermission` to the bridge.
[queuePermissionRequest](../../../src/acp/session/acpSessionBridge.ts#L125-L138) assigns a
`perm-N` id, posts the webview messages, and parks a promise.

[handlePermissionResponse](../../../src/acp/session/acpSessionBridge.ts#L143-L168) resolves the
waiter with `selected` or `cancelled`.
[cancelPendingPermissions](../../../src/acp/session/acpSessionBridge.ts#L170-L175) drains the
waiters on cancel and on
[dispose](../../../src/acp/session/acpSessionBridge.ts#L712-L718).

### Downlink and uplink messages

[extensionMessagesForPermissionRequest](../../../src/acp/mapping/sessionUpdateMapping.ts#L145-L188)
builds the `permissionRequest` message from the agent payload, and appends a tool subtitle update
when the request carries a resolvable shell command line.

The panel replies with `permissionResponse` — either `selectedOptionId` or `cancelled: true`
([shape](../../../src/protocol/extensionHostMessages.ts#L84-L89)), parsed by
[tryParseWebviewMessage](../../../src/protocol/extensionHostMessages.ts#L358-L380).
The host forwards it to the bridge;
[standalone/server.ts](../../../standalone/server.ts#L835-L836) is the in-repo example of that hop.

### Webview approval card

[chatReducer](../../../webview/acp-ui/src/chatReducer.ts#L584-L600) queues requests as
`permissionQueue`, so a later prompt never replaces the one on screen;
[dropPermission](../../../webview/acp-ui/src/chatReducer.ts#L606-L618) removes one when it is
answered, and the denominator only resets when the queue empties.
[PermissionPromptState](../../../webview/acp-ui/src/chatReducer.ts#L72-L81) carries the tool title,
options, and queue position.

[AcpUiApp](../../../webview/acp-ui/src/AcpUiApp.tsx#L574-L588) renders the head of the queue and
routes the decision.
[PermissionApprovalCard](../../../webview/acp-ui/src/components/PermissionApprovalCard.tsx#L23-L106)
draws the card; option buttons come straight from
[prompt.options](../../../webview/acp-ui/src/components/PermissionApprovalCard.tsx#L81-L103) and
[Esc is a local Dismiss](../../../webview/acp-ui/src/components/PermissionApprovalCard.tsx#L40-L54).
The card and the composer share one slot in
[the composer stack](../../../webview/acp-ui/src/AcpUiApp.tsx#L770-L784).

Protocol: [tool calls](../../acp/protocol/v1/tool-calls.mdx).
