import { execFileSync } from "node:child_process";
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

/** 控制面板是第二份 iife 产物，目录独立（两份构建各自 emptyOutDir）。 */
const controlPanelDistDir = join("media", "control-panel");
if (!existsSync(join(controlPanelDistDir, "main.js"))) {
    console.error(
        `emit-sdk-package: control panel bundle missing at ${controlPanelDistDir}. Run "npm run build:webview" first.`,
    );
    process.exit(1);
}
cpSync(controlPanelDistDir, join("dist-sdk", "webview-control-panel"), {
    recursive: true,
});

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
    // 作用域包默认私有，发包前就得写死：漏了这一条 `npm publish` 会以 402 失败。
    publishConfig: {
        access: "public",
    },
};

/**
 * T066 快照档：`ACP_SDK_SNAPSHOT=1` 才改版本号，日常那档保持与根包一致
 * （扩展仓走 `file:` 链接，每跑一次 build:sdk 就换一个版本会把它的 package-lock 搅浑）。
 * 本地联调吃 `npm pack` 出的 tgz，不往 registry 发；那枚 tgz 必须落在 dist-sdk 之外 ——
 * dist-sdk 是被打包的那一层，又从不整目录清空，写在这儿下一次 pack 会把上一枚 .tgz 打进新包里（09-25 实测套过一层）。
 * `gitHead` 记的是打包那一刻的 HEAD：工作区仍有未提交改动时它复现不出这份产物，只当线索、不当凭据。
 */
if (process.env.ACP_SDK_SNAPSHOT === "1") {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;
    sdkPackage.version = `${rootPackage.version}-snapshot.${stamp}`;
    const head = execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
    }).trim();
    if (head !== "") sdkPackage.gitHead = head;
}

writeFileSync(
    join("dist-sdk", "package.json"),
    `${JSON.stringify(sdkPackage, null, 4)}\n`,
);
console.log(
    `emit-sdk-package: wrote dist-sdk/package.json (version ${sdkPackage.version}${sdkPackage.gitHead ? ` @ ${sdkPackage.gitHead.slice(0, 8)}` : ""}) and copied webview assets to dist-sdk/webview/ and dist-sdk/webview-control-panel/`,
);
