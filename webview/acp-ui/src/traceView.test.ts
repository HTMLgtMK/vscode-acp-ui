import { describe, expect, it } from "vitest";
import {
    TRACE_FILTER_KINDS,
    countsAsTraceEvent,
    countByKind,
    filterItems,
    isNearBottom,
    traceItemKind,
} from "./traceView";
import type { ExtensionMessageAfterInit, TraceItem } from "./chatReducer";

/**
 * 跟底与筛选那排按钮背后的纯逻辑（T024a / T024b）。
 * 几何与点击留在组件里，这里锁的是判定本身。
 */

const item = (type: TraceItem["type"]): TraceItem => {
    switch (type) {
        case "user":
        case "agent":
            return { type, text: "t" };
        case "thought":
            return { type, text: "t" };
        case "tool":
            return {
                type,
                toolCallId: "t1",
                title: "Read",
                kind: undefined,
                subtitle: undefined,
                status: "pending",
                content: undefined,
                diffRows: undefined,
                detailVisible: false,
            };
        case "plan":
            return { type, entries: [] };
        default:
            return { type: "unknown", sessionUpdate: "usage_update", rawJson: "{}" };
    }
};

describe("跟底判定", () => {
    it("离底 48px 以内算跟着，49px 就断", () => {
        expect(isNearBottom(1000, 752, 200)).toBe(true); // 差 48
        expect(isNearBottom(1000, 751, 200)).toBe(false); // 差 49
    });

    it("内容比视口还短时也算跟着（别在没得滚的时候弹按钮）", () => {
        expect(isNearBottom(100, 0, 400)).toBe(true);
    });
});

describe("什么算一条新事件", () => {
    const cases: Array<[ExtensionMessageAfterInit, boolean]> = [
        [{ type: "appendAgentText", text: "x" }, true],
        [{ type: "appendAgentThought", text: "x" }, true],
        [{ type: "appendUserText", text: "x" }, true],
        [{ type: "appendToolCall", toolCallId: "t1", title: "Read" }, true],
        [{ type: "updateToolCall", toolCallId: "t1", status: "completed" }, true],
        [{ type: "appendUnknownSessionUpdate", sessionUpdate: "u", rawJson: "{}" }, true],
        [{ type: "appendPlan", entries: [] }, true],
        // 不进 trace 的这些不该把计数加上去
        [{ type: "slashCommands", commands: [] }, false],
        [{ type: "commandFeedback", message: "x" }, false],
        [{ type: "error", message: "x" }, false],
        [{ type: "sessionReset" }, false],
        [{ type: "turnComplete", stopReason: "end" }, false],
        [{ type: "taskTraceCompleted" }, false],
    ];

    for (const [message, expected] of cases) {
        it(`${message.type} → ${String(expected)}`, () => {
            expect(countsAsTraceEvent(message)).toBe(expected);
        });
    }
});

describe("归类与筛选", () => {
    const items = [
        item("user"),
        item("agent"),
        item("plan"),
        item("thought"),
        item("tool"),
        item("unknown"),
    ];

    it("plan 归消息，未知单独一类", () => {
        expect(traceItemKind(item("plan"))).toBe("message");
        expect(traceItemKind(item("unknown"))).toBe("unknown");
    });

    it("计数按四类分", () => {
        expect(countByKind(items)).toEqual({
            message: 3,
            thought: 1,
            tool: 1,
            unknown: 1,
        });
    });

    it("四类全勾上时原样返回（顺序、条数都不动）", () => {
        const shown = new Set(TRACE_FILTER_KINDS);
        expect(filterItems(items, shown)).toEqual(items);
    });

    it("只勾未知就只剩未知；一个都不勾就什么都不剩", () => {
        expect(filterItems(items, new Set(["unknown"]))).toEqual([items[5]]);
        expect(filterItems(items, new Set())).toEqual([]);
    });

    it("筛选不改动传进去的那份数组", () => {
        const shown = new Set(["tool"] as const);
        const filtered = filterItems(items, shown);
        expect(filtered).not.toBe(items);
        expect(items).toHaveLength(6);
    });
});
