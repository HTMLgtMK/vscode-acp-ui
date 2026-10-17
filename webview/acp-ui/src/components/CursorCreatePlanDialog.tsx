import type { ReactElement } from "react";
import type { CreatePlanPromptState } from "../chatReducer";
import "./PermissionDialog.css";

export function CursorCreatePlanDialog({
  request,
  onAccept,
  onReject,
  onCancel,
}: {
  request: CreatePlanPromptState;
  onAccept: () => void;
  onReject: () => void;
  onCancel: () => void;
}): ReactElement {
  return (
    <div className="ib-permission-backdrop" role="presentation">
      <div className="ib-permission-dialog" role="dialog" aria-modal="true">
        <div className="ib-permission-title">{request.name?.trim() || "Approve plan"}</div>
        {request.overview ? <div className="ib-permission-tool">{request.overview}</div> : null}
        <pre
          style={{
            margin: "0 0 0.75rem 0",
            whiteSpace: "pre-wrap",
            maxHeight: "220px",
            overflow: "auto",
          }}
        >
          {request.plan}
        </pre>
        <div className="ib-permission-actions">
          <button type="button" className="ib-permission-button" onClick={onAccept}>
            Accept
          </button>
          <button type="button" className="ib-permission-button" onClick={onReject}>
            Reject
          </button>
          <button
            type="button"
            className="ib-permission-button ib-permission-button--secondary"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
