import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

const dir = path.dirname(fileURLToPath(import.meta.url));
const wsPort = Number(process.env.ACP_WS_PORT ?? 5174);
const vitePort = Number(process.env.ACP_UI_VITE_PORT ?? 5173);

export default defineConfig({
    test: {
        // Vitest v4 compatibility: preserve mock call history.
        // Remove after tests no longer rely on calls from setup or earlier tests.
        // https://viteplus.dev/guide/vitest-v5#remove-unneeded-compatibility-settings
        // https://vitest.dev/guide/migration/#clearmocks-is-enabled-by-default
        clearMocks: false,
    },
    plugins: [
        react(),
        {
            name: "playground-fixtures-route",
            configureServer(server) {
                server.middlewares.use((req, _res, next) => {
                    if (req.url === "/fixtures" || req.url === "/fixtures/") {
                        req.url = "/fixtures.html";
                    }
                    next();
                });
            },
        },
    ],
    root: dir,
    server: {
        port: vitePort,
        strictPort: true,
        proxy: {
            "/__acp_ui_ws": {
                target: `ws://127.0.0.1:${wsPort}`,
                ws: true,
                rewrite: () => "/",
            },
            "/api": {
                target: `http://127.0.0.1:${wsPort}`,
                changeOrigin: true,
            },
        },
    },
});
