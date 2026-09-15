import * as esbuild from "esbuild";

/**
 * Bundles the SDK public entry (`src/sdk/index.ts`) to `dist-sdk/index.js`.
 * Kept separate from `esbuild.mjs`; run via `npm run build:sdk`.
 */

/** @type {import("esbuild").BuildOptions} */
const config = {
    entryPoints: ["src/sdk/index.ts"],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    sourcemap: true,
    external: ["@agentclientprotocol/sdk", "vscode"],
    logLevel: "info",
    outfile: "dist-sdk/index.js",
};

await esbuild.build(config);
