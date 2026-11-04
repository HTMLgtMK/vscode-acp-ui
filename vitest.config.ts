import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "node",
        // 默认还是 node 环境；要真 DOM 的用例在文件头写 `// @vitest-environment jsdom`，
        // 别把全局改掉 —— 其余用例靠 node 环境跑得更快，也不该被 DOM 污染。
        include: [
            "src/**/*.test.{ts,tsx}",
            "webview/**/*.test.{ts,tsx}",
            // 浏览器端那条 WS 桥（standalone/panelBridge.ts）也是产品代码，跟着一起跑
            "standalone/**/*.test.{ts,tsx}",
        ],
    },
});
