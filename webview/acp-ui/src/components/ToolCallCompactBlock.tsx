import { type MouseEvent, type ReactElement, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { WorkspacePathOpenTarget } from "../../../../src/protocol/extensionHostMessages";
import "./ToolCallCompactBlock.css";
import type { TraceToolItem } from "../chatReducer";
import {
  type CompactToolDetailParts,
  compactGroupHiddenDetailCount,
  compactToolDetailParts,
  compactToolGroupSummaryParts,
  compactToolShowsDiffStats,
  diffLineStats,
} from "../toolCallCompactText";

export type OpenWorkspacePathOptions = {
  target?: WorkspacePathOpenTarget;
};

const pathTooltipDelayMs = 500;
const pathTooltipInstantWindowMs = 200;
let lastPathTooltipHideAt = 0;

function openPathClick(
  event: MouseEvent<HTMLAnchorElement>,
  openPath: string,
  openTarget: "auto" | undefined,
  onOpenWorkspacePath: ((path: string, options?: OpenWorkspacePathOptions) => void) | undefined,
): void {
  event.preventDefault();
  onOpenWorkspacePath?.(openPath, openTarget === "auto" ? { target: "auto" } : undefined);
}

function CompactPathLink({
  segment,
  onOpenWorkspacePath,
}: {
  segment: NonNullable<CompactToolDetailParts["pathSegment"]>;
  onOpenWorkspacePath: ((path: string, options?: OpenWorkspacePathOptions) => void) | undefined;
}): ReactElement {
  const linkRef = useRef<HTMLAnchorElement | null>(null);
  const tipRef = useRef<HTMLSpanElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);

  const clearTimer = (): void => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const hide = (): void => {
    clearTimer();
    if (openRef.current) {
      lastPathTooltipHideAt = Date.now();
    }
    openRef.current = false;
    setOpen(false);
  };

  useEffect(() => {
    return () => {
      clearTimer();
      if (openRef.current) {
        lastPathTooltipHideAt = Date.now();
      }
    };
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onScroll = (): void => {
      hide();
    };
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    const link = linkRef.current;
    const tip = tipRef.current;
    if (link === null || tip === null) {
      return;
    }
    const anchor = link.getBoundingClientRect();
    const box = tip.getBoundingClientRect();
    const gap = 4;
    let top = anchor.bottom + gap;
    if (top + box.height > window.innerHeight - 4) {
      top = Math.max(4, anchor.top - gap - box.height);
    }
    let left = anchor.left + anchor.width / 2 - box.width / 2;
    left = Math.min(Math.max(4, left), Math.max(4, window.innerWidth - box.width - 4));
    tip.style.top = `${top}px`;
    tip.style.left = `${left}px`;
    tip.style.visibility = "visible";
  }, [open]);

  const arm = (): void => {
    clearTimer();
    const elapsed = Date.now() - lastPathTooltipHideAt;
    const delay = elapsed < pathTooltipInstantWindowMs ? 0 : pathTooltipDelayMs;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      const link = linkRef.current;
      if (link === null) {
        return;
      }
      const resting = link.matches(":hover") || document.activeElement === link;
      if (!resting) {
        return;
      }
      openRef.current = true;
      setOpen(true);
    }, delay);
  };

  return (
    <>
      <a
        ref={linkRef}
        className="tool-call-compact-path-link"
        href="#"
        onClick={(event) => {
          openPathClick(event, segment.openPath, segment.openTarget, onOpenWorkspacePath);
        }}
        onMouseEnter={arm}
        onMouseLeave={hide}
        onFocus={arm}
        onBlur={hide}
      >
        {segment.label}
      </a>
      {open
        ? createPortal(
            <span ref={tipRef} className="acp-ui-hover-tooltip" role="tooltip">
              {segment.title}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}

function CompactDetailText({
  parts,
  onOpenWorkspacePath,
}: {
  parts: CompactToolDetailParts;
  onOpenWorkspacePath: ((path: string, options?: OpenWorkspacePathOptions) => void) | undefined;
}): ReactElement {
  const segment = parts.pathSegment;
  if (segment === undefined) {
    return <span className="tool-call-compact-detail-text">{parts.detail}</span>;
  }
  return (
    <span className="tool-call-compact-detail-text">
      {segment.prefix ?? null}
      <CompactPathLink segment={segment} onOpenWorkspacePath={onOpenWorkspacePath} />
      {segment.suffix ?? null}
    </span>
  );
}

function CompactVerbDetail({
  parts,
  onOpenWorkspacePath,
}: {
  parts: CompactToolDetailParts;
  onOpenWorkspacePath: ((path: string, options?: OpenWorkspacePathOptions) => void) | undefined;
}): ReactElement {
  return (
    <>
      <span className="tool-call-compact-verb">{parts.verb}</span>
      {parts.detail.length > 0 ? (
        <>
          {" "}
          <CompactDetailText parts={parts} onOpenWorkspacePath={onOpenWorkspacePath} />
        </>
      ) : null}
    </>
  );
}

function CompactEditLine({
  item,
  onOpenWorkspacePath,
}: {
  item: TraceToolItem;
  onOpenWorkspacePath: ((path: string, options?: OpenWorkspacePathOptions) => void) | undefined;
}): ReactElement {
  const parts = compactToolDetailParts(item);
  const { added, removed } = diffLineStats(item.diffRows);
  return (
    <span className="tool-call-compact-edit">
      <span className="tool-call-compact-verb">{parts.verb}</span>
      {parts.detail.length > 0 ? (
        <>
          {" "}
          <CompactDetailText parts={parts} onOpenWorkspacePath={onOpenWorkspacePath} />
        </>
      ) : null}
      {added > 0 ? (
        <span className="tool-call-compact-stat tool-call-compact-stat--added"> +{added}</span>
      ) : null}
      {removed > 0 ? (
        <span className="tool-call-compact-stat tool-call-compact-stat--removed"> -{removed}</span>
      ) : null}
    </span>
  );
}

function CompactDetailLine({
  item,
  onOpenWorkspacePath,
}: {
  item: TraceToolItem;
  onOpenWorkspacePath: ((path: string, options?: OpenWorkspacePathOptions) => void) | undefined;
}): ReactElement {
  if (compactToolShowsDiffStats(item)) {
    return <CompactEditLine item={item} onOpenWorkspacePath={onOpenWorkspacePath} />;
  }
  return (
    <CompactVerbDetail
      parts={compactToolDetailParts(item)}
      onOpenWorkspacePath={onOpenWorkspacePath}
    />
  );
}

function CompactGroupSummary({
  items,
  onOpenWorkspacePath,
}: {
  items: TraceToolItem[];
  onOpenWorkspacePath: ((path: string, options?: OpenWorkspacePathOptions) => void) | undefined;
}): ReactElement {
  const parts = compactToolGroupSummaryParts(items);
  if (parts === null) {
    return <CompactDetailLine item={items[0]!} onOpenWorkspacePath={onOpenWorkspacePath} />;
  }
  return (
    <>
      <span className="tool-call-compact-summary-verbs">{parts.verbs}</span>
      <span className="tool-call-compact-summary-counts"> {parts.counts}</span>
    </>
  );
}

/**
 * Compact tool-call presentation: one summary line, optional per-tool detail lines.
 */
export function ToolCallCompactBlock({
  items,
  className,
  maxVisibleDetails,
  onOpenWorkspacePath,
}: {
  items: TraceToolItem[];
  className?: string;
  /** When set, grouped blocks show only the last N detail lines. */
  maxVisibleDetails?: number;
  onOpenWorkspacePath?: (path: string, options?: OpenWorkspacePathOptions) => void;
}): ReactElement {
  const single = items.length === 1;
  const inProgress = items.some(
    (item) => item.status === "pending" || item.status === "in_progress",
  );
  const visibleItems =
    maxVisibleDetails === undefined || single ? items : items.slice(-maxVisibleDetails);
  const hiddenDetailCount =
    maxVisibleDetails === undefined || single
      ? 0
      : compactGroupHiddenDetailCount(items.length, maxVisibleDetails);
  const truncatedDetails = hiddenDetailCount > 0;

  return (
    <div
      className={
        className === undefined || className.length === 0
          ? truncatedDetails
            ? "tool-call-compact tool-call-compact--truncated-details"
            : "tool-call-compact"
          : truncatedDetails
            ? `tool-call-compact tool-call-compact--truncated-details ${className}`
            : `tool-call-compact ${className}`
      }
      data-status={inProgress ? "in_progress" : "completed"}
      role="status"
      aria-label="Tool use"
    >
      <div className="tool-call-compact-summary">
        {single ? (
          <CompactDetailLine item={items[0]!} onOpenWorkspacePath={onOpenWorkspacePath} />
        ) : (
          <CompactGroupSummary items={items} onOpenWorkspacePath={onOpenWorkspacePath} />
        )}
      </div>
      {!single ? (
        <ul className="tool-call-compact-details" aria-label="Tool details">
          {hiddenDetailCount > 0 ? (
            <li className="tool-call-compact-hidden-row" aria-hidden="true">
              ... {hiddenDetailCount} earlier items hidden
            </li>
          ) : null}
          {visibleItems.map((item) => (
            <li
              key={item.toolCallId}
              className="tool-call-compact-detail-row"
              data-tool-id={item.toolCallId}
              data-status={item.status}
            >
              <CompactDetailLine item={item} onOpenWorkspacePath={onOpenWorkspacePath} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
