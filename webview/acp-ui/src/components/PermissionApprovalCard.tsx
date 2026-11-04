import { useEffect, useRef, type ReactElement } from "react";
import type { PermissionPromptState } from "../chatReducer";
import "./PermissionApprovalCard.css";

/**
 * 去掉工具标题外层的一对反引号（agent 常把命令包成 markdown 行内码）。
 */
function toolSummaryForDisplay(raw: string): string {
    const t = raw.trim();
    if (t.length >= 2 && t.startsWith("`") && t.endsWith("`")) {
        return t.slice(1, -1).trim();
    }
    return raw;
}

/**
 * 权限审批卡（稿 03 B②③）：整块占掉底部输入区，审批期间 composer 不渲染。
 *
 * 按钮完全来自 daemon 下发的 options（FR-012），卡片不写死数量；
 * `Dismiss` 是本地动作 —— 不发任何 option，裁决到 daemon 自己的截止时间判拒。
 * Esc 等价 Dismiss。
 */
export function PermissionApprovalCard({
    prompt,
    queueLength,
    total,
    onOption,
    onDismiss,
}: {
    prompt: PermissionPromptState;
    /** 队列里还挂着几条（含正在显示的这条），副标题用。 */
    queueLength: number;
    /** 本轮到达总数，角标的分母。 */
    total: number;
    onOption: (optionId: string) => void;
    onDismiss: () => void;
}): ReactElement {
    const cardRef = useRef<HTMLDivElement | null>(null);

    // Esc = Dismiss：挂在 document 上，焦点在不在卡里都收得到。
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent): void => {
            if (event.key !== "Escape") {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            onDismiss();
        };
        document.addEventListener("keydown", onKeyDown, true);
        return () => {
            document.removeEventListener("keydown", onKeyDown, true);
        };
    }, [onDismiss]);

    const toolSummary = toolSummaryForDisplay(prompt.toolTitle);
    return (
        <div
            ref={cardRef}
            className="approval-card"
            role="dialog"
            aria-modal="false"
            aria-labelledby="approval-title"
            tabIndex={-1}
            data-testid="approval-card"
        >
            <div className="approval-head">
                <strong id="approval-title">⚠ 需要授权</strong>
                <span className="approval-note">
                    {prompt.index > 1
                        ? `上一条裁决后还有 ${queueLength} 条在排队`
                        : "worker 请求执行以下操作"}
                </span>
                <span className="approval-queue" data-testid="approval-queue">
                    {`${prompt.index} / ${total} pending`}
                </span>
            </div>
            <pre className="approval-tool" title={toolSummary}>
                {toolSummary}
            </pre>
            <div className="approval-actions">
                {prompt.options.map((option, position) => (
                    <button
                        key={option.optionId}
                        type="button"
                        className="approval-option"
                        data-option-id={option.optionId}
                        {...(position === 0 ? { "data-primary": "" } : {})}
                        onClick={() => {
                            onOption(option.optionId);
                        }}
                    >
                        {option.name}
                    </button>
                ))}
                <button
                    type="button"
                    className="approval-dismiss"
                    onClick={onDismiss}
                >
                    Dismiss
                </button>
            </div>
        </div>
    );
}
