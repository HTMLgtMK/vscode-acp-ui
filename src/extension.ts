import type { ExtensionContext } from "vscode";

/**
 * 这个 fork 现在只有我们那套界面要用的东西：一份 SDK 与两份 webview 产物，都由
 * `vscode-goworker` 那侧装走。它自己那个通用 ACP 扩展的产品面（Activity Bar 容器、`*.acp`
 * customEditor、`ib-acp-ui.*` 命令 / 菜单 / 快捷键 / 设置项、Cursor 专属弹窗）已按 FR-019 撤掉。
 * 留着 `main` 只为 `npm run package` 与 `install:local` 还能出一条装得上的扩展 —— 装上之后
 * 没有视图、没有命令、没有设置项。要加回产品面就是违反 FR-019，先改 spec。
 */
export async function activate(_context: ExtensionContext): Promise<void> {}

export function deactivate(): void {}
