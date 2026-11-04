import type { ExtensionMessageAfterInit, TraceItem } from "./chatReducer";

/**
 * trace 视图的两件纯逻辑：跟不跟底、看哪几类。放一个文件是为了能单测 ——
 * 这两件事的判断都发生在滚动条和点击上，jsdom 里量不到真实几何。
 */

/** 离底部这么多像素以内算"还在跟着看"（本仓旧前端用的是同一个数）。 */
export const FOLLOW_LIVE_THRESHOLD_PX = 48;

export function isNearBottom(
    scrollHeight: number,
    scrollTop: number,
    clientHeight: number,
): boolean {
    return scrollHeight - scrollTop - clientHeight <= FOLLOW_LIVE_THRESHOLD_PX;
}

/**
 * 一条下行算不算"新事件"。只数会往 trace 里加东西或改东西的那些：
 * `slashCommands` / `sessionModels` 这类不进 trace，弹一次"↓ N 条新事件"是骗人。
 */
const TRACE_EVENT_TYPES = new Set<string>([
    "appendAgentText",
    "appendAgentThought",
    "appendUserText",
    "appendToolCall",
    "updateToolCall",
    "appendPlan",
    "appendUnknownSessionUpdate",
]);

export function countsAsTraceEvent(
    message: ExtensionMessageAfterInit,
): boolean {
    return TRACE_EVENT_TYPES.has(message.type);
}

/** 那排筛选按钮的四类；`全部` = 四类都勾上，不是一个独立的取值。 */
export const TRACE_FILTER_KINDS = ["message", "thought", "tool", "unknown"] as const;

export type TraceFilterKind = (typeof TRACE_FILTER_KINDS)[number];

/** 一条 trace 条目归哪一类。`plan` 归 message（设计稿那排没有第五个按钮）。 */
export function traceItemKind(item: TraceItem): TraceFilterKind {
    if (item.type === "unknown") {
        return "unknown";
    }
    if (item.type === "tool") {
        return "tool";
    }
    if (item.type === "thought") {
        return "thought";
    }
    return "message";
}

export function countByKind(
    items: readonly TraceItem[],
): Record<TraceFilterKind, number> {
    const counts: Record<TraceFilterKind, number> = {
        message: 0,
        thought: 0,
        tool: 0,
        unknown: 0,
    };
    for (const item of items) {
        counts[traceItemKind(item)] += 1;
    }
    return counts;
}

export function filterItems(
    items: readonly TraceItem[],
    shown: ReadonlySet<TraceFilterKind>,
): TraceItem[] {
    if (shown.size === TRACE_FILTER_KINDS.length) {
        return [...items];
    }
    return items.filter((item) => shown.has(traceItemKind(item)));
}
