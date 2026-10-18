# Agents

## User facing

ACP UI talks to one or more ACP-capable agent processes.
Install agents from the official registry (**Browse Agent Registry**), or add advanced manual entries in `ib-acp-ui.agents` (display name, executable, optional args/env, optional `authMethodId`).

Manual settings override registry installs when the display name matches.
There are no built-in default agents; install from the registry on first use.

The **Chats** sidebar shows an agent picker.
The selected agent is used for new chats and for the agent-backed session list when the agent supports `session/list`.
Each open chat remembers which agent it was created with via the session file header.
Before the first message, the composer can switch agents among the merged list.

## Implementation

### Settings and merge

[getAcpAgentConfigsFromSettings](../../../src/acp/config/vscodeSettingsAgents.ts#L9-L19) reads manual `ib-acp-ui.agents` only.
[getAcpAgentConfigsMerged](../../../src/acp/config/mergedAgents.ts#L8-L10) combines those with installed registry agents.
[parseAcpAgentSpawnConfig](../../../src/acp/domain/agentSpawnConfig.ts) validates each entry.

[isCursorAcpAgent](../../../src/acp/domain/agentSpawnConfig.ts) detects Cursor spawn configs for capability and UI gates (including `registryId === "cursor"`).

### Active agent selection

[initializeAcpUiActiveAgent](../../../src/extension/acpUiActiveAgent.ts) binds global state.
[getActiveAgentConfig](../../../src/extension/acpUiActiveAgent.ts) returns the stored name or the first merged agent.
[setActiveAgentName](../../../src/extension/acpUiActiveAgent.ts) persists the sidebar picker choice.

[pickAcpAgentConfig](../../../src/extension/acpUiAgentPicker.ts) shows a quick pick over the merged list, with a **Browse Agent Registry** entry.
[selectActiveAgent](../../../src/extension/acpUiSessionsView.ts) updates the active agent for the Chats view.

### Per-session agent binding

Session file headers store `agentName`.
[acpUiSessionController](../../../src/extension/acpUiSessionController.ts) resolves the agent config when a chat opens.
[setAcpUiSessionAgentName](../../../src/extension/acpUiSessionsStore.ts) updates the header when the user switches agents on a new chat.
[AgentPicker](../../../webview/acp-ui/src/components/AgentPicker.tsx) in the composer posts `setSessionAgent` while the session agent is unlocked.

### Process spawn

[AcpAgentProcess.start](../../../src/acp/infrastructure/acpAgentProcess.ts) spawns the configured command with workspace `cwd`.
It runs `initialize` and manages the stdio NDJSON connection.

Related: [authentication](../acp/authentication.md), [client](../acp/client.md), [agent-registry](../acp/agent-registry.md).
