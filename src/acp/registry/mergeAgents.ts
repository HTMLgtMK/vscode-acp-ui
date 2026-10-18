import type { AcpAgentSpawnConfig } from "../domain/agentSpawnConfig";

/**
 * Merges manual settings agents with installed registry agents.
 * Manual entries win on matching display name; duplicate installed names get a registry id suffix.
 */
export function mergeAcpAgentConfigs(
    manual: AcpAgentSpawnConfig[],
    installed: AcpAgentSpawnConfig[],
): AcpAgentSpawnConfig[] {
    const manualNames = new Set(manual.map((entry) => entry.name));
    const installedAfterManual = installed.filter((entry) => !manualNames.has(entry.name));
    const nameCounts = new Map<string, number>();
    for (const entry of installedAfterManual) {
        nameCounts.set(entry.name, (nameCounts.get(entry.name) ?? 0) + 1);
    }
    const mergedInstalled = installedAfterManual.map((entry) => {
        if ((nameCounts.get(entry.name) ?? 0) <= 1) {
            return entry;
        }
        const registryId = entry.registryId ?? "unknown";
        return { ...entry, name: `${entry.name} (${registryId})` };
    });
    return [...manual, ...mergedInstalled];
}
