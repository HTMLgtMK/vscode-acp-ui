import type {
    ControlPanelSnapshot,
    ControlPanelUp,
} from "./snapshot";

/**
 * 控制面板与宿主之间的桥 —— 组件只认这个接口，不认 VS Code。
 * VS Code 里走 `postMessage`；浏览器里换一份 transport 就能跑同一套 UI。
 */
export interface ControlPanelTransport {
    post(message: ControlPanelUp): void;
    onMessage(handler: (message: unknown) => void): void;
}

export interface ControlPanelHost {
    post(message: ControlPanelUp): void;
    /** 宿主一次推一份完整快照；这里只挑出 `type === "controlPanel"` 的那份。 */
    onSnapshot(handler: (snapshot: ControlPanelSnapshot) => void): void;
}

export function createControlPanelHost(
    transport: ControlPanelTransport,
): ControlPanelHost {
    return {
        post: (message) => transport.post(message),
        onSnapshot: (handler) => {
            transport.onMessage((message) => {
                if (message === null || typeof message !== "object") {
                    return;
                }
                const record = message as Record<string, unknown>;
                if (record.type !== "controlPanel") {
                    return;
                }
                const snapshot = record.snapshot;
                if (snapshot === null || typeof snapshot !== "object") {
                    return;
                }
                handler(snapshot as ControlPanelSnapshot);
            });
        },
    };
}

declare function acquireVsCodeApi(): {
    postMessage(message: unknown): void;
};

/** VS Code 侧的 transport。`acquireVsCodeApi()` 只允许出现在这个文件里。 */
export function createVsCodeControlPanelHost(): ControlPanelHost {
    const vscode = acquireVsCodeApi();
    return createControlPanelHost({
        post: (message) => vscode.postMessage(message),
        onMessage: (handler) => {
            window.addEventListener("message", (event: MessageEvent) => {
                handler(event.data);
            });
        },
    });
}
