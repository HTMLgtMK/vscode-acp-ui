import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const dir = path.dirname(fileURLToPath(import.meta.url));

/** 第二份 Vite 工程：iife 不支持多入口，所以不能并进 acp-ui 那份配置。
    输出目录必须与 media/acp-ui 分开 —— 两边都 emptyOutDir。 */
export default defineConfig({
    plugins: [react()],
    root: dir,
    define: {
        "process.env.NODE_ENV": JSON.stringify("production"),
    },
    build: {
        lib: {
            entry: path.join(dir, "src/main.ts"),
            name: "GoworkerControlPanel",
            fileName: () => "main.js",
            formats: ["iife"],
        },
        outDir: path.join(dir, "../../media/control-panel"),
        emptyOutDir: true,
        cssCodeSplit: false,
        rollupOptions: {
            output: {
                assetFileNames: "main[extname]",
            },
        },
    },
});
