import { Uri, workspace, type ExtensionContext } from "vscode";
import type { AcpAgentSpawnConfig } from "../acp/domain/agentSpawnConfig";
import type { AcpInstalledAgent, AcpInstalledAgentsMap } from "../acp/registry/types";

let extensionContext: ExtensionContext | null = null;
let installedMap: AcpInstalledAgentsMap = { schemaVersion: 1, agents: {} };
let loadPromise: Promise<void> | undefined;

const installedSubdir = "registry";
const installedFileName = "installed.json";
const binSubdir = "bin";

function installedFileUri(): Uri {
    if (extensionContext === null) {
        throw new Error("ACP UI installed agents not initialized");
    }
    return Uri.joinPath(extensionContext.globalStorageUri, installedSubdir, installedFileName);
}

function emptyMap(): AcpInstalledAgentsMap {
    return { schemaVersion: 1, agents: {} };
}

async function ensureRegistryStorageDirs(): Promise<void> {
    if (extensionContext === null) {
        return;
    }
    const base = Uri.joinPath(extensionContext.globalStorageUri, installedSubdir);
    await workspace.fs.createDirectory(base);
    await workspace.fs.createDirectory(Uri.joinPath(base, binSubdir));
}

async function loadInstalledAgentsMapFromDisk(): Promise<void> {
    if (extensionContext === null) {
        installedMap = emptyMap();
        return;
    }
    const uri = installedFileUri();
    try {
        const raw = await workspace.fs.readFile(uri);
        const parsed = JSON.parse(Buffer.from(raw).toString("utf8")) as AcpInstalledAgentsMap;
        if (parsed.schemaVersion !== 1 || typeof parsed.agents !== "object") {
            installedMap = emptyMap();
            return;
        }
        installedMap = parsed;
    } catch {
        installedMap = emptyMap();
    }
}

/** Binds global storage for registry-installed agents. */
export function initializeAcpUiInstalledAgents(context: ExtensionContext): void {
    extensionContext = context;
    loadPromise = (async () => {
        await ensureRegistryStorageDirs();
        await loadInstalledAgentsMapFromDisk();
    })();
}

export function binaryDir(registryId: string, version: string): Uri {
    if (extensionContext === null) {
        throw new Error("ACP UI installed agents not initialized");
    }
    return Uri.joinPath(
        extensionContext.globalStorageUri,
        installedSubdir,
        binSubdir,
        registryId,
        version,
    );
}

export function readInstalledAgentsMap(): AcpInstalledAgentsMap {
    return installedMap;
}

export async function writeInstalledAgentsMap(map: AcpInstalledAgentsMap): Promise<void> {
    installedMap = map;
    await ensureRegistryStorageDirs();
    const uri = installedFileUri();
    const content = JSON.stringify(map, null, 2);
    await workspace.fs.writeFile(uri, Buffer.from(content, "utf8"));
}

export function listInstalledAgentSpawns(): AcpAgentSpawnConfig[] {
    return Object.values(installedMap.agents).map((entry) => ({
        ...entry.spawn,
        registryId: entry.registryId,
    }));
}

export async function upsertInstalledAgent(entry: AcpInstalledAgent): Promise<void> {
    const map = { ...installedMap, agents: { ...installedMap.agents } };
    map.agents[entry.registryId] = entry;
    await writeInstalledAgentsMap(map);
}

export async function removeInstalledAgent(registryId: string): Promise<void> {
    const map = { ...installedMap, agents: { ...installedMap.agents } };
    delete map.agents[registryId];
    await writeInstalledAgentsMap(map);
}

export function getInstalledAgent(registryId: string): AcpInstalledAgent | undefined {
    return installedMap.agents[registryId];
}

export async function whenInstalledAgentsReady(): Promise<void> {
    if (loadPromise !== undefined) {
        await loadPromise;
    }
}
