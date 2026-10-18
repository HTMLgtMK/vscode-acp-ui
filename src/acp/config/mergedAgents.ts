import { listInstalledAgentSpawns } from "../../extension/acpUiInstalledAgents";
import { mergeAcpAgentConfigs } from "../registry/mergeAgents";
import { type AcpAgentConfig, getAcpAgentConfigsFromSettings } from "./vscodeSettingsAgents";

export type { AcpAgentConfig };

/** Merges manual settings agents with installed registry agents (manual wins on name). */
export function getAcpAgentConfigsMerged(): AcpAgentConfig[] {
    return mergeAcpAgentConfigs(getAcpAgentConfigsFromSettings(), listInstalledAgentSpawns());
}

/** Returns a merged agent configuration by display name, if present. */
export function getAcpAgentConfigByNameMerged(name: string): AcpAgentConfig | undefined {
    return getAcpAgentConfigsMerged().find((c) => c.name === name);
}
