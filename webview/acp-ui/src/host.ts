import {
    type ExtensionToWebviewMessage,
    isPotentiallyExtensionPostMessageData,
    type WebviewToExtensionMessage,
} from "../../../src/protocol/extensionHostMessages";

declare function acquireVsCodeApi(): {
    postMessage(message: unknown): void;
};

/**
 * VS Code webview bridge. A standalone app can replace this with fetch, WebSocket, or another transport.
 */
export function createVsCodeAcpUiHost(): {
    post(message: WebviewToExtensionMessage): void;
    /**
     * 开发钩子的回传（DOM 探针报告）。刻意不进 `WebviewToExtensionMessage`：
     * 那不是产品协议的一部分，宿主也只在 Development 模式下才发探针、才读这一份。
     */
    postDev(message: Record<string, unknown>): void;
    onExtensionMessage(
        handler: (message: ExtensionToWebviewMessage) => void,
    ): void;
} {
    const vscode = acquireVsCodeApi();
    return {
        post(message: WebviewToExtensionMessage): void {
            vscode.postMessage(message);
        },
        postDev(message: Record<string, unknown>): void {
            vscode.postMessage(message);
        },
        onExtensionMessage(
            handler: (message: ExtensionToWebviewMessage) => void,
        ): void {
            window.addEventListener("message", (event: MessageEvent) => {
                const data = event.data;
                if (!isPotentiallyExtensionPostMessageData(data)) {
                    return;
                }
                handler(data as ExtensionToWebviewMessage);
            });
        },
    };
}
