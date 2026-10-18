import { commands, window } from "vscode";

const browseCommand = "ib-acp-ui.browseAgentRegistry";
const agentsSettingKey = "ib-acp-ui.agents";

/**
 * Prompts when no agents are configured. Returns which action the user chose, if any.
 */
export async function promptNoAcpAgentsConfigured(): Promise<"browse" | "settings" | undefined> {
    const choice = await window.showInformationMessage(
        "No ACP agents configured. Browse the registry?",
        "Browse Registry",
        "Open Settings",
    );
    if (choice === "Browse Registry") {
        await commands.executeCommand(browseCommand);
        return "browse";
    }
    if (choice === "Open Settings") {
        await commands.executeCommand("workbench.action.openSettings", agentsSettingKey);
        return "settings";
    }
    return undefined;
}
