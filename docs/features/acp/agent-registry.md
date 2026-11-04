# Agent Registry

## User facing

Planned: read the official ACP agent catalog and turn a catalog entry into something this client can
spawn, instead of requiring a hand-written command line.

Browsing and installing is not a surface in this repo.
The chat panel is handed one agent config by its host, so wherever a person picks an agent — the
embedding extension's own UI, or `standalone/acp-agent.json` in the browser dev shell — is where a
catalog entry has to land.

Not shipped yet.

## Implementation

Not implemented.
No code under `src/acp/registry/`, and no catalog fetch anywhere in the repo.

The part that belongs here is catalog entry to spawn config.
[AcpAgentSpawnConfig](../../../src/acp/domain/agentSpawnConfig.ts#L5-L17) is the shape every agent
reaches the client through, validated by
[parseAcpAgentSpawnConfig](../../../src/acp/domain/agentSpawnConfig.ts#L96-L143), and it is already
public API in [src/sdk/index.ts](../../../src/sdk/index.ts#L14-L25) so a host can build configs from
any source.
The client consumes it at the session boundary:
[AcpSessionBridge](../../../src/acp/session/acpSessionBridge.ts#L99-L104) takes one per session, and
[loadAgentConfigs](../../../standalone/server.ts#L287-L321) is the in-repo example of reading a JSON
file into the same shape.

Agent configuration no longer has a settings entry point in this repo, so there is nothing here to
merge a catalog into; the panel takes whatever the host hands it.

Task: [acp-registry](../../tasks/acp-registry.md).
Protocol: [ACP agent registry](../../acp/rfds/acp-agent-registry.mdx), [get started registry](../../acp/get-started/registry.mdx).
