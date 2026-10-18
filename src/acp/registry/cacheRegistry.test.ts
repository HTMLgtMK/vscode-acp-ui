import { describe, expect, it } from "vite-plus/test";
import { isCatalogCacheFresh } from "./cacheRegistry";

describe("isCatalogCacheFresh", () => {
    it("returns false when ttlHours is 0", () => {
        expect(isCatalogCacheFresh(0, 0, 1_000)).toBe(false);
    });

    it("returns true within the TTL window", () => {
        const fetchedAt = 1_000;
        const ttlHours = 1;
        const nowMs = fetchedAt + 30 * 60 * 1000;
        expect(isCatalogCacheFresh(fetchedAt, ttlHours, nowMs)).toBe(true);
    });

    it("returns false after the TTL window", () => {
        const fetchedAt = 1_000;
        const ttlHours = 1;
        const nowMs = fetchedAt + 2 * 60 * 60 * 1000;
        expect(isCatalogCacheFresh(fetchedAt, ttlHours, nowMs)).toBe(false);
    });
});
