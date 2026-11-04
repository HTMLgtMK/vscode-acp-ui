import { statSync } from "node:fs";
import { join } from "node:path";

/** Entry asset file names inside a built ACP UI webview directory. */
const webviewScriptName = "main.js";
const webviewStyleName = "main.css";

/** Absolute paths of the built webview entry assets. */
export type AcpUiWebviewAssets = {
    /** Directory that contains the built webview assets. */
    readonly distDir: string;
    /** Bundled webview script (`main.js`, self-contained React bundle). */
    readonly scriptPath: string;
    /** Bundled webview stylesheet (`main.css`). */
    readonly stylePath: string;
};

/**
 * Resolves the entry assets of a built ACP UI webview directory: the published SDK
 * package's `webview/` folder, or this repository's `media/acp-ui` build output.
 * Throws when the webview bundle has not been built yet.
 */
export function resolveAcpUiWebviewAssets(
    webviewDistDir: string,
): AcpUiWebviewAssets {
    const scriptPath = join(webviewDistDir, webviewScriptName);
    const stylePath = join(webviewDistDir, webviewStyleName);
    for (const assetPath of [scriptPath, stylePath]) {
        if (statSync(assetPath, { throwIfNoEntry: false })?.isFile() !== true) {
            throw new Error(
                `ACP UI webview asset "${assetPath}" is missing. Build the webview bundle first ("npm run build:webview").`,
            );
        }
    }
    return { distDir: webviewDistDir, scriptPath, stylePath };
}

/**
 * Inputs for {@link buildAcpUiWebviewHtml}. URIs are host-resolved: in VS Code a host
 * maps absolute asset paths through `webview.asWebviewUri(Uri.file(path))`.
 */
export type AcpUiWebviewHtmlOptions = {
    /** Webview-resolvable URI of the bundled script. */
    scriptUri: string;
    /** Webview-resolvable URI of the bundled stylesheet. */
    styleUri: string;
    /** Origin allowed to load webview resources (VS Code: `webview.cspSource`). */
    cspSource: string;
    /**
     * 皮肤包样式表的 URI，排在 `styleUri` 之后 —— 层叠顺序就是它的优先级，
     * 皮肤不靠 `!important` 抢。宿主只把校验过的（`--gw-*` 白名单）那份传进来，
     * 并且要把皮肤目录登记进 `localResourceRoots`；CSP 不放宽。
     * 每条都带 `data-gw-skin`：换皮肤时页面自己按这个标记增删（见 `setSkin` 下行）。
     */
    extraStyleUris?: string[];
    /**
     * 写进 `<html data-skin="…">` 的那一档。内置三档由产物自己带色，
     * 这一格只决定选哪一档；皮肤包还要配 `extraStyleUris` 才有自己的值。
     * 不给就不写属性，沿用 `:root` 那套跟随宿主的 token。
     */
    skin?: string;
};

/** Attribute values are host-supplied strings; keep them inside the quote. */
function escapeAttribute(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

/**
 * HTML shell for the ACP UI webview: CSP, asset URIs, and the root mount node.
 * Markup matches the bundled ACP UI extension shell; hosts resolve the asset URIs
 * with their own webview API and pass them in as strings (no `vscode` dependency).
 */
export function buildAcpUiWebviewHtml(
    options: AcpUiWebviewHtmlOptions,
): string {
    const contentSecurityPolicy = [
        `default-src 'none'`,
        `style-src ${options.cspSource}`,
        `font-src ${options.cspSource}`,
        `script-src ${options.cspSource}`,
    ].join("; ");
    const extraStyles = (options.extraStyleUris ?? [])
        .map(
            (uri) =>
                `  <link rel="stylesheet" data-gw-skin href="${escapeAttribute(uri)}" />`,
        )
        .join("\n");
    const skinAttribute =
        options.skin === undefined || options.skin.length === 0
            ? ""
            : ` data-skin="${escapeAttribute(options.skin)}"`;
    return `<!DOCTYPE html>
<html lang="en"${skinAttribute}>
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${options.styleUri}" />
${extraStyles.length > 0 ? `${extraStyles}\n` : ""}</head>
<body>
  <div id="root"></div>
  <script src="${options.scriptUri}"></script>
</body>
</html>`;
}
