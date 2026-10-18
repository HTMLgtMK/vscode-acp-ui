import { Uri, type Webview } from "vscode";

const webviewMediaSegment = "media";
const webviewBundleDir = "acp-ui";
const webviewScriptName = "main.js";
const webviewStyleName = "main.css";

/**
 * HTML shell for the ACP UI webview: CSP, asset URIs, and root mount node.
 */
export function getAcpUiWebviewHtml(extensionRoot: Uri, webview: Webview): string {
    const scriptUri = webview.asWebviewUri(
        Uri.joinPath(extensionRoot, webviewMediaSegment, webviewBundleDir, webviewScriptName),
    );
    const styleUri = webview.asWebviewUri(
        Uri.joinPath(extensionRoot, webviewMediaSegment, webviewBundleDir, webviewStyleName),
    );
    const cspSource = webview.cspSource;
    const contentSecurityPolicy = [
        `default-src 'none'`,
        `style-src ${cspSource}`,
        `font-src ${cspSource}`,
        `script-src ${cspSource}`,
    ].join("; ");
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${styleUri.toString()}" />
</head>
<body>
  <div id="root" class="root agent-root">
    <div class="acp-ui-boot">
      <div class="acp-ui-boot__spinner" aria-hidden="true"></div>
      <span>Connecting...</span>
    </div>
  </div>
  <script type="module" src="${scriptUri.toString()}"></script>
</body>
</html>`;
}
