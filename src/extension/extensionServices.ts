import type { AcpUiExtensionActivation } from "./activateAcpUiExtension";

let activation: AcpUiExtensionActivation | undefined;

/** Called once from the extension `activate` function. */
export function setAcpUiExtensionActivation(next: AcpUiExtensionActivation): void {
    activation = next;
}

/**
 * Shared extension-host services (RPC NDJSON sink, output channel) for UI features that compose
 * `AcpSessionBridge` from UI entrypoints.
 */
export function getAcpUiExtensionActivation(): AcpUiExtensionActivation {
    if (activation === undefined) {
        throw new Error("ACP UI extension is not activated");
    }
    return activation;
}
