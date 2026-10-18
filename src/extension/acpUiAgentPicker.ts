import { commands, QuickPickItemKind, window } from "vscode";
import { getAcpAgentConfigsMerged } from "../acp/config/mergedAgents";
import type { AcpAgentConfig } from "../acp/config/vscodeSettingsAgents";
import { getAcpAgentConfigsFromSettings } from "../acp/config/vscodeSettingsAgents";
import { promptNoAcpAgentsConfigured } from "./acpUiNoAgentsPrompt";

const browseRegistryCommand = "ib-acp-ui.browseAgentRegistry";
const browseRegistryLabel = "Browse Agent Registry";

/** QuickPick label with source icon for a merged agent config. */
export function agentPickLabel(config: AcpAgentConfig, manualNames: Set<string>): string {
    const icon = manualNames.has(config.name) ? "$(settings-gear)" : "$(package)";
    return `${icon} ${config.name}`;
}

/**
 * Lets the user pick an ACP agent from configured entries. Returns undefined if
 * none are configured or the user dismisses the picker.
 */
export async function pickAcpAgentConfig(): Promise<AcpAgentConfig | undefined> {
    const configs = getAcpAgentConfigsMerged();
    if (configs.length === 0) {
        await promptNoAcpAgentsConfigured();
        return undefined;
    }
    const manualNames = new Set(getAcpAgentConfigsFromSettings().map((c) => c.name));
    if (configs.length === 1) {
        return configs[0];
    }
    const items = [
        ...configs.map((config) => ({
            label: agentPickLabel(config, manualNames),
            config,
        })),
        { label: "", kind: QuickPickItemKind.Separator },
        { label: browseRegistryLabel, browse: true as const },
    ];
    const picked = await window.showQuickPick(items, {
        placeHolder: "Select an ACP agent for this chat",
    });
    if (picked === undefined) {
        return undefined;
    }
    if ("browse" in picked && picked.browse) {
        await commands.executeCommand(browseRegistryCommand);
        return undefined;
    }
    if ("config" in picked) {
        return picked.config;
    }
    return undefined;
}

/**
 * Returns the configured default ACP agent (first merged entry), or undefined when none exist.
 */
export function getDefaultAcpAgentConfig(): AcpAgentConfig | undefined {
    return getAcpAgentConfigsMerged()[0];
}
