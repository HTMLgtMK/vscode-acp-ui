import { type ReactElement, useState } from "react";
import "./UnknownUpdateBlock.css";
import type { TraceUnknownItem } from "../chatReducer";

/**
 * 未知 `session/update` 的一条折叠原文（FR-011）：收起时只露类型名，点开才是整条 JSON。
 * 目的是让人一眼看出"这里来过一条没人认识的东西"，而不是界面默默少一块。
 */
export function UnknownUpdateBlock({
    item,
    className,
}: {
    item: TraceUnknownItem;
    className?: string;
}): ReactElement {
    const [expanded, setExpanded] = useState(false);
    return (
        <div
            className={
                className === undefined || className.length === 0
                    ? "unknown-update"
                    : `unknown-update ${className}`
            }
            aria-label="Unknown session update"
        >
            <button
                type="button"
                className="unknown-update-header"
                aria-expanded={expanded}
                onClick={() => {
                    setExpanded((previous) => !previous);
                }}
            >
                <span className="unknown-update-caret" aria-hidden="true">
                    {expanded ? "▾" : "▸"}
                </span>
                <span className="unknown-update-label">未知事件</span>
                <code className="unknown-update-kind">{item.sessionUpdate}</code>
            </button>
            {expanded ? (
                <pre className="unknown-update-raw">{item.rawJson}</pre>
            ) : null}
        </div>
    );
}
