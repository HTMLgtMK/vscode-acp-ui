import { workspace } from "vscode";
import { DEFAULT_REGISTRY_URL } from "./fetchRegistry";

export const REGISTRY_ENABLED_KEY = "ib-acp-ui.registry.enabled";
export const REGISTRY_URL_KEY = "ib-acp-ui.registry.url";
export const REGISTRY_CACHE_TTL_HOURS_KEY = "ib-acp-ui.registry.cacheTtlHours";

const defaultCacheTtlHours = 24;

export function isRegistryEnabled(): boolean {
    return workspace.getConfiguration().get<boolean>(REGISTRY_ENABLED_KEY, true);
}

export function getRegistryUrl(): string {
    return workspace.getConfiguration().get<string>(REGISTRY_URL_KEY, DEFAULT_REGISTRY_URL);
}

export function getRegistryCacheTtlHours(): number {
    return workspace
        .getConfiguration()
        .get<number>(REGISTRY_CACHE_TTL_HOURS_KEY, defaultCacheTtlHours);
}
