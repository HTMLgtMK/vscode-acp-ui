import type { ReactElement } from "react";
import "./TaskDetailHeader.css";
import type { TaskHeaderInfo } from "../../../../src/protocol/extensionHostMessages";

/** daemon 那九个状态折成四档配色，和侧栏 `.gw-node[data-state]` 用的是同一套词。 */
function stateBucket(status: string): "running" | "review" | "done" | "failed" | "queued" {
    switch (status) {
        case "working":
        case "dispatching":
            return "running";
        case "awaiting_review":
            return "review";
        case "done":
        case "merging":
            return "done";
        case "failed":
        case "rejected":
        case "cancelled":
            return "failed";
        default:
            return "queued";
    }
}

/**
 * 任务详情面板的 header（T028）：标题 + 状态徽标，下面一行 kind / worker / branch / task id。
 * 渲在 trace 组件外面，字段全由宿主给（`taskHeader` 那条下行）—— 本仓不拼 HTML。
 * 聊天面板不发这条下行，这里就整块不渲。
 */
export function TaskDetailHeader({
    header,
}: {
    header: TaskHeaderInfo | null;
}): ReactElement | null {
    if (header === null) {
        return null;
    }
    const meta: Array<{ label: string; value: string }> = [];
    if (header.kind !== undefined && header.kind.length > 0) {
        meta.push({ label: "kind", value: header.kind });
    }
    if (header.worker !== undefined && header.worker.length > 0) {
        meta.push({ label: "worker", value: header.worker });
    }
    if (header.branch !== undefined && header.branch.length > 0) {
        meta.push({ label: "branch", value: header.branch });
    }
    return (
        <header className="task-header">
            <div className="task-header-title">
                <span className="task-header-name">{header.title}</span>
                {header.status !== undefined && header.status.length > 0 ? (
                    <span
                        className="task-header-badge"
                        data-state={stateBucket(header.status)}
                    >
                        {header.status}
                    </span>
                ) : null}
            </div>
            <div className="task-header-meta">
                {meta.map((item) => (
                    <span key={item.label} className="task-header-kv">
                        {item.label} <b>{item.value}</b>
                    </span>
                ))}
                <span className="task-header-id">{header.taskId}</span>
            </div>
        </header>
    );
}
