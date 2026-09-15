import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Emits the standalone npm package manifest for the SDK build output and copies the
 * built webview assets into it. Run via `npm run build:sdk` after esbuild + tsc.
 */

const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));
const acpSdkDependency = rootPackage.dependencies?.["@agentclientprotocol/sdk"];
if (typeof acpSdkDependency !== "string") {
    console.error(
        `emit-sdk-package: missing "@agentclientprotocol/sdk" dependency in package.json`,
    );
    process.exit(1);
}

const webviewDistDir = join("media", "acp-ui");
if (!existsSync(join(webviewDistDir, "main.js"))) {
    console.error(
        `emit-sdk-package: webview bundle missing at ${webviewDistDir}. Run "npm run build:webview" first.`,
    );
    process.exit(1);
}
cpSync(webviewDistDir, join("dist-sdk", "webview"), { recursive: true });

/** Standalone package manifest; version/dependency stay in sync with the extension. */
const sdkPackage = {
    name: "@htmlgtmk/acp-ui",
    description:
        "Agent Client Protocol (ACP) chat panel SDK: session bridge, agent transports, and webview assets for embedding ACP UI into another VS Code extension.",
    version: rootPackage.version,
    license: rootPackage.license,
    repository: rootPackage.repository,
    main: "./index.js",
    types: "./types/sdk/index.d.ts",
    dependencies: {
        "@agentclientprotocol/sdk": acpSdkDependency,
    },
};

writeFileSync(
    join("dist-sdk", "package.json"),
    `${JSON.stringify(sdkPackage, null, 4)}\n`,
);
console.log(
    "emit-sdk-package: wrote dist-sdk/package.json and copied webview assets to dist-sdk/webview/",
);
