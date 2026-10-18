import { parseRegistryCatalog } from "./parseRegistry";
import type { AcpRegistryCatalog } from "./types";

export const DEFAULT_REGISTRY_URL =
    "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json";

const DEFAULT_FETCH_TIMEOUT_MS = 30_000;

/**
 * Fetches and validates a registry catalog from the given URL.
 */
export async function fetchRegistryCatalog(
    url: string,
    timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<AcpRegistryCatalog> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
            throw new Error(
                `Registry fetch failed with HTTP ${response.status}: ${response.statusText}`,
            );
        }
        const body: unknown = await response.json();
        const catalog = parseRegistryCatalog(body);
        if (catalog === undefined) {
            throw new Error("Registry response failed validation");
        }
        return catalog;
    } finally {
        clearTimeout(timeout);
    }
}
