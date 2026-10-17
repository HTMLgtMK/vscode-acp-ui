import type { ReactElement } from "react";
import "./PermissionDialog.css";

/**
 * Removes one outer pair of backticks from agent tool titles (markdown-style command snippets).
 */
function permissionToolSummaryForDisplay(raw: string): string {
  const t = raw.trim();
  if (t.length >= 2 && t.startsWith("`") && t.endsWith("`")) {
    return t.slice(1, -1).trim();
  }
  return raw;
}

/**
 * Modal strip above the composer for `session/request_permission` (ACP).
 */
export function PermissionDialog({
  toolTitle,
  options,
  onSelect,
  onDismiss,
}: {
  toolTitle: string;
  options: { optionId: string; name: string }[];
  onSelect: (optionId: string) => void;
  onDismiss: () => void;
}): ReactElement {
  const toolSummary = permissionToolSummaryForDisplay(toolTitle);
  return (
    <div className="ib-permission-backdrop" role="presentation">
      <div
        className="ib-permission-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ib-permission-title"
      >
        <div id="ib-permission-title" className="ib-permission-title">
          Permission required
        </div>
        <div className="ib-permission-tool" title={toolSummary}>
          {toolSummary}
        </div>
        <div className="ib-permission-actions">
          {options.map((o) => (
            <button
              key={o.optionId}
              type="button"
              className="ib-permission-button"
              onClick={() => {
                onSelect(o.optionId);
              }}
            >
              {o.name}
            </button>
          ))}
          <button
            type="button"
            className="ib-permission-button ib-permission-button--secondary"
            onClick={onDismiss}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
