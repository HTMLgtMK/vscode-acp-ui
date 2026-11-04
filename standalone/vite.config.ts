import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const dir = path.dirname(fileURLToPath(import.meta.url));
const wsPort = Number(process.env.ACP_WS_PORT ?? 5174);
const vitePort = Number(process.env.ACP_UI_VITE_PORT ?? 5173);

export default defineConfig({
    plugins: [
        react(),
        {
            name: "standalone-fixtures-route",
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
                // 只换路径段、把 query 留着：控制面板那条连接靠 `?channel=controlPanel` 认人，
                // 原来一律改写成 "/" 会连参数一起吞掉。chat 那条没参数，改写结果与之前一致。
                rewrite: (path) => path.replace(/^\/__acp_ui_ws/, "/"),
            },
            "/api": {
                target: `http://127.0.0.1:${wsPort}`,
                changeOrigin: true,
            },
        },
    },
});
