import { workspace } from "vscode";
import { type AcpAgentSpawnConfig, parseAcpAgentSpawnConfig } from "../domain/agentSpawnConfig";

export type AcpAgentConfig = AcpAgentSpawnConfig;

const settingKey = "ib-acp-ui.agents";

/** Reads manual-only ACP agent overrides from VS Code user/workspace settings. */
export function getAcpAgentConfigsFromSettings(): AcpAgentConfig[] {
    const raw = workspace.getConfiguration().get<unknown[]>(settingKey, []);
    const result: AcpAgentConfig[] = [];
    for (const entry of raw) {
        const parsed = parseAcpAgentSpawnConfig(entry);
        if (parsed) {
            result.push(parsed);
        }
    }
    return result;
}

/** Returns a manual settings agent by display name (does not include registry installs). */
export function getAcpAgentConfigByName(name: string): AcpAgentConfig | undefined {
    return getAcpAgentConfigsFromSettings().find((c) => c.name === name);
}
