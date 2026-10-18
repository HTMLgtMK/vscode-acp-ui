import { Uri, workspace, type ExtensionContext } from "vscode";
import { isCatalogCacheFresh, type CachedCatalog } from "../acp/registry/cacheRegistry";
import { fetchRegistryCatalog } from "../acp/registry/fetchRegistry";
import {
    getRegistryCacheTtlHours,
    getRegistryUrl,
    isRegistryEnabled,
} from "../acp/registry/registrySettings";
import type { AcpRegistryCatalog } from "../acp/registry/types";

let extensionContext: ExtensionContext | null = null;

const catalogSubdir = "registry";
const catalogFileName = "catalog.json";

function catalogFileUri(): Uri {
    if (extensionContext === null) {
        throw new Error("ACP UI registry catalog not initialized");
    }
    return Uri.joinPath(extensionContext.globalStorageUri, catalogSubdir, catalogFileName);
}

/** Binds global storage for the registry catalog cache. */
export function initializeAcpUiRegistryCatalog(context: ExtensionContext): void {
    extensionContext = context;
}

async function readCachedCatalog(): Promise<CachedCatalog | undefined> {
    const uri = catalogFileUri();
    try {
        const raw = await workspace.fs.readFile(uri);
        const parsed = JSON.parse(Buffer.from(raw).toString("utf8")) as CachedCatalog;
        if (
            typeof parsed.fetchedAt !== "number" ||
            parsed.catalog === undefined ||
            !Array.isArray(parsed.catalog.agents)
        ) {
            return undefined;
        }
        return parsed;
    } catch {
        return undefined;
    }
}

async function writeCachedCatalog(cached: CachedCatalog): Promise<void> {
    const uri = catalogFileUri();
    await workspace.fs.createDirectory(Uri.joinPath(uri, ".."));
    const content = JSON.stringify(cached, null, 2);
    await workspace.fs.writeFile(uri, Buffer.from(content, "utf8"));
}

export type RegistryCatalogResult = {
    catalog: AcpRegistryCatalog;
    fromCache: boolean;
    warning?: string;
};

/**
 * Returns the registry catalog, using on-disk cache when fresh unless `forceRefresh` is set.
 */
export async function getRegistryCatalog(options?: {
    forceRefresh?: boolean;
}): Promise<RegistryCatalogResult> {
    const forceRefresh = options?.forceRefresh === true;
    const cached = await readCachedCatalog();
    const ttlHours = getRegistryCacheTtlHours();
    const now = Date.now();
    if (
        !forceRefresh &&
        cached !== undefined &&
        isCatalogCacheFresh(cached.fetchedAt, ttlHours, now)
    ) {
        return { catalog: cached.catalog, fromCache: true };
    }
    if (!isRegistryEnabled()) {
        if (cached !== undefined) {
            return {
                catalog: cached.catalog,
                fromCache: true,
                warning: "Registry is disabled in settings; showing cached catalog.",
            };
        }
        return {
            catalog: { version: "0", agents: [] },
            fromCache: false,
            warning: "Registry is disabled in settings.",
        };
    }
    const url = getRegistryUrl();
    try {
        const catalog = await fetchRegistryCatalog(url);
        await writeCachedCatalog({ fetchedAt: now, catalog });
        return { catalog, fromCache: false };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (cached !== undefined) {
            return {
                catalog: cached.catalog,
                fromCache: true,
                warning: `Registry fetch failed: ${message}`,
            };
        }
        throw new Error(`Registry fetch failed: ${message}`);
    }
}
