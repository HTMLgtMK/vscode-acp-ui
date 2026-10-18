import type { ReactElement } from "react";
import "./SessionHistoryLoader.css";

/**
 * Spinner shown while ACP `session/load` replays conversation history.
 */
export function SessionHistoryLoader({
  inline = false,
  overlay = false,
}: {
  inline?: boolean;
  overlay?: boolean;
}): ReactElement {
  const className = overlay
    ? "session-history-loader session-history-loader--overlay"
    : inline
      ? "session-history-loader session-history-loader--inline"
      : "session-history-loader";
  const label = overlay ? "Loading earlier messages" : "Loading conversation history";
  return (
    <div className={className} role="status" aria-live="polite" aria-label={label}>
      <div className="session-history-loader__spinner" aria-hidden="true" />
      <span>{overlay ? "Loading earlier messages" : "Loading conversation..."}</span>
    </div>
  );
}
