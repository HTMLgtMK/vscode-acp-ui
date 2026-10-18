import { type ReactElement, type SyntheticEvent, useState } from "react";
import { formatCompactDurationMs } from "../../../../src/protocol/visibleTrace";
import "./AgentThoughtBlock.css";

function durationLabel(durationMs: number | undefined): string {
  if (durationMs === undefined || !Number.isFinite(durationMs) || durationMs < 0) {
    return "Thought";
  }
  const compact = formatCompactDurationMs(durationMs);
  return compact.length > 0 ? `Thought for ${compact}` : "Thought";
}

/**
 * Renders a compact model-thought chunk as a dim terminal-style block.
 * The heading toggles the thought text.
 */
export function AgentThoughtBlock({
  text,
  durationMs,
  className,
}: {
  text: string;
  durationMs?: number;
  className?: string;
}): ReactElement {
  const [expanded, setExpanded] = useState(true);

  const onToggle = (event: SyntheticEvent<HTMLDetailsElement>): void => {
    setExpanded(event.currentTarget.open);
  };

  return (
    <details
      className={
        className === undefined || className.length === 0
          ? "agent-thought-chunk"
          : `agent-thought-chunk ${className}`
      }
      open={expanded}
      onToggle={onToggle}
      aria-label="Agent thought"
    >
      <summary className="agent-thought-chunk-title">
        <span className="agent-thought-chunk-chevron" aria-hidden="true" />
        {durationLabel(durationMs)}
      </summary>
      <pre className="agent-thought-chunk-body">{text}</pre>
    </details>
  );
}
