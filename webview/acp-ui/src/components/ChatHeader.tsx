import type { ReactElement } from "react";
import "./ChatHeader.css";

export type ChatHeaderProps = {
  agentVersionLabel: string | undefined;
  workspaceText: string;
};

/**
 * Webview header: product title and workspace label.
 */
export function ChatHeader({ agentVersionLabel, workspaceText }: ChatHeaderProps): ReactElement {
  return (
    <header className="agent-header">
      <div className="agent-title-line">
        ACP UI <span className="agent-version">{agentVersionLabel ?? ""}</span>
      </div>
      <div className="agent-meta-line" title={workspaceText}>
        {workspaceText}
      </div>
    </header>
  );
}
