import type { ExtensionContext } from "vscode";
import {
    initializeAcpUiInstalledAgents,
    whenInstalledAgentsReady,
} from "./extension/acpUiInstalledAgents";
import { registerAcpUiCustomEditorProvider } from "./extension/acpUiCustomEditorProvider";
import { registerAcpUiPanel } from "./extension/acpUiPanel";
import { initializeAcpUiRegistryCatalog } from "./extension/acpUiRegistryCatalog";
import { registerAcpUiRegistryCommands } from "./extension/acpUiRegistry";
import { initializeAcpUiSessionsStore } from "./extension/acpUiSessionsStore";
import { AcpUiSessionsViewProvider } from "./extension/acpUiSessionsView";
import { activateAcpUiExtension } from "./extension/activateAcpUiExtension";
import { setAcpUiExtensionActivation } from "./extension/extensionServices";

/** Composition root: shared ACP services, ACP UI custom editor, and commands. */
export async function activate(context: ExtensionContext): Promise<void> {
    const activation = activateAcpUiExtension(context);
    setAcpUiExtensionActivation(activation);
    await initializeAcpUiSessionsStore(context, {
        log: (message) => activation.outputChannel.appendLine(message),
    });
    initializeAcpUiInstalledAgents(context);
    await whenInstalledAgentsReady();
    initializeAcpUiRegistryCatalog(context);
    registerAcpUiRegistryCommands(context);
    const refreshChatsList = AcpUiSessionsViewProvider.activate(context);
    registerAcpUiCustomEditorProvider(context);
    registerAcpUiPanel(context, refreshChatsList);
}

export function deactivate(): void {}
