import type { ReactElement } from "react";
import "./TraceFilters.css";
import {
    TRACE_FILTER_KINDS,
    type TraceFilterKind,
} from "../traceView";

const LABELS: Record<TraceFilterKind, string> = {
    message: "消息",
    thought: "思考",
    tool: "工具",
    unknown: "未知",
};

/**
 * trace 上面那排筛选按钮 + 右边那颗 live/paused。四类各自独立开关，`全部` 是一次性全勾上。
 * 计数只给"未知"露出来（设计稿 `01-workbench.html:99` 就标了那一个）。
 */
export function TraceFilters({
    counts,
    shown,
    live,
    onToggle,
    onShowAll,
    onResumeLive,
}: {
    counts: Record<TraceFilterKind, number>;
    shown: ReadonlySet<TraceFilterKind>;
    live: boolean;
    onToggle: (kind: TraceFilterKind) => void;
    onShowAll: () => void;
    onResumeLive: () => void;
}): ReactElement {
    const allOn = TRACE_FILTER_KINDS.every((kind) => shown.has(kind));
    return (
        <div className="trace-filters" role="toolbar" aria-label="Trace filters">
            <button
                type="button"
                className="trace-chip"
                data-on={allOn || undefined}
                aria-pressed={allOn}
                onClick={onShowAll}
            >
                全部
            </button>
            {TRACE_FILTER_KINDS.map((kind) => {
                const on = shown.has(kind);
                const count = counts[kind];
                return (
                    <button
                        key={kind}
                        type="button"
                        className="trace-chip"
                        data-on={on || undefined}
                        aria-pressed={on}
                        onClick={() => {
                            onToggle(kind);
                        }}
                    >
                        {kind === "unknown" && count > 0
                            ? `${LABELS[kind]} ${count}`
                            : LABELS[kind]}
                    </button>
                );
            })}
            <button
                type="button"
                className="trace-live"
                data-paused={live ? undefined : true}
                onClick={onResumeLive}
                title={live ? "正在跟随最新事件" : "已停止跟随，点一下回到最新"}
            >
                <span
                    className="trace-led"
                    data-spin={live ? true : undefined}
                    data-off={live ? undefined : true}
                    aria-hidden="true"
                />
                {live ? "live" : "paused"}
            </button>
        </div>
    );
}
