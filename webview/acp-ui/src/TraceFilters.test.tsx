// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TraceFilters } from "./components/TraceFilters";
import { TRACE_FILTER_KINDS, type TraceFilterKind } from "./traceView";

/**
 * 那排按钮在真 DOM 里的样子（T024b）：勾上的是哪几个、未知露不露计数、live/paused 说没说真话。
 */

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function render(props: {
    counts?: Record<TraceFilterKind, number>;
    shown?: ReadonlySet<TraceFilterKind>;
    live?: boolean;
    onToggle?: (kind: TraceFilterKind) => void;
    onShowAll?: () => void;
    onResumeLive?: () => void;
}): HTMLDivElement {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() => {
        root?.render(
            <TraceFilters
              counts={props.counts ?? { message: 2, thought: 1, tool: 0, unknown: 3 }}
              shown={props.shown ?? new Set(TRACE_FILTER_KINDS)}
              live={props.live ?? true}
              onToggle={props.onToggle ?? vi.fn()}
              onShowAll={props.onShowAll ?? vi.fn()}
              onResumeLive={props.onResumeLive ?? vi.fn()}
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

const chip = (el: HTMLElement, label: string): HTMLButtonElement | undefined =>
    [...el.querySelectorAll<HTMLButtonElement>(".trace-chip")].find((b) =>
        (b.textContent ?? "").startsWith(label),
    );

describe("筛选按钮那一排", () => {
    it("五个按钮都在：全部 + 四类", () => {
        const el = render({});
        expect(el.querySelectorAll(".trace-chip")).toHaveLength(5);
        expect(chip(el, "全部")?.textContent).toBe("全部");
    });

    it("未知露出条数，为 0 时不露", () => {
        expect(chip(render({}), "未知")?.textContent).toBe("未知 3");
        host = null;
        const el = render({ counts: { message: 1, thought: 0, tool: 0, unknown: 0 } });
        expect(chip(el, "未知")?.textContent).toBe("未知");
    });

    it("点某一类把这一类交给宿主去开关，其余不动", () => {
        const onToggle = vi.fn();
        const el = render({ onToggle });
        act(() => {
            chip(el, "思考")?.click();
        });
        expect(onToggle).toHaveBeenCalledWith("thought");
    });

    it("四类都勾着时，`全部` 才亮", () => {
        const all = chip(render({}), "全部");
        expect(all?.hasAttribute("data-on")).toBe(true);
        host = null;
        const some = chip(
            render({ shown: new Set(["message", "thought", "tool"]) }),
            "全部",
        );
        expect(some?.hasAttribute("data-on")).toBe(false);
    });

    it("live 亮着时写 live，脱离跟随时写 paused 并可点回", () => {
        const onResumeLive = vi.fn();
        const el = render({ live: true, onResumeLive });
        expect(el.querySelector(".trace-live")?.textContent).toBe("live");
        host = null;
        const paused = render({ live: false, onResumeLive });
        const live = paused.querySelector<HTMLButtonElement>(".trace-live");
        expect(live?.textContent).toBe("paused");
        expect(live?.hasAttribute("data-paused")).toBe(true);
        act(() => {
            live?.click();
        });
        expect(onResumeLive).toHaveBeenCalledOnce();
    });
});
