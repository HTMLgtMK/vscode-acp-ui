import type {
    AcpRegistryAgent,
    AcpRegistryAgentDistribution,
    AcpRegistryBinaryDistribution,
    AcpRegistryBinaryTarget,
    AcpRegistryBinaryTargetKey,
    AcpRegistryCatalog,
    AcpRegistryPackageDistribution,
} from "./types";

const BINARY_TARGET_KEYS: AcpRegistryBinaryTargetKey[] = [
    "darwin-aarch64",
    "darwin-x86_64",
    "linux-aarch64",
    "linux-x86_64",
    "windows-aarch64",
    "windows-x86_64",
];

function parseStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }
    const result: string[] = [];
    for (const item of value) {
        if (typeof item !== "string") {
            return undefined;
        }
        result.push(item);
    }
    return result;
}

function parseStringRecord(value: unknown): Record<string, string> | undefined {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return undefined;
    }
    const result: Record<string, string> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
        if (typeof v !== "string") {
            return undefined;
        }
        result[key] = v;
    }
    return result;
}

function parsePackageDistribution(value: unknown): AcpRegistryPackageDistribution | undefined {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return undefined;
    }
    const record = value as Record<string, unknown>;
    if (typeof record.package !== "string" || record.package.length === 0) {
        return undefined;
    }
    const args = parseStringArray(record.args);
    if (record.args !== undefined && args === undefined) {
        return undefined;
    }
    const env = parseStringRecord(record.env);
    if (record.env !== undefined && env === undefined) {
        return undefined;
    }
    return {
        package: record.package,
        ...(args !== undefined && args.length > 0 ? { args } : {}),
        ...(env !== undefined && Object.keys(env).length > 0 ? { env } : {}),
    };
}

function parseBinaryTarget(value: unknown): AcpRegistryBinaryTarget | undefined {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return undefined;
    }
    const record = value as Record<string, unknown>;
    if (typeof record.archive !== "string" || record.archive.length === 0) {
        return undefined;
    }
    if (typeof record.cmd !== "string" || record.cmd.length === 0) {
        return undefined;
    }
    if (record.sha256 !== undefined && typeof record.sha256 !== "string") {
        return undefined;
    }
    const args = parseStringArray(record.args);
    if (record.args !== undefined && args === undefined) {
        return undefined;
    }
    const env = parseStringRecord(record.env);
    if (record.env !== undefined && env === undefined) {
        return undefined;
    }
    return {
        archive: record.archive,
        cmd: record.cmd,
        ...(typeof record.sha256 === "string" ? { sha256: record.sha256 } : {}),
        ...(args !== undefined && args.length > 0 ? { args } : {}),
        ...(env !== undefined && Object.keys(env).length > 0 ? { env } : {}),
    };
}

function parseBinaryDistribution(value: unknown): AcpRegistryBinaryDistribution | undefined {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return undefined;
    }
    const record = value as Record<string, unknown>;
    const result: AcpRegistryBinaryDistribution = {};
    let hasTarget = false;
    for (const key of BINARY_TARGET_KEYS) {
        if (record[key] === undefined) {
            continue;
        }
        const target = parseBinaryTarget(record[key]);
        if (target === undefined) {
            return undefined;
        }
        result[key] = target;
        hasTarget = true;
    }
    for (const key of Object.keys(record)) {
        if (!BINARY_TARGET_KEYS.includes(key as AcpRegistryBinaryTargetKey)) {
            return undefined;
        }
    }
    return hasTarget ? result : undefined;
}

function parseDistribution(value: unknown): AcpRegistryAgentDistribution | undefined {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return undefined;
    }
    const record = value as Record<string, unknown>;
    const npx = record.npx !== undefined ? parsePackageDistribution(record.npx) : undefined;
    if (record.npx !== undefined && npx === undefined) {
        return undefined;
    }
    const uvx = record.uvx !== undefined ? parsePackageDistribution(record.uvx) : undefined;
    if (record.uvx !== undefined && uvx === undefined) {
        return undefined;
    }
    const binary = record.binary !== undefined ? parseBinaryDistribution(record.binary) : undefined;
    if (record.binary !== undefined && binary === undefined) {
        return undefined;
    }
    if (npx === undefined && uvx === undefined && binary === undefined) {
        return undefined;
    }
    const allowed = new Set(["binary", "npx", "uvx"]);
    for (const key of Object.keys(record)) {
        if (!allowed.has(key)) {
            return undefined;
        }
    }
    return {
        ...(binary !== undefined ? { binary } : {}),
        ...(npx !== undefined ? { npx } : {}),
        ...(uvx !== undefined ? { uvx } : {}),
    };
}

function parseRegistryAgent(value: unknown): AcpRegistryAgent | undefined {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return undefined;
    }
    const record = value as Record<string, unknown>;
    if (
        typeof record.id !== "string" ||
        record.id.length === 0 ||
        typeof record.name !== "string" ||
        record.name.length === 0 ||
        typeof record.version !== "string" ||
        record.version.length === 0 ||
        typeof record.description !== "string" ||
        record.description.length === 0
    ) {
        return undefined;
    }
    const distribution = parseDistribution(record.distribution);
    if (distribution === undefined) {
        return undefined;
    }
    const authors = parseStringArray(record.authors);
    if (record.authors !== undefined && authors === undefined) {
        return undefined;
    }
    const optionalString = (field: unknown): string | undefined =>
        typeof field === "string" && field.length > 0 ? field : undefined;
    if (record.repository !== undefined && optionalString(record.repository) === undefined) {
        return undefined;
    }
    if (record.website !== undefined && optionalString(record.website) === undefined) {
        return undefined;
    }
    if (record.license !== undefined && optionalString(record.license) === undefined) {
        return undefined;
    }
    if (record.license_url !== undefined && optionalString(record.license_url) === undefined) {
        return undefined;
    }
    if (record.icon !== undefined && optionalString(record.icon) === undefined) {
        return undefined;
    }
    return {
        id: record.id,
        name: record.name,
        version: record.version,
        description: record.description,
        distribution,
        ...(optionalString(record.repository) !== undefined
            ? { repository: optionalString(record.repository) }
            : {}),
        ...(optionalString(record.website) !== undefined
            ? { website: optionalString(record.website) }
            : {}),
        ...(authors !== undefined && authors.length > 0 ? { authors } : {}),
        ...(optionalString(record.license) !== undefined
            ? { license: optionalString(record.license) }
            : {}),
        ...(optionalString(record.license_url) !== undefined
            ? { license_url: optionalString(record.license_url) }
            : {}),
        ...(optionalString(record.icon) !== undefined ? { icon: optionalString(record.icon) } : {}),
    };
}

/** Validates and parses a registry catalog payload from the CDN or cache. */
export function parseRegistryCatalog(value: unknown): AcpRegistryCatalog | undefined {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return undefined;
    }
    const record = value as Record<string, unknown>;
    if (typeof record.version !== "string" || record.version.length === 0) {
        return undefined;
    }
    if (!Array.isArray(record.agents)) {
        return undefined;
    }
    const agents: AcpRegistryAgent[] = [];
    for (const entry of record.agents) {
        const agent = parseRegistryAgent(entry);
        if (agent === undefined) {
            return undefined;
        }
        agents.push(agent);
    }
    return { version: record.version, agents };
}
