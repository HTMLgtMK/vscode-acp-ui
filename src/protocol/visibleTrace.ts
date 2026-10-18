export const maxVisibleTraceItems = 40;

export const ACP_UI_VISIBLE_TRACE_SCHEMA = "acpUi/visibleTrace/1" as const;

type ToolCallStatus = "pending" | "in_progress" | "completed" | "failed";

type ToolCallDiffRow = {
    kind: "removed" | "added" | "context";
    text: string;
};

type PlanEntry = {
    content: string;
    status: string;
    priority?: string;
};

/** First-line document header; references the sibling `.acp` session file. */
export type AcpUiVisibleTraceMeta = {
    type: "meta";
    schema: typeof ACP_UI_VISIBLE_TRACE_SCHEMA;
    sessionId: string;
    sessionFile: string;
};

export type AcpUiVisibleTraceItem =
    | { type: "user"; text: string }
    | { type: "thought"; text: string; durationMs?: number }
    | { type: "agent"; text: string }
    | {
          type: "tool";
          toolCallId: string;
          title: string;
          kind?: string;
          subtitle?: string;
          status: ToolCallStatus;
          content?: string;
          diffRows?: ToolCallDiffRow[];
          detailVisible?: boolean;
          durationMs?: number;
      }
    | { type: "plan"; entries: PlanEntry[] };

export type AcpUiVisibleTraceDocument = {
    meta: AcpUiVisibleTraceMeta | null;
    items: AcpUiVisibleTraceItem[];
};

const toolCallStatuses = new Set<ToolCallStatus>(["pending", "in_progress", "completed", "failed"]);

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object";
}

function optionalString(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
}

/** Positive finite millisecond durations only (0 / negative are treated as missing). */
export function positiveDurationMs(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** Compact clock label for thought and command durations (for example `450ms`, `1.2s`). */
export function formatCompactDurationMs(durationMs: number): string {
    if (!Number.isFinite(durationMs) || durationMs < 0) {
        return "";
    }
    if (durationMs < 1000) {
        return `${Math.round(durationMs)}ms`;
    }
    return `${(durationMs / 1000).toFixed(1)}s`;
}

function parseDiffRows(value: unknown): ToolCallDiffRow[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }
    const rows: ToolCallDiffRow[] = [];
    for (const row of value) {
        if (!isRecord(row)) {
            continue;
        }
        if (row.kind !== "removed" && row.kind !== "added" && row.kind !== "context") {
            continue;
        }
        if (typeof row.text !== "string") {
            continue;
        }
        rows.push({ kind: row.kind, text: row.text });
    }
    return rows.length > 0 ? rows : undefined;
}

function parsePlanEntries(value: unknown): PlanEntry[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }
    const entries: PlanEntry[] = [];
    for (const row of value) {
        if (!isRecord(row) || typeof row.content !== "string" || typeof row.status !== "string") {
            continue;
        }
        const priority = optionalString(row.priority);
        entries.push({
            content: row.content,
            status: row.status,
            ...(priority !== undefined ? { priority } : {}),
        });
    }
    return entries.length > 0 ? entries : undefined;
}

function parseVisibleTraceMeta(value: unknown): AcpUiVisibleTraceMeta | null {
    if (!isRecord(value) || value.type !== "meta") {
        return null;
    }
    if (value.schema !== ACP_UI_VISIBLE_TRACE_SCHEMA) {
        return null;
    }
    if (typeof value.sessionId !== "string" || value.sessionId.length === 0) {
        return null;
    }
    if (typeof value.sessionFile !== "string" || value.sessionFile.length === 0) {
        return null;
    }
    return {
        type: "meta",
        schema: ACP_UI_VISIBLE_TRACE_SCHEMA,
        sessionId: value.sessionId,
        sessionFile: value.sessionFile,
    };
}

function parseVisibleTraceItem(value: unknown): AcpUiVisibleTraceItem | null {
    if (!isRecord(value) || typeof value.type !== "string") {
        return null;
    }
    if (value.type === "meta") {
        return null;
    }
    if (value.type === "user" || value.type === "agent") {
        if (typeof value.text !== "string") {
            return null;
        }
        return { type: value.type, text: value.text };
    }
    if (value.type === "thought") {
        if (typeof value.text !== "string") {
            return null;
        }
        const durationMs = positiveDurationMs(value.durationMs);
        return {
            type: "thought",
            text: value.text,
            ...(durationMs !== undefined ? { durationMs } : {}),
        };
    }
    if (value.type === "plan") {
        const entries = parsePlanEntries(value.entries);
        if (entries === undefined) {
            return null;
        }
        return { type: "plan", entries };
    }
    if (value.type !== "tool") {
        return null;
    }
    if (typeof value.toolCallId !== "string" || value.toolCallId.length === 0) {
        return null;
    }
    if (typeof value.title !== "string") {
        return null;
    }
    if (typeof value.status !== "string" || !toolCallStatuses.has(value.status as ToolCallStatus)) {
        return null;
    }
    const kind = optionalString(value.kind);
    const subtitle = optionalString(value.subtitle);
    const content = optionalString(value.content);
    const diffRows = parseDiffRows(value.diffRows);
    const detailVisible = value.detailVisible === true;
    const durationMs = positiveDurationMs(value.durationMs);
    return {
        type: "tool",
        toolCallId: value.toolCallId,
        title: value.title,
        status: value.status as ToolCallStatus,
        ...(kind !== undefined ? { kind } : {}),
        ...(subtitle !== undefined ? { subtitle } : {}),
        ...(content !== undefined ? { content } : {}),
        ...(diffRows !== undefined ? { diffRows } : {}),
        ...(detailVisible ? { detailVisible } : {}),
        ...(durationMs !== undefined ? { durationMs } : {}),
    };
}

/**
 * Keeps valid trace items and caps the list at the viewport tail.
 */
export function normalizeVisibleTrace(entries: unknown): AcpUiVisibleTraceItem[] {
    if (!Array.isArray(entries)) {
        return [];
    }
    const out: AcpUiVisibleTraceItem[] = [];
    for (const item of entries) {
        const parsed = parseVisibleTraceItem(item);
        if (parsed !== null) {
            out.push(parsed);
        }
    }
    if (out.length > maxVisibleTraceItems) {
        return out.slice(out.length - maxVisibleTraceItems);
    }
    return out;
}

/**
 * One optional meta header line, then one trace item per line.
 * UI-only fields (for example thought and tool `durationMs`) live here; the `.acp` file stays the session document.
 */
export function serializeVisibleTraceJsonl(
    items: readonly AcpUiVisibleTraceItem[],
    meta?: { sessionId: string; sessionFile: string },
): string {
    const lines: string[] = [];
    if (meta !== undefined && meta.sessionId.length > 0 && meta.sessionFile.length > 0) {
        const header: AcpUiVisibleTraceMeta = {
            type: "meta",
            schema: ACP_UI_VISIBLE_TRACE_SCHEMA,
            sessionId: meta.sessionId,
            sessionFile: meta.sessionFile,
        };
        lines.push(JSON.stringify(header));
    }
    for (const item of items) {
        lines.push(JSON.stringify(item));
    }
    if (lines.length === 0) {
        return "";
    }
    return `${lines.join("\n")}\n`;
}

/**
 * Parses a visible-trace JSONL document, including an optional meta header.
 */
export function parseVisibleTraceDocument(text: string): AcpUiVisibleTraceDocument {
    const rows: unknown[] = [];
    let meta: AcpUiVisibleTraceMeta | null = null;
    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed.length === 0) {
            continue;
        }
        try {
            const parsed: unknown = JSON.parse(trimmed);
            if (meta === null) {
                const header = parseVisibleTraceMeta(parsed);
                if (header !== null) {
                    meta = header;
                    continue;
                }
            }
            rows.push(parsed);
        } catch {
            continue;
        }
    }
    return { meta, items: normalizeVisibleTrace(rows) };
}

/**
 * Parses a visible-trace JSONL document.
 */
export function parseVisibleTraceJsonl(text: string): AcpUiVisibleTraceItem[] {
    return parseVisibleTraceDocument(text).items;
}
