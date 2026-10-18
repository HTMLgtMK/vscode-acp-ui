import type { AcpAgentSpawnConfig } from "../domain/agentSpawnConfig";
import { platformTargetKey } from "./platformTarget";
import type { AcpRegistryAgent, AcpRegistryBinaryTargetKey } from "./types";

export { platformTargetKey } from "./platformTarget";

export type ResolveDistributionOptions = {
    binaryCommandAbsolutePath?: string;
    platform?: string;
    arch?: string;
};

/**
 * Resolves registry distribution metadata to a spawn config (npx, then uvx, then binary).
 */
export function resolveDistributionSpawn(
    agent: AcpRegistryAgent,
    options?: ResolveDistributionOptions,
): AcpAgentSpawnConfig | undefined {
    const { distribution } = agent;
    if (distribution.npx !== undefined) {
        const pkg = distribution.npx;
        const args = ["-y", pkg.package, ...(pkg.args ?? [])];
        return {
            name: agent.name,
            command: "npx",
            args,
            registryId: agent.id,
            ...(pkg.env !== undefined ? { env: pkg.env } : {}),
        };
    }
    if (distribution.uvx !== undefined) {
        const pkg = distribution.uvx;
        const args = [pkg.package, ...(pkg.args ?? [])];
        return {
            name: agent.name,
            command: "uvx",
            args,
            registryId: agent.id,
            ...(pkg.env !== undefined ? { env: pkg.env } : {}),
        };
    }
    const binaryPath = options?.binaryCommandAbsolutePath;
    if (distribution.binary !== undefined && binaryPath !== undefined && binaryPath.length > 0) {
        const key = platformTargetKey(
            options?.platform ?? process.platform,
            options?.arch ?? process.arch,
        ) as AcpRegistryBinaryTargetKey | undefined;
        if (key === undefined) {
            return undefined;
        }
        const target = distribution.binary[key];
        if (target === undefined) {
            return undefined;
        }
        return {
            name: agent.name,
            command: binaryPath,
            args: target.args ?? [],
            registryId: agent.id,
            ...(target.env !== undefined ? { env: target.env } : {}),
        };
    }
    return undefined;
}
