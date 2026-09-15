import { Uri, type Webview } from "vscode";

import { buildAcpUiWebviewHtml } from "../sdk/acpUiWebviewHtml";

const webviewMediaSegment = "media";
const webviewBundleDir = "acp-ui";
const webviewScriptName = "main.js";
const webviewStyleName = "main.css";

/**
 * HTML shell for the ACP UI webview: CSP, asset URIs, and root mount node.
 * Delegates markup to the SDK template so both hosts share a single source.
 */
export function getAcpUiWebviewHtml(
    extensionRoot: Uri,
    webview: Webview,
): string {
    const scriptUri = webview
        .asWebviewUri(
            Uri.joinPath(
                extensionRoot,
                webviewMediaSegment,
                webviewBundleDir,
                webviewScriptName,
            ),
        )
        .toString();
    const styleUri = webview
        .asWebviewUri(
            Uri.joinPath(
                extensionRoot,
                webviewMediaSegment,
                webviewBundleDir,
                webviewStyleName,
            ),
        )
        .toString();
    return buildAcpUiWebviewHtml({
        scriptUri,
        styleUri,
        cspSource: webview.cspSource,
    });
}
