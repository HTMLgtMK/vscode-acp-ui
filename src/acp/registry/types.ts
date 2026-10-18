import type { AcpAgentSpawnConfig } from "../domain/agentSpawnConfig";

export type AcpRegistryBinaryTargetKey =
    | "darwin-aarch64"
    | "darwin-x86_64"
    | "linux-aarch64"
    | "linux-x86_64"
    | "windows-aarch64"
    | "windows-x86_64";

export type AcpRegistryPackageDistribution = {
    package: string;
    args?: string[];
    env?: Record<string, string>;
};

export type AcpRegistryBinaryTarget = {
    archive: string;
    sha256?: string;
    cmd: string;
    args?: string[];
    env?: Record<string, string>;
};

export type AcpRegistryBinaryDistribution = Partial<
    Record<AcpRegistryBinaryTargetKey, AcpRegistryBinaryTarget>
>;

export type AcpRegistryAgentDistribution = {
    binary?: AcpRegistryBinaryDistribution;
    npx?: AcpRegistryPackageDistribution;
    uvx?: AcpRegistryPackageDistribution;
};

export type AcpRegistryAgent = {
    id: string;
    name: string;
    version: string;
    description: string;
    repository?: string;
    website?: string;
    authors?: string[];
    license?: string;
    license_url?: string;
    icon?: string;
    distribution: AcpRegistryAgentDistribution;
};

export type AcpRegistryCatalog = {
    version: string;
    agents: AcpRegistryAgent[];
};

export type AcpInstalledAgent = {
    registryId: string;
    installedVersion: string;
    spawn: AcpAgentSpawnConfig;
};

export type AcpInstalledAgentsMap = {
    schemaVersion: 1;
    agents: Record<string, AcpInstalledAgent>;
};
