import {
    type KeyboardEvent,
    type ReactElement,
    useEffect,
    useRef,
    useState,
} from "react";
import "./ToolCallBlock.css";
import type { ToolCallStatus } from "../../../../src/protocol/extensionHostMessages";
import type { TraceToolItem } from "../chatReducer";

function collapsibleRegionAriaLabel(
    kind: string | undefined,
    expanded: boolean,
): string {
    const tail = expanded
        ? "all long outputs expanded; press Ctrl+O or ⌘O to collapse all"
        : "truncated; use Expand or press Ctrl+O or ⌘O to expand";
    if (kind === "read") {
        return `File preview, ${tail}`;
    }
    if (kind === "execute") {
        return `Terminal output, ${tail}`;
    }
    return `Tool output, ${tail}`;
}

function collapsibleDiffAriaLabel(expanded: boolean): string {
    const tail = expanded
        ? "full diff; press Ctrl+O or ⌘O to collapse long diffs"
        : "truncated; use Expand or press Ctrl+O or ⌘O to expand";
    return `File diff, ${tail}`;
}

function collapsibleHintText(expandAllGlobal: boolean): string {
    return expandAllGlobal
        ? "Press Ctrl+O or ⌘O to collapse all long outputs."
        : "Press Ctrl+O or ⌘O to expand all long outputs.";
}

function CollapsibleHintRow({
    expandAllGlobal,
}: {
    expandAllGlobal: boolean;
}): ReactElement {
    // 只展示快捷键说明：展开/收起点击入口是 header 本身，按钮是冗余噪音。
    return (
        <p className="tool-call-collapsible-hint">
            <span className="tool-call-collapsible-hint-text">
                {collapsibleHintText(expandAllGlobal)}
            </span>
        </p>
    );
}

/** Normalized header presentation: one label + one optional payload region. */
type ToolHeaderPresentation = {
    /** Collapsed header label: the tool name (e.g. "curl", "memory_search") or a structured title like "Write File". */
    label: string;
    /** Always-visible sub-line (paths etc.); null hides it. */
    subtitle: string | null;
    /** Payload revealed by expanding the header (command line, args JSON); null = nothing extra. */
    payload: { kind: "command" | "arguments"; text: string } | null;
};

/**
 * Normalizes any daemon tool-call shape into one header presentation.
 * Precedence: execute command (subtitle / backtick title) > generic
 * `name(args)` title > structured title as-is. All tools render through
 * this single path so header markup stays identical across shapes.
 */
function toolHeaderPresentation(item: TraceToolItem): ToolHeaderPresentation {
    // execute: shell line from subtitle (with optional "$" prefix) or `backtick` title
    if (item.kind === "execute") {
        const sub = item.subtitle?.trim() ?? "";
        const fromSubtitle =
            sub.length > 0
                ? sub.startsWith("$")
                  ? sub.slice(1).trimStart()
                  : sub
                : "";
        const tit = item.title.trim();
        const fromBacktick =
            tit.length >= 2 && tit.startsWith("`") && tit.endsWith("`")
                ? tit.slice(1, -1).trim()
                : "";
        const command = fromSubtitle.length > 0 ? fromSubtitle : fromBacktick;
        if (command.length > 0) {
            const firstWord = command.split(/\s+/)[0] ?? "";
            return {
                label: firstWord.length > 0 ? firstWord : "tool",
                subtitle: null,
                payload: { kind: "command", text: command },
            };
        }
        return { label: "tool", subtitle: null, payload: null };
    }

    // generic daemon shape: `name(argsJson)` — name becomes the label, args the payload
    const match = /^([A-Za-z_][A-Za-z0-9_.:-]*)\(([\s\S]*)\)\s*$/.exec(
        item.title.trim(),
    );
    if (match !== null) {
        const args = match[2]!.trim();
        return {
            label: match[1]!,
            subtitle: null,
            payload:
                args.length > 0
                    ? { kind: "arguments", text: args }
                    : null,
        };
    }

    // structured title (e.g. "Write File"): keep as-is with any sub-line
    const sub = item.subtitle?.trim() ?? "";
    return {
        label: item.title,
        subtitle: sub.length > 0 ? sub : null,
        payload: null,
    };
}

function ToolCallStatusGlyph({
    status,
}: {
    status: ToolCallStatus;
}): ReactElement {
    if (status === "in_progress" || status === "pending") {
        return (
            <span
                className="tool-call-terminal-status tool-call-terminal-status--in-progress"
                aria-hidden="true"
            />
        );
    }
    if (status === "completed") {
        return (
            <span
                className="tool-call-terminal-status tool-call-terminal-status--completed"
                aria-hidden="true"
            />
        );
    }
    return (
        <span
            className="tool-call-terminal-status tool-call-terminal-status--failed"
            aria-hidden="true"
        >
            {"\u2715"}
        </span>
    );
}

/**
 * Renders a tool invocation as a compact integrated-terminal style block (prompt line + optional output).
 */
export function ToolCallBlock({
    item,
    expandAllToolOutputs,
    onCollapseExpandAll,
    className,
}: {
    item: TraceToolItem;
    expandAllToolOutputs: boolean;
    onCollapseExpandAll?: () => void;
    className?: string;
}): ReactElement {
    const [localExpanded, setLocalExpanded] = useState(false);
    const prevExpandAllRef = useRef(expandAllToolOutputs);
    useEffect(() => {
        if (prevExpandAllRef.current && !expandAllToolOutputs) {
            setLocalExpanded(false);
        }
        prevExpandAllRef.current = expandAllToolOutputs;
    }, [expandAllToolOutputs]);
    const expandedThis = expandAllToolOutputs || localExpanded;

    const kindHidden = item.kind === undefined || item.kind.length === 0;
    const hasDiff = item.diffRows !== undefined && item.diffRows.length > 0;
    const showOutput =
        item.detailVisible &&
        (hasDiff ||
            (item.content !== undefined && item.content.trim().length > 0));
    const header = toolHeaderPresentation(item);
    const contentText = item.content ?? "";
    // 全折叠模式（与 thought 的 <details> 行为一致）：收起时不渲染输出，
    // 展开显示全文。
    const outputCollapsible = !hasDiff && showOutput;
    const diffRows = item.diffRows;
    const diffCollapsible = hasDiff;
    const displayedDiffRows = diffRows ?? [];

    const headerCollapsible =
        header.payload !== null ||
        (showOutput && (diffCollapsible || outputCollapsible));

    const collapseThisOutput = (): void => {
        setLocalExpanded(false);
        if (expandAllToolOutputs) {
            onCollapseExpandAll?.();
        }
    };

    const expandThisOutput = (): void => {
        setLocalExpanded(true);
    };

    const onHeaderKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
        if (!headerCollapsible) {
            return;
        }
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (expandedThis) {
                collapseThisOutput();
            } else {
                expandThisOutput();
            }
        }
    };

    return (
        <div
            className={
                className === undefined || className.length === 0
                    ? "tool-call-terminal"
                    : `tool-call-terminal ${className}`
            }
            data-tool-id={item.toolCallId}
            data-status={item.status}
            data-collapsed={
                headerCollapsible ? String(!expandedThis) : "false"
            }
            role="status"
            aria-label="Tool use"
        >
            <div
                className={
                    headerCollapsible
                        ? "tool-call-terminal-line tool-call-terminal-line--expandable"
                        : "tool-call-terminal-line"
                }
                onClick={
                    headerCollapsible
                        ? () => {
                              if (expandedThis) {
                                  collapseThisOutput();
                              } else {
                                  expandThisOutput();
                              }
                          }
                        : undefined
                }
                onKeyDown={onHeaderKeyDown}
                role={headerCollapsible ? "button" : undefined}
                tabIndex={headerCollapsible ? 0 : undefined}
                aria-label={
                    headerCollapsible
                        ? expandedThis
                            ? "Collapse this tool output"
                            : "Expand this tool output"
                        : undefined
                }
            >
                <div className="tool-call-terminal-line-main">
                    <span
                        className="tool-call-terminal-caret"
                        aria-hidden="true"
                    >
                        ▸
                    </span>
                    <span className="tool-call-terminal-title">
                        {header.label}
                    </span>
                    {kindHidden ? null : (
                        <span className="tool-call-terminal-kind">
                            [{item.kind}]
                        </span>
                    )}
                </div>
            </div>
            {header.subtitle !== null ? (
                <div className="tool-call-terminal-subtitle">
                    {header.subtitle}
                </div>
            ) : null}
            {header.payload !== null &&
            !(headerCollapsible && !expandedThis) ? (
                <div
                    className="tool-call-terminal-commandline"
                    aria-label={
                        header.payload.kind === "command"
                            ? "Command"
                            : "Tool arguments"
                    }
                >
                    {header.payload.kind === "command" ? (
                        <span
                            className="tool-call-terminal-prompt tool-call-terminal-prompt--inline"
                            aria-hidden="true"
                        >
                            $
                        </span>
                    ) : null}
                    <span className="tool-call-terminal-command-text">
                        {header.payload.text}
                    </span>
                </div>
            ) : null}
            {showOutput && hasDiff ? (
                diffCollapsible && !expandedThis ? (
                    <div
                        className="tool-call-collapsible-output"
                        role="group"
                        aria-expanded={false}
                        aria-label={collapsibleDiffAriaLabel(false)}
                    >
                        <CollapsibleHintRow
                            expandAllGlobal={expandAllToolOutputs}
                        />
                    </div>
                ) : (
                    <>
                        <div
                            className="tool-call-diff"
                            role="group"
                            aria-label="File diff"
                        >
                            {displayedDiffRows.map((row, rowIndex) => (
                                <div
                                    key={rowIndex}
                                    className={
                                        row.kind === "removed"
                                            ? "tool-c…line tool-c…line--removed"
                                            : row.kind === "added"
                                              ? "tool-c…line tool-c…line--added"
                                              : "tool-c…line tool-c…line--context"
                                    }
                                >
                                    <span
                                        className="tool-call-diff-prefix"
                                        aria-hidden="true"
                                    >
                                        {row.kind === "removed"
                                            ? "-"
                                            : row.kind === "added"
                                              ? "+"
                                              : " "}
                                    </span>
                                    <span className="tool-c…text">
                                        {row.text}
                                    </span>
                                </div>
                            ))}
                        </div>
                        <CollapsibleHintRow
                            expandAllGlobal={expandAllToolOutputs}
                        />
                    </>
                )

            ) : showOutput ? (
                outputCollapsible && !expandedThis ? (
                    <div
                        className="tool-call-collapsible-output"
                        role="group"
                        aria-expanded={false}
                        aria-label={collapsibleRegionAriaLabel(
                            item.kind,
                            false,
                        )}
                    >
                        <CollapsibleHintRow
                            expandAllGlobal={expandAllToolOutputs}
                        />
                    </div>
                ) : outputCollapsible && expandedThis ? (
                    <div
                        className="tool-call-collapsible-output"
                        role="group"
                        aria-expanded={true}
                        aria-label={collapsibleRegionAriaLabel(item.kind, true)}
                    >
                        <pre className="tool-call-terminal-pre">
                            {contentText}
                        </pre>
                        <CollapsibleHintRow
                            expandAllGlobal={expandAllToolOutputs}
                        />
                    </div>
                ) : (
                    <pre className="tool-call-terminal-pre">{contentText}</pre>
                )
            ) : null}
        </div>
    );
}
