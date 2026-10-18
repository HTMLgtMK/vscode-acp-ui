import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { env, Uri, window, type ExtensionContext } from "vscode";
import { downloadAndInstallBinary } from "../acp/registry/binaryInstall";
import { platformTargetKey, resolveDistributionSpawn } from "../acp/registry/resolveDistribution";
import type { AcpRegistryAgent, AcpRegistryBinaryTargetKey } from "../acp/registry/types";
import { registerCommandIB } from "../utils/vscode";
import {
    binaryDir,
    getInstalledAgent,
    readInstalledAgentsMap,
    removeInstalledAgent,
    upsertInstalledAgent,
    whenInstalledAgentsReady,
} from "./acpUiInstalledAgents";
import { getRegistryCatalog } from "./acpUiRegistryCatalog";

const execFileAsync = promisify(execFile);

const cmdBrowseAgentRegistry = "ib-acp-ui.browseAgentRegistry";
const cmdRefreshAgentRegistry = "ib-acp-ui.refreshAgentRegistry";
const cmdUninstallRegistryAgent = "ib-acp-ui.uninstallRegistryAgent";

const defaultRegistrySite = "https://agentclientprotocol.com/get-started/registry";

async function isExecutableOnPath(command: string): Promise<boolean> {
    const trimmed = command.trim();
    if (trimmed.length === 0) {
        return false;
    }
    if (trimmed.includes("/") || trimmed.includes("\\")) {
        return true;
    }
    try {
        if (process.platform === "win32") {
            const { stdout } = await execFileAsync("where", [trimmed], { windowsHide: true });
            return stdout.trim().length > 0;
        }
        const { stdout } = await execFileAsync("which", [trimmed]);
        return stdout.trim().length > 0;
    } catch {
        return false;
    }
}

function registryAgentSiteUrl(agent: AcpRegistryAgent): string {
    if (agent.website !== undefined && agent.website.length > 0) {
        return agent.website;
    }
    if (agent.repository !== undefined && agent.repository.length > 0) {
        return agent.repository;
    }
    return defaultRegistrySite;
}

async function resolveSpawnForAgent(agent: AcpRegistryAgent): Promise<{
    spawn: ReturnType<typeof resolveDistributionSpawn>;
    error?: string;
}> {
    const preview = resolveDistributionSpawn(agent);
    if (preview !== undefined) {
        const cmd = preview.command;
        if ((cmd === "npx" || cmd === "uvx") && !(await isExecutableOnPath(cmd))) {
            return {
                spawn: undefined,
                error: `${cmd} was not found on PATH. Install Node (npx) or uv (uvx) first.`,
            };
        }
        return { spawn: preview };
    }
    const key = platformTargetKey(process.platform, process.arch) as
        | AcpRegistryBinaryTargetKey
        | undefined;
    if (key === undefined) {
        return { spawn: undefined, error: "This platform is not supported for binary installs." };
    }
    const binaryDist = agent.distribution.binary?.[key];
    if (binaryDist === undefined) {
        return {
            spawn: undefined,
            error: "No installable distribution for this platform.",
        };
    }
    const dest = binaryDir(agent.id, agent.version).fsPath;
    try {
        const { commandAbsolutePath } = await downloadAndInstallBinary({
            archiveUrl: binaryDist.archive,
            sha256: binaryDist.sha256,
            cmdRelative: binaryDist.cmd,
            destDir: dest,
        });
        const spawn = resolveDistributionSpawn(agent, {
            binaryCommandAbsolutePath: commandAbsolutePath,
        });
        if (spawn === undefined) {
            return { spawn: undefined, error: "Failed to resolve binary spawn config." };
        }
        return { spawn };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { spawn: undefined, error: message };
    }
}

async function installRegistryAgent(agent: AcpRegistryAgent): Promise<void> {
    await window.withProgress(
        {
            location: { viewId: "acpUiSessionsView" },
            title: `Installing ${agent.name}…`,
        },
        async () => {
            const { spawn, error } = await resolveSpawnForAgent(agent);
            if (spawn === undefined) {
                void window.showErrorMessage(error ?? `Could not install ${agent.name}.`);
                return;
            }
            await upsertInstalledAgent({
                registryId: agent.id,
                installedVersion: agent.version,
                spawn,
            });
            void window.showInformationMessage(`Installed ${agent.name} (${agent.version}).`);
        },
    );
}

async function browseAgentRegistry(): Promise<void> {
    await whenInstalledAgentsReady();
    let catalogResult;
    try {
        catalogResult = await getRegistryCatalog();
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        void window.showErrorMessage(message);
        return;
    }
    if (catalogResult.warning !== undefined) {
        void window.showWarningMessage(catalogResult.warning);
    }
    const agents = catalogResult.catalog.agents;
    if (agents.length === 0) {
        void window.showInformationMessage("The registry catalog has no agents.");
        return;
    }
    const picked = await window.showQuickPick(
        agents.map((agent) => ({
            label: agent.name,
            description: `v${agent.version}`,
            detail: agent.description,
            agent,
        })),
        { placeHolder: "Select an agent from the registry" },
    );
    if (picked === undefined) {
        return;
    }
    const agent = picked.agent;
    const installed = getInstalledAgent(agent.id);
    const actions: string[] = [];
    if (installed === undefined) {
        actions.push("Install");
    } else {
        actions.push("Reinstall", "Uninstall");
    }
    actions.push("View on registry site", "Cancel");
    const action = await window.showQuickPick(actions, {
        placeHolder: `${agent.name} v${agent.version}`,
    });
    if (action === undefined || action === "Cancel") {
        return;
    }
    if (action === "View on registry site") {
        await env.openExternal(Uri.parse(registryAgentSiteUrl(agent)));
        return;
    }
    if (action === "Uninstall") {
        await removeInstalledAgent(agent.id);
        void window.showInformationMessage(`Uninstalled ${agent.name}.`);
        return;
    }
    if (action === "Install" || action === "Reinstall") {
        await installRegistryAgent(agent);
    }
}

async function refreshAgentRegistry(): Promise<void> {
    try {
        const result = await getRegistryCatalog({ forceRefresh: true });
        const count = result.catalog.agents.length;
        if (result.warning !== undefined) {
            void window.showWarningMessage(`${result.warning} (${count} agents in cache.)`);
            return;
        }
        void window.showInformationMessage(`Registry refreshed (${count} agents).`);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        void window.showErrorMessage(message);
    }
}

async function uninstallRegistryAgent(): Promise<void> {
    await whenInstalledAgentsReady();
    const map = readInstalledAgentsMap();
    const entries = Object.values(map.agents);
    if (entries.length === 0) {
        void window.showInformationMessage("No registry agents are installed.");
        return;
    }
    const picked = await window.showQuickPick(
        entries.map((entry) => ({
            label: entry.spawn.name,
            description: `v${entry.installedVersion}`,
            registryId: entry.registryId,
        })),
        { placeHolder: "Select a registry agent to uninstall" },
    );
    if (picked === undefined) {
        return;
    }
    await removeInstalledAgent(picked.registryId);
    void window.showInformationMessage(`Uninstalled ${picked.label}.`);
}

/** Registers registry browse, refresh, and uninstall commands. */
export function registerAcpUiRegistryCommands(context: ExtensionContext): void {
    registerCommandIB(cmdBrowseAgentRegistry, () => void browseAgentRegistry(), context);
    registerCommandIB(cmdRefreshAgentRegistry, () => void refreshAgentRegistry(), context);
    registerCommandIB(cmdUninstallRegistryAgent, () => void uninstallRegistryAgent(), context);
}
