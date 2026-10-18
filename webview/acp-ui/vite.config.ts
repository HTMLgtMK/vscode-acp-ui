import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    // Vitest v4 compatibility: preserve mock call history.
    // Remove after tests no longer rely on calls from setup or earlier tests.
    // https://viteplus.dev/guide/vitest-v5#remove-unneeded-compatibility-settings
    // https://vitest.dev/guide/migration/#clearmocks-is-enabled-by-default
    clearMocks: false,
  },
  plugins: [react()],
  root: dir,
  base: "./",
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    outDir: path.join(dir, "../../media/acp-ui"),
    emptyOutDir: true,
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: {
      input: path.join(dir, "src/main.ts"),
      output: {
        format: "es",
        entryFileNames: "main.js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "main[extname]",
      },
    },
  },
});
