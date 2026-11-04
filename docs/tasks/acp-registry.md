---
status: not-started
feature: docs/features/acp/agent-registry.md
---

# Task: Resolve ACP registry entries into spawn configs

## Deliverable

Ship a host-agnostic registry module that turns an official ACP catalog entry into an
[AcpAgentSpawnConfig](../../../src/acp/domain/agentSpawnConfig.ts#L5-L17), reachable through the SDK
barrel so an embedding extension can list and launch catalog agents from its own UI.

This is a library-side deliverable, not an extension feature.
There are no commands, quick picks, settings keys, or catalog screens in this repo — see
[agent-registry](../features/acp/agent-registry.md) for what the client does with a config once it
exists.

Minimum viable integration:

1. Fetch and cache `registry.json`.
2. Resolve one entry's distribution into a spawn config (`npx` and `uvx` required for v1).
3. Return plain `AcpAgentSpawnConfig` values; the caller owns storage, display, and launching.

Binary download can land in a follow-up commit within this task.

https://github.com/agentclientprotocol/registry/releases/download/v2026.07.04-386a2ae/registry.json

## Why

A person who wants to try a new agent currently has to write the launch line themselves. The
standalone dev shell reads one from a JSON file
([loadAgentConfigs](../../../standalone/server.ts#L287-L321)), and a VS Code host builds configs in
its own code and passes them to the SDK.
The [ACP Registry](https://agentclientprotocol.com/get-started/registry) publishes curated manifests
with distribution metadata (`npx`, `uvx`, `binary`), icons, and versions at a stable CDN URL.
Other ACP clients are expected to consume this catalog, and the mapping from a manifest to a spawn
config is client work that does not belong in any one host.

Protocol docs in this repo:

- `docs/acp/rfds/acp-agent-registry.mdx`
- `docs/acp/get-started/registry.mdx`

## Scope boundary

| Concern | Owner |
| --- | --- |
| Catalog fetch, cache, distribution resolution | this repo, under `src/acp/registry/` |
| Spawn config shape and validation | [agentSpawnConfig.ts](../../../src/acp/domain/agentSpawnConfig.ts#L96-L143) |
| Install list, storage, updates | embedding extension |
| Browsing, picking, and launching agents | embedding extension |
| Consuming a config | [AcpSessionBridge](../../../src/acp/session/acpSessionBridge.ts#L99-L104) |

## Registry data

**URL:**

```text
https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json
```

**Distribution -> spawn config:**

| Registry | Spawn |
| --- | --- |
| `npx.package` | `command: "npx"`, `args: ["-y", package, ...manifest.args]` |
| `uvx.package` | `command: "uvx"`, `args: [package, ...manifest.args]` |
| `binary.<target>` | Absolute path to the extracted `cmd` as `command` (download itself is out of scope for v1) |

Platform target from `process.platform` + `process.arch`:

| Platform | Arch | Target key |
| --- | --- | --- |
| `darwin` | `arm64` | `darwin-aarch64` |
| `darwin` | `x64` | `darwin-x86_64` |
| `linux` | `arm64` | `linux-aarch64` |
| `linux` | `x64` | `linux-x86_64` |
| `win32` | `arm64` | `windows-aarch64` |
| `win32` | `x64` | `windows-x86_64` |

Prefer `npx` over `uvx` over `binary` when multiple are present.

Resolution returns `AcpAgentSpawnConfig` values only.
Do not add registry bookkeeping fields to the user-facing config shape; if update tracking needs an
id, keep it beside the config in the caller's own record.

## Out of scope

- Contributing agents to the upstream registry repo.
- Terminal-auth or env_var-auth agents (ACP UI supports agent auth only today; see
  [resolveAuthMethodId](../../../src/acp/domain/agentSpawnConfig.ts#L43-L73)).
- Any install persistence, merge rules, or onboarding prompt — all host surface.
- Full registry website feature parity (filters, search facets).
- Auto-updating installed agents.

## Implementation checklist

### Core (required for task completion)

- [ ] `src/acp/registry/` module with catalog types, fetch with timeout, and cache.
- [ ] Distribution resolution to `AcpAgentSpawnConfig` (`npx` + `uvx`).
- [ ] Platform target mapping with a clear error when the platform is unsupported.
- [ ] Exported from [src/sdk/index.ts](../../../src/sdk/index.ts#L14-L25) so hosts can consume it.
- [ ] Unit tests with a committed catalog fixture, no live network.
- [ ] `npm run verify` passes.

### Polish (nice to have)

- [ ] Dev-shell parity: `standalone/acp-agent.json` can name a catalog id.
- [ ] "Update available" hint data (display stays with the host).

## Edge cases

| Case | Behavior |
| --- | --- |
| CDN unreachable | Return the cached catalog; surface one error, never a partial list |
| Agent removed from catalog | Still resolvable from the cached manifest |
| `npx` missing on PATH | Resolution succeeds; the spawn error comes later from the transport |
| Auth unsupported | Resolution succeeds; auth is enforced at connect time |

## Definition of done

1. A host can fetch the catalog, resolve a chosen entry, and hand the result straight to
   `AcpSessionBridge` without editing this repo's protocol types.
2. Registry fetch failures do not break the client (cached catalog or empty with a message).
3. New registry code has automated tests, no live network in CI.
4. User-facing copy says **ACP** / **ACP UI**, never APC.

## References

- CDN: `https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json`
- Repo: `https://github.com/agentclientprotocol/registry`
- Schema: `https://github.com/agentclientprotocol/registry/blob/main/agent.schema.json`
- Spawn config: [agentSpawnConfig.ts](../../../src/acp/domain/agentSpawnConfig.ts#L1-L17)
