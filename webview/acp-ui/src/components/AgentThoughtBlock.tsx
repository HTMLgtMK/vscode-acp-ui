import { type ReactElement } from "react";
import "./AgentThoughtBlock.css";

function durationLabel(durationMs: number | undefined): string {
    if (durationMs === undefined || !Number.isFinite(durationMs) || durationMs < 0) {
        return "";
    }
    return ` ${(Math.round(durationMs) / 1000).toFixed(1)}s`;
}

/**
 * Renders a model-thought chunk as a collapsed-by-default terminal-style note.
 * Streams arrive as openThought/appendAgentThought/thoughtComplete; the host flips
 * `streaming` off when the thought closes, collapsing the block automatically.
 */
export function AgentThoughtBlock({
    text,
    durationMs,
    className,
    streaming = false,
}: {
    text: string;
    durationMs?: number;
    className?: string;
    /** True while the thought is still streaming; keeps the block open. */
    streaming?: boolean;
}): ReactElement {
    const classes =
        className === undefined || className.length === 0
            ? "agent-thought-chunk"
            : `agent-thought-chunk ${className}`;
    return (
        <details
            className={classes}
            open={streaming}
            aria-label="Agent thought"
        >
            <summary className="agent-thought-chunk-summary">
                <span
                    className="agent-thought-chunk-caret"
                    aria-hidden="true"
                >
                    ▸
                </span>
                <span className="agent-thought-chunk-label">thought</span>
                {durationMs !== undefined ? (
                    <span className="agent-thought-chunk-duration">
                        {durationLabel(durationMs)}
                    </span>
                ) : null}
            </summary>
            <pre className="agent-thought-chunk-body">{text}</pre>
        </details>
    );
}
