# Agent Registry

## User facing

Browse the official ACP agent catalog from the extension and install agents without hand-editing `settings.json`.
Installed agents appear in the same pickers as manual entries and spawn through the same path.

Use **Browse Agent Registry** from the command palette or the Chats view title menu.
Refresh the catalog with **Refresh Agent Registry**, or remove an install with **Uninstall Registry Agent**.

Manual `ib-acp-ui.agents` entries remain an advanced override and win on matching display name.

## Implementation

### Catalog fetch and cache

[fetchRegistryCatalog](../../../src/acp/registry/fetchRegistry.ts#L12-L34) loads
`https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json` (or `ib-acp-ui.registry.url`).
[getRegistryCatalog](../../../src/extension/acpUiRegistryCatalog.ts) caches the catalog under extension global storage with TTL from `ib-acp-ui.registry.cacheTtlHours`.
[isCatalogCacheFresh](../../../src/acp/registry/cacheRegistry.ts#L8-L16) decides when to refetch.
Failures fall back to the on-disk cache with a warning toast.

### Distribution resolution and install

[resolveDistributionSpawn](../../../src/acp/registry/resolveDistribution.ts#L10-L58) maps a registry agent to an `AcpAgentSpawnConfig` (`npx`, then `uvx`, then `binary`).
[downloadAndInstallBinary](../../../src/acp/registry/binaryInstall.ts#L45-L77) downloads archives, checks optional `sha256`, and extracts into `globalStorage/registry/bin/<id>/<version>/`.

[acpUiInstalledAgents](../../../src/extension/acpUiInstalledAgents.ts) persists the install map at `globalStorage/registry/installed.json`.
[browseAgentRegistry](../../../src/extension/acpUiRegistry.ts#L127-L184) drives the QuickPick install flow.

### Merged agent list

[getAcpAgentConfigsMerged](../../../src/acp/config/mergedAgents.ts#L8-L10) merges manual settings with installed registry spawns via
[mergeAcpAgentConfigs](../../../src/acp/registry/mergeAgents.ts#L7-L25).
Sidebar pickers and session init resolve through the merged list.

Protocol: [ACP agent registry](../../acp/rfds/acp-agent-registry.mdx), [get started registry](../../acp/get-started/registry.mdx).
