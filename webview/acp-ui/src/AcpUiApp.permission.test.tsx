// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AcpUiApp, type AcpUiAppProps } from "./AcpUiApp";
import type { ExtensionMessageAfterInit } from "./chatReducer";
import type { RefObject } from "react";

/**
 * 审批卡（US3 / T032 / T033）的形状契约，盯三件稿 03 定了的事：
 * ① 审批期间 composer 整块不渲（textarea 不在 DOM 里，不是 disabled）；
 * ② 按钮集合完全等于 daemon 下发的 options，卡片不写死数量；
 * ③ Esc 与 Dismiss 都是本地动作 —— 什么都不发，且草稿与光标原样回来。
 */

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// jsdom 没有 ResizeObserver（AcpUiApp 拿它做跟底），补一个什么都不做的空壳。
class NoopResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}
globalThis.ResizeObserver =
    NoopResizeObserver as unknown as typeof globalThis.ResizeObserver;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mountApp(overrides: Partial<AcpUiAppProps> = {}): {
    el: HTMLDivElement;
    send: (message: ExtensionMessageAfterInit) => void;
    postPermissionResponse: ReturnType<typeof vi.fn>;
} {
    const dispatchRef: RefObject<((message: ExtensionMessageAfterInit) => void) | null> = {
        current: null,
    };
    const postPermissionResponse = vi.fn();
    const props: AcpUiAppProps = {
        init: { type: "init", sessionId: "s1", title: "Chat" },
        postSend: () => {},
        postCancel: () => {},
        postRenameSession: () => {},
        postResetSession: () => {},
        postSetSessionModel: () => {},
        postSetSessionConfigOption: () => {},
        postSaveHistory: () => {},
        postPermissionResponse,
        extensionDispatchRef: dispatchRef,
        ...overrides,
    };
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() => {
        root?.render(<AcpUiApp {...props} />);
    });
    const send = (message: ExtensionMessageAfterInit): void => {
        act(() => {
            dispatchRef.current?.(message);
        });
    };
    return { el: host, send, postPermissionResponse };
}

/** 走原生 setter + input 事件：受控组件改 .value 不惊动 React。 */
function typeDraft(el: HTMLElement, withCaret: string): HTMLTextAreaElement {
    const textarea = el.querySelector<HTMLTextAreaElement>(".composer-input");
    if (textarea === null) {
        throw new Error("composer textarea 没渲出来");
    }
    const marker = withCaret.indexOf("|");
    const value = marker >= 0 ? withCaret.replace("|", "") : withCaret;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(
        textarea,
        value,
    );
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.focus();
    const caret = marker >= 0 ? marker : value.length;
    textarea.setSelectionRange(caret, caret);
    // 光标是程序挪的，派一发 keyup 让界面按"用户动过光标"处理
    textarea.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
    return textarea;
}

function permissionOf(requestId: string, count = 2): ExtensionMessageAfterInit {
    return {
        type: "permissionRequest",
        requestId,
        toolTitle: "`rm -rf daemon/internal/dispatcher/testdata`",
        options: Array.from({ length: count }, (_unused, position) => ({
            optionId: `option-${position}`,
            name: `选项 ${position}`,
        })),
    };
}

function pressEscape(): void {
    act(() => {
        document.dispatchEvent(
            new KeyboardEvent("keydown", {
                key: "Escape",
                bubbles: true,
                cancelable: true,
            }),
        );
    });
}

afterEach(() => {
    act(() => {
        root?.unmount();
    });
    root = null;
    host?.remove();
    host = null;
});

describe("审批卡整块替换输入区", () => {
    it("审批期间 textarea 不在 DOM 里，卡片接管底部那一格", () => {
        const { el, send } = mountApp();
        typeDraft(el, "改一下再跑|这段命令");
        send(permissionOf("perm-1"));

        expect(el.querySelector(".composer-input")).toBeNull();
        expect(el.querySelector(".composer-send")).toBeNull();
        const card = el.querySelector<HTMLElement>(".approval-card");
        expect(card).not.toBeNull();
        // 反引号包着的命令按稿子渲成裸命令
        expect(el.querySelector(".approval-tool")?.textContent).toBe(
            "rm -rf daemon/internal/dispatcher/testdata",
        );
        expect(el.querySelector(".approval-queue")?.textContent).toBe("1 / 1 pending");
    });

    it("按钮集合完全来自 daemon options：给三枚就渲三枚 + Dismiss", () => {
        const { el, send } = mountApp();
        send(permissionOf("perm-1", 3));
        const options = [...el.querySelectorAll<HTMLElement>(".approval-option")];
        expect(options.map((button) => button.textContent?.trim())).toEqual([
            "选项 0",
            "选项 1",
            "选项 2",
        ]);
        expect(el.querySelectorAll(".approval-dismiss")).toHaveLength(1);
        // 只有到达次序第一枚算主操作，不去猜 optionId 的语义
        expect(options[0]?.hasAttribute("data-primary")).toBe(true);
        expect(options[1]?.hasAttribute("data-primary")).toBe(false);
    });

    it("连发两条：第二条只排队，裁决后第一条顶上来、位次不回退", () => {
        const { el, send, postPermissionResponse } = mountApp();
        send(permissionOf("perm-1"));
        send(permissionOf("perm-2"));
        expect(el.querySelector(".approval-queue")?.textContent).toBe("1 / 2 pending");
        expect(el.querySelectorAll(".approval-card")).toHaveLength(1);

        act(() => {
            el.querySelector<HTMLButtonElement>(".approval-option")?.click();
        });
        expect(postPermissionResponse).toHaveBeenCalledWith({
            requestId: "perm-1",
            selectedOptionId: "option-0",
        });
        expect(el.querySelector(".approval-queue")?.textContent).toBe("2 / 2 pending");

        act(() => {
            el.querySelector<HTMLButtonElement>(".approval-option")?.click();
        });
        expect(el.querySelector(".approval-card")).toBeNull();
        // 批完了才归零：再来一条是从 1 重新数
        send(permissionOf("perm-3"));
        expect(el.querySelector(".approval-queue")?.textContent).toBe("1 / 1 pending");
    });

    it("Esc 等价 Dismiss：不发任何 option，草稿与光标原样回来", () => {
        const { el, send, postPermissionResponse } = mountApp();
        const typed = typeDraft(el, "改一下再跑|这段命令");
        expect(document.activeElement).toBe(typed);
        send(permissionOf("perm-1"));

        pressEscape();

        expect(postPermissionResponse).not.toHaveBeenCalled();
        expect(el.querySelector(".approval-card")).toBeNull();
        const textarea = el.querySelector<HTMLTextAreaElement>(".composer-input");
        expect(textarea?.value).toBe("改一下再跑这段命令");
        expect(textarea?.selectionStart).toBe(5);
        expect(textarea?.selectionEnd).toBe(5);
    });

    it("点 Dismiss 也是本地动作；两条排队时 Esc 只收当前这条", () => {
        const { el, send, postPermissionResponse } = mountApp();
        send(permissionOf("perm-1"));
        send(permissionOf("perm-2"));

        act(() => {
            el.querySelector<HTMLButtonElement>(".approval-dismiss")?.click();
        });
        expect(postPermissionResponse).not.toHaveBeenCalled();
        // 前一条被本地收掉，后一条顶上，位次仍是它到达时的 2
        expect(el.querySelector(".approval-queue")?.textContent).toBe("2 / 2 pending");
        expect(el.querySelector(".approval-note")?.textContent).toBe(
            "上一条裁决后还有 1 条在排队",
        );
    });

    it("宿主报失效（150s 兜底 / 换任务）：卡收掉，什么都不发", () => {
        const { el, send, postPermissionResponse } = mountApp();
        send(permissionOf("perm-1"));
        act(() => {
            send({ type: "permissionDismiss", requestId: "perm-1" });
        });
        expect(el.querySelector(".approval-card")).toBeNull();
        expect(el.querySelector(".composer-input")).not.toBeNull();
        expect(postPermissionResponse).not.toHaveBeenCalled();
    });
});
