// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatComposer, type ChatComposerProps } from "./components/ChatComposer";
import type { KeyboardEvent } from "react";

/**
 * 只读 composer（T026 / FR-009）：任务详情与 Agent Chat 共用这一套组件，
 * 差别只在这块输入区。测试盯的是**功能**门禁 —— textarea 真的 disabled、
 * Send 真的点不动、底栏真的写明为什么不能回；藏掉 CSS 冒充只读在这里会红。
 */

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function renderComposer(overrides: Partial<ChatComposerProps> = {}): HTMLDivElement {
    const props: ChatComposerProps = {
        activityLabel: null,
        workspacePathHint: "~/work/demo",
        modelSelection: null,
        providerCatalog: null,
        sessionConfigOptions: null,
        sessionConfigLoading: false,
        modelPickerLocked: false,
        hideComposerModelControls: true,
        promptInFlight: false,
        readOnly: false,
        slashCommands: [],
        workspaceFiles: [],
        suggestionIndex: 0,
        autocompleteDismissed: false,
        draft: "",
        onDraftChange: () => {},
        onPickSessionModel: () => {},
        onPickSessionConfigOption: () => {},
        onSubmit: () => {},
        onCancel: () => {},
        onKeyDown: (_event: KeyboardEvent<HTMLTextAreaElement>) => {},
        ...overrides,
    };
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() => {
        root?.render(<ChatComposer {...props} />);
    });
    return host;
}

function textareaIn(el: HTMLElement): HTMLTextAreaElement {
    const node = el.querySelector<HTMLTextAreaElement>(".composer-input");
    if (node === null) {
        throw new Error("composer textarea 没渲出来");
    }
    return node;
}

afterEach(() => {
    act(() => {
        root?.unmount();
    });
    root = null;
    host?.remove();
    host = null;
});

describe("只读 composer", () => {
    it("textarea 禁输入，并把原因写在输入区里", () => {
        const el = renderComposer({ readOnly: true });
        const input = textareaIn(el);
        expect(input.disabled).toBe(true);
        expect(input.placeholder).toContain("reply / resume 尚未开放");
        expect(el.querySelector(".composer-readonly-hint")?.textContent).toContain(
            "read-only",
        );
        // 「打不了字就别提示能打字」：/ 命令与 @ 文件的快捷键说明换成只读标记
        expect(el.querySelector(".composer-top-bar-hint")).toBeNull();
    });

    it("Send 禁掉，直接派发 click 也不会提交", () => {
        const onSubmit = vi.fn();
        const el = renderComposer({ readOnly: true, draft: "残留草稿", onSubmit });
        const send = el.querySelector<HTMLButtonElement>(".composer-send");
        expect(send?.disabled).toBe(true);
        act(() => {
            send?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it("没有只读标志时照旧可写、可发", () => {
        const onSubmit = vi.fn();
        const el = renderComposer({ onSubmit });
        const input = textareaIn(el);
        expect(input.disabled).toBe(false);
        expect(input.placeholder).not.toContain("reply / resume 尚未开放");
        expect(el.querySelector(".composer-readonly-hint")).toBeNull();
        const send = el.querySelector<HTMLButtonElement>(".composer-send");
        expect(send?.disabled).toBe(false);
        act(() => {
            send?.click();
        });
        expect(onSubmit).toHaveBeenCalledTimes(1);
    });
});

describe("Send/Stop 合并", () => {
    it("空闲态只有 Send，没有独立 Cancel", () => {
        const el = renderComposer({ hideComposerModelControls: true });
        expect(el.querySelector(".composer-cancel")).toBeNull();
        const send = el.querySelector<HTMLButtonElement>(".composer-send");
        expect(send?.textContent).toBe("Send");
        expect(send?.getAttribute("aria-label")).toBe("Send");
    });

    it("运行中 Send 变 Stop，点击走 onCancel 不走 onSubmit", () => {
        const onSubmit = vi.fn();
        const onCancel = vi.fn();
        const el = renderComposer({
            hideComposerModelControls: true,
            promptInFlight: true,
            onSubmit,
            onCancel,
        });
        const stop = el.querySelector<HTMLButtonElement>(".composer-send--stop");
        expect(stop?.textContent).toBe("Stop");
        expect(stop?.getAttribute("aria-label")).toBe("Stop");
        act(() => {
            stop?.click();
        });
        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it("空闲态点击走 onSubmit", () => {
        const onSubmit = vi.fn();
        const onCancel = vi.fn();
        const el = renderComposer({
            hideComposerModelControls: true,
            onSubmit,
            onCancel,
        });
        const send = el.querySelector<HTMLButtonElement>(".composer-send");
        act(() => {
            send?.click();
        });
        expect(onSubmit).toHaveBeenCalledTimes(1);
        expect(onCancel).not.toHaveBeenCalled();
    });
});
