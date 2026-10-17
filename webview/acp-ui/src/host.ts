import {
  type ExtensionToWebviewMessage,
  isPotentiallyExtensionPostMessageData,
  type WebviewToExtensionMessage,
} from "../../../src/protocol/extensionHostMessages";

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
};

/**
 * VS Code webview bridge. A playground app can replace this with fetch, WebSocket, or another transport.
 */
export function createVsCodeAcpUiHost(): {
  post(message: WebviewToExtensionMessage): void;
  onExtensionMessage(handler: (message: ExtensionToWebviewMessage) => void): void;
} {
  const vscode = acquireVsCodeApi();
  return {
    post(message: WebviewToExtensionMessage): void {
      vscode.postMessage(message);
    },
    onExtensionMessage(handler: (message: ExtensionToWebviewMessage) => void): void {
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
