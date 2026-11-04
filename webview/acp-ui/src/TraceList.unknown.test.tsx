// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { TraceList } from "./components/TraceList";
import type { TraceItem } from "./chatReducer";

/**
 * 未知 `session/update` 在界面上到底出没出现（T023 / FR-011）。
 * 跑真 DOM：映射层与 reducer 绿了只能证明数据到了，渲不渲得出来要看渲染这一层 ——
 * `TraceList` 末尾那条兜底分支原本是为 plan 写的，未知条目一旦掉进去就是 `item.entries` 都不存在。
 */

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const RAW = '{\n  "sessionUpdate": "usage_update",\n  "used": 1234\n}';

function unknownItem(sessionUpdate = "usage_update"): TraceItem {
    return { type: "unknown", sessionUpdate, rawJson: RAW };
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function renderTrace(items: TraceItem[], completed = false): HTMLDivElement {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() => {
        root?.render(
            <TraceList
                items={items}
                completed={completed}
                showThoughts
                expandAllToolOutputs={false}
                toolCallVerbosity="verbose"
            />,
        );
    });
    return host;
}

afterEach(() => {
    act(() => {
        root?.unmount();
    });
    root = null;
    host?.remove();
    host = null;
});

describe("未知 session/update 的渲染", () => {
    it("收起时只露类型名，原文要点开才进 DOM", () => {
        const el = renderTrace([unknownItem()]);
        const header = el.querySelector<HTMLButtonElement>(".unknown-update-header");
        expect(header).not.toBeNull();
        expect(header?.textContent).toContain("usage_update");
        expect(el.querySelector(".unknown-update-raw")).toBeNull();
        expect(header?.getAttribute("aria-expanded")).toBe("false");

        act(() => {
            header?.click();
        });
        expect(header?.getAttribute("aria-expanded")).toBe("true");
        expect(el.querySelector(".unknown-update-raw")?.textContent).toContain(
            '"used": 1234',
        );
    });

    it("走自己那条渲染分支，不掉进 plan 的兜底分支", () => {
        const el = renderTrace([
            { type: "agent", text: "前面正常的一条" },
            unknownItem(),
        ]);
        expect(el.querySelector(".agent-plan")).toBeNull();
        expect(el.querySelector(".unknown-update")).not.toBeNull();
    });

    it("连来 3 条就渲 3 行，不互相吞", () => {
        const el = renderTrace([
            unknownItem("usage_update"),
            unknownItem("current_mode_update"),
            unknownItem("_gfx_update"),
        ]);
        const kinds = [...el.querySelectorAll(".unknown-update-kind")].map(
            (node) => node.textContent,
        );
        expect(kinds).toEqual([
            "usage_update",
            "current_mode_update",
            "_gfx_update",
        ]);
    });
});

describe("任务结束那行（T024c）", () => {
    it("宿主没报 taskTraceCompleted 时不出现", () => {
        const el = renderTrace([{ type: "agent", text: "还在跑" }]);
        expect(el.querySelector(".trace-completed")).toBeNull();
    });

    it("报了之后落在所有条目最后面", () => {
        const el = renderTrace(
            [{ type: "agent", text: "第一段" }, unknownItem(), { type: "agent", text: "收尾" }],
            true,
        );
        const end = el.querySelector(".trace-completed");
        expect(end?.textContent).toBe("── worker trace completed ──");
        expect(el.lastElementChild).toBe(end);
    });
});
