import type { AcpRegistryCatalog } from "./types";

export type CachedCatalog = {
    fetchedAt: number;
    catalog: AcpRegistryCatalog;
};

export function isCatalogCacheFresh(fetchedAt: number, ttlHours: number, nowMs: number): boolean {
    if (ttlHours <= 0) {
        return false;
    }
    const ttlMs = ttlHours * 60 * 60 * 1000;
    return nowMs - fetchedAt < ttlMs;
}
