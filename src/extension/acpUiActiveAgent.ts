import type { ExtensionContext } from "vscode";
import {
    getAcpAgentConfigByNameMerged,
    getAcpAgentConfigsMerged,
} from "../acp/config/mergedAgents";
import type { AcpAgentConfig } from "../acp/config/vscodeSettingsAgents";

const activeAgentStorageKey = "acpUi.activeAgent.v1";

let extensionContext: ExtensionContext | null = null;

function stripQuickPickCodiconPrefix(value: string): string {
    return value.replace(/^\$\([^)]+\)\s+/, "");
}

/** Binds globalState for active-agent persistence. */
export function initializeAcpUiActiveAgent(context: ExtensionContext): void {
    extensionContext = context;
}

/**
 * Returns the user-selected active agent, or the first configured agent.
 */
export function getActiveAgentConfig(): AcpAgentConfig | undefined {
    const configs = getAcpAgentConfigsMerged();
    if (configs.length === 0) {
        return undefined;
    }
    const stored = extensionContext?.globalState.get<string>(activeAgentStorageKey);
    if (stored !== undefined && stored.length > 0) {
        const match =
            getAcpAgentConfigByNameMerged(stored) ??
            getAcpAgentConfigByNameMerged(stripQuickPickCodiconPrefix(stored));
        if (match !== undefined) {
            return match;
        }
    }
    return configs[0];
}

/** Persists the active agent by display name. */
export async function setActiveAgentName(name: string): Promise<void> {
    if (extensionContext === null) {
        return;
    }
    await extensionContext.globalState.update(activeAgentStorageKey, name);
}
