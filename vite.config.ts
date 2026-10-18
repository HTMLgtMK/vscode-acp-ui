import { defineConfig } from "vite-plus";

export default defineConfig({
    staged: {
        "*": "vp check --fix",
    },
    pack: {
        entry: ["src/extension.ts"],
        format: ["cjs"],
        platform: "node",
        outDir: "dist",
        fixedExtension: false,
        clean: true,
        deps: {
            neverBundle: ["vscode"],
            alwaysBundle: ["@agentclientprotocol/sdk"],
        },
        failOnWarn: false,
    },
    fmt: {
        tabWidth: 4,
        singleQuote: false,
        semi: true,
        ignorePatterns: [
            "webview/**",
            "playground/index.html",
            "playground/mock/**",
            "media/**",
            "dist/**",
            "docs/acp/**",
            "docs/cursor-extensions/**",
        ],
    },
    test: {
        // Vitest v4 compatibility: preserve mock call history.
        // Remove after tests no longer rely on calls from setup or earlier tests.
        // https://viteplus.dev/guide/vitest-v5#remove-unneeded-compatibility-settings
        // https://vitest.dev/guide/migration/#clearmocks-is-enabled-by-default
        clearMocks: false,
        environment: "node",
        include: ["src/**/*.test.ts", "webview/**/*.test.ts"],
    },
    lint: {
        jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
        rules: { "vite-plus/prefer-vite-plus-imports": "error" },
        options: { typeAware: true, typeCheck: true },
    },
});
