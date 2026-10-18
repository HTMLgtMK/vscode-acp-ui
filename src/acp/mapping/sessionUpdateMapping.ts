import type * as acp from "@agentclientprotocol/sdk";
import type {
    ExtensionToWebviewMessage,
    ToolCallDiffRow,
    ToolCallStatus,
} from "../../protocol/extensionHostMessages";
import { positiveDurationMs } from "../../protocol/visibleTrace";
import { sessionConfigOptionsFromAgent } from "../session/sessionConfigOptions";
import { normalizeSlashCommand } from "../slashCommandMetadata";
import { canonicalToolCallId } from "./canonicalToolCallId";
import { computeToolCallDiffRows } from "./toolCallDiffLines";

function durationMsFromUpdatePayload(value: unknown): number | undefined {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return undefined;
    }
    const record = value as Record<string, unknown>;
    const top = positiveDurationMs(record.durationMs) ?? positiveDurationMs(record.duration_ms);
    if (top !== undefined) {
        return top;
    }
    const meta = record._meta;
    if (meta === null || typeof meta !== "object" || Array.isArray(meta)) {
        return undefined;
    }
    const metaRecord = meta as Record<string, unknown>;
    return positiveDurationMs(metaRecord.durationMs) ?? positiveDurationMs(metaRecord.duration_ms);
}

const maxToolDisplayChars = 120_000;

function lineCountForToolSummary(text: string): number {
    if (text === "") {
        return 0;
    }
    let normalized = text;
    if (normalized.endsWith("\n")) {
        normalized = normalized.slice(0, -1);
    }
    if (normalized === "") {
        return 0;
    }
    return normalized.split("\n").length;
}

function clipToolDisplayText(text: string): string {
    if (text.length <= maxToolDisplayChars) {
        return text;
    }
    return `${text.slice(0, maxToolDisplayChars)}\n\n... (truncated for display)`;
}

function formatContentBlockForTool(block: acp.ContentBlock): string | undefined {
    if (block.type === "text") {
        const t = block.text.trim();
        return t.length > 0 ? t : undefined;
    }
    return `[${block.type}]`;
}

function formatDiffPieceAsFullText(piece: acp.ToolCallContent & { type: "diff" }): string {
    const pathLabel = piece.path.trim();
    const oldRaw = piece.oldText;
    const newText = piece.newText ?? "";
    const oldText = oldRaw ?? "";
    const isNewFile = oldRaw === null || oldRaw === undefined;
    const oldLineCount = lineCountForToolSummary(oldText);
    const newLineCount = lineCountForToolSummary(newText);
    const summary = isNewFile
        ? `new file (${newLineCount} line(s))`
        : `${oldLineCount} line(s) before -> ${newLineCount} line(s) after`;
    const oldDisplay = oldText.replace(/\r\n/g, "\n").trimEnd();
    const newDisplay = newText.replace(/\r\n/g, "\n").trimEnd();
    const body = `${pathLabel}\n${summary}\n\n--- previous ---\n${oldDisplay}\n\n--- proposed ---\n${newDisplay}`;
    return clipToolDisplayText(body);
}

function formatDiffSummaryOnly(piece: acp.ToolCallContent & { type: "diff" }): string {
    const pathLabel = piece.path.trim();
    const oldRaw = piece.oldText;
    const newText = piece.newText ?? "";
    const oldText = oldRaw ?? "";
    const isNewFile = oldRaw === null || oldRaw === undefined;
    const oldLineCount = lineCountForToolSummary(oldText);
    const newLineCount = lineCountForToolSummary(newText);
    const summary = isNewFile
        ? `new file (${newLineCount} line(s))`
        : `${oldLineCount} line(s) before -> ${newLineCount} line(s) after`;
    return `${pathLabel}\n${summary}`;
}

function commandSubtitleFromBacktickTitle(title: string): string | undefined {
    const t = title.trim();
    if (t.length >= 2 && t.startsWith("`") && t.endsWith("`")) {
        const inner = t.slice(1, -1).trim();
        return inner.length > 0 ? inner : undefined;
    }
    return undefined;
}

/**
 * Resolves a one-line shell command for execute/terminal tools from structured input, output, or Cursor-style backtick titles.
 */
export function toolCallExecuteCommandSubtitle(call: {
    title?: string | null;
    kind?: string | null;
    rawInput?: unknown;
    rawOutput?: unknown;
}): string | undefined {
    const kindStr =
        call.kind !== undefined && call.kind !== null && String(call.kind).length > 0
            ? String(call.kind)
            : "";
    const isExecute = kindStr === "execute" || kindStr === "terminal";
    const fromInput = extractShellCommandLine(call.rawInput);
    if (fromInput !== undefined) {
        return fromInput;
    }
    if (isExecute) {
        const fromOutput = extractShellCommandLine(call.rawOutput);
        if (fromOutput !== undefined) {
            return fromOutput;
        }
        if (typeof call.title === "string") {
            const fromTitle = commandSubtitleFromBacktickTitle(call.title);
            if (fromTitle !== undefined) {
                return fromTitle;
            }
        }
    }
    return undefined;
}

/**
 * Webview messages for a pending `session/request_permission`: dialog plus optional tool row update
 * (diff preview, content, subtitle) from the permission `toolCall`.
 */
export function extensionMessagesForPermissionRequest(
    requestId: string,
    params: acp.RequestPermissionRequest,
): ExtensionToWebviewMessage[] {
    const toolCall = params.toolCall;
    const messages: ExtensionToWebviewMessage[] = [
        {
            type: "permissionRequest",
            requestId,
            toolTitle:
                toolCall.kind !== undefined &&
                toolCall.kind !== null &&
                String(toolCall.kind).toLowerCase() === "edit"
                    ? "Write File"
                    : (toolCall.title ?? "Tool"),
            options: params.options.map((o) => ({
                optionId: o.optionId,
                name: o.name,
            })),
        },
    ];
    const rawToolCallId = typeof toolCall.toolCallId === "string" ? toolCall.toolCallId.trim() : "";
    if (rawToolCallId.length === 0) {
        return messages;
    }
    const toolCallId = canonicalToolCallId(rawToolCallId);
    const parts = toolCallUpdateToDisplayParts(toolCall);
    const commandSubtitle = toolCallExecuteCommandSubtitle(toolCall);
    const pathOrSearchSubtitle = toolCallUpdateSubtitleHint(toolCall);
    const subtitle =
        commandSubtitle ??
        (pathOrSearchSubtitle !== undefined && pathOrSearchSubtitle.trim().length > 0
            ? pathOrSearchSubtitle.trim()
            : undefined);
    const kindFromUpdate =
        toolCall.kind !== undefined && toolCall.kind !== null && String(toolCall.kind).length > 0
            ? String(toolCall.kind)
            : undefined;
    const rawStatus = toolCall.status;
    const status: ToolCallStatus =
        rawStatus === "failed" ||
        rawStatus === "completed" ||
        rawStatus === "in_progress" ||
        rawStatus === "pending"
            ? rawStatus
            : "pending";
    const hasDiffRows = parts.diffRows !== undefined && parts.diffRows.length > 0;
    const hasContent = parts.contentText !== undefined && parts.contentText.trim().length > 0;
    if (hasDiffRows || hasContent || subtitle !== undefined || kindFromUpdate !== undefined) {
        messages.push({
            type: "updateToolCall",
            toolCallId,
            status,
            ...(kindFromUpdate !== undefined ? { kind: kindFromUpdate } : {}),
            ...(parts.contentText !== undefined ? { content: parts.contentText } : {}),
            ...(hasDiffRows ? { diffRows: parts.diffRows } : {}),
            ...(subtitle !== undefined ? { subtitle } : {}),
        });
    }
    return messages;
}

function extractShellCommandLine(raw: unknown): string | undefined {
    if (raw === undefined || raw === null) {
        return undefined;
    }
    if (typeof raw === "string") {
        const t = raw.trim();
        return t.length > 0 ? t : undefined;
    }
    if (typeof raw !== "object" || Array.isArray(raw)) {
        return undefined;
    }
    const record = raw as Record<string, unknown>;
    const directKeys = [
        "command",
        "cmd",
        "shellCommand",
        "shell_command",
        "bashCommand",
        "script",
        "line",
    ] as const;
    for (const key of directKeys) {
        const v = record[key];
        if (typeof v === "string" && v.trim().length > 0) {
            return v.trim();
        }
    }
    if (Array.isArray(record.argv) && record.argv.length > 0) {
        const parts = record.argv
            .filter((x): x is string => typeof x === "string")
            .map((s) => s.trim());
        if (parts.length > 0) {
            return parts.join(" ");
        }
    }
    if (typeof record.program === "string" && record.program.trim().length > 0) {
        const prog = record.program.trim();
        const args = Array.isArray(record.args)
            ? record.args.filter((x): x is string => typeof x === "string")
            : [];
        return args.length > 0 ? `${prog} ${args.join(" ")}` : prog;
    }
    return undefined;
}

function commandLineHintForToolUpdate(update: acp.ToolCallUpdate): string | undefined {
    const fromInput = extractShellCommandLine(update.rawInput);
    if (fromInput !== undefined) {
        return fromInput;
    }
    return extractShellCommandLine(update.rawOutput);
}

function formatToolCallContentPiece(
    piece: acp.ToolCallContent,
    update: acp.ToolCallUpdate,
): string | undefined {
    if (piece.type === "diff") {
        return formatDiffPieceAsFullText(piece);
    }
    if (piece.type === "terminal") {
        const id = piece.terminalId.trim();
        const cmd = commandLineHintForToolUpdate(update);
        const lines: string[] = [];
        if (cmd !== undefined && cmd.length > 0) {
            lines.push(`$ ${cmd}`);
        }
        if (id.length > 0) {
            lines.push(`Terminal: ${id}`);
        }
        const joined = lines.filter((l) => l.length > 0).join("\n");
        return joined.length > 0 ? joined : id.length > 0 ? `[Terminal ${id}]` : "[Terminal]";
    }
    if (piece.type === "content") {
        return formatContentBlockForTool(piece.content);
    }
    return undefined;
}

function formatRawToolOutput(raw: unknown): string | undefined {
    if (raw === undefined || raw === null) {
        return undefined;
    }
    if (typeof raw === "string") {
        const t = raw.trim();
        return t.length > 0 ? clipToolDisplayText(t) : undefined;
    }
    if (typeof raw === "object") {
        const record = raw as Record<string, unknown>;
        if (typeof record.content === "string") {
            const t = record.content.trim();
            return t.length > 0 ? clipToolDisplayText(t) : undefined;
        }
        if (typeof record.stdout === "string" || typeof record.stderr === "string") {
            let combined = "";
            if (typeof record.exitCode === "number") {
                combined += `exit ${record.exitCode}\n`;
            }
            if (typeof record.stdout === "string" && record.stdout.length > 0) {
                combined += record.stdout;
            }
            if (typeof record.stderr === "string" && record.stderr.length > 0) {
                if (combined.length > 0 && !combined.endsWith("\n")) {
                    combined += "\n";
                }
                combined += record.stderr;
            }
            const t = combined.trim();
            return t.length > 0 ? clipToolDisplayText(t) : undefined;
        }
        if (
            typeof record.totalMatches === "number" ||
            typeof record.totalFiles === "number" ||
            typeof record.resultCount === "number"
        ) {
            const parts: string[] = [];
            if (typeof record.totalMatches === "number") {
                parts.push(`${record.totalMatches} match(es)`);
            }
            if (typeof record.totalFiles === "number") {
                parts.push(`${record.totalFiles} file(s)`);
            }
            if (typeof record.resultCount === "number") {
                parts.push(`${record.resultCount} result(s)`);
            }
            if (typeof record.truncated === "boolean") {
                parts.push(record.truncated ? "truncated" : "complete");
            }
            return parts.join(", ");
        }
        try {
            return clipToolDisplayText(JSON.stringify(raw, null, 2));
        } catch {
            return undefined;
        }
    }
    if (typeof raw === "number" || typeof raw === "boolean" || typeof raw === "bigint") {
        return clipToolDisplayText(String(raw));
    }
    if (typeof raw === "symbol") {
        return clipToolDisplayText(raw.toString());
    }
    return undefined;
}

function toolCallUpdateToDisplayParts(update: acp.ToolCallUpdate): {
    contentText: string | undefined;
    diffRows: ToolCallDiffRow[] | undefined;
} {
    let diffRows: ToolCallDiffRow[] | undefined;
    const segments: string[] = [];
    let hadTerminalPiece = false;
    if (update.content !== undefined && update.content !== null && update.content.length > 0) {
        for (const piece of update.content) {
            if (piece.type === "diff") {
                if (diffRows === undefined) {
                    const oldText = piece.oldText ?? "";
                    const newText = piece.newText ?? "";
                    diffRows = computeToolCallDiffRows(oldText, newText);
                    segments.push(formatDiffSummaryOnly(piece));
                } else {
                    const segment = formatDiffPieceAsFullText(piece);
                    if (segment.trim().length > 0) {
                        segments.push(segment.trim());
                    }
                }
                continue;
            }
            if (piece.type === "terminal") {
                hadTerminalPiece = true;
            }
            const segment = formatToolCallContentPiece(piece, update);
            if (segment !== undefined && segment.trim().length > 0) {
                segments.push(segment.trim());
            }
        }
    }
    if (segments.length > 0) {
        let contentText = clipToolDisplayText(segments.join("\n\n"));
        if (hadTerminalPiece) {
            const rawFormatted = formatRawToolOutput(update.rawOutput);
            if (rawFormatted !== undefined && rawFormatted.trim().length > 0) {
                contentText = clipToolDisplayText(`${contentText}\n\n${rawFormatted.trim()}`);
            }
        }
        return {
            contentText,
            diffRows,
        };
    }
    if (diffRows !== undefined && diffRows.length > 0) {
        return { contentText: undefined, diffRows };
    }
    return {
        contentText: formatRawToolOutput(update.rawOutput),
        diffRows: undefined,
    };
}

function firstToolCallTextPreview(call: acp.ToolCall): string | undefined {
    if (!call.content || call.content.length === 0) {
        return undefined;
    }
    for (const block of call.content) {
        if (block.type === "content" && block.content.type === "text") {
            const t = block.content.text.trim();
            if (t.length > 0) {
                return t;
            }
        }
    }
    return undefined;
}

function formatToolRawInput(raw: unknown): string | undefined {
    if (raw === undefined || raw === null) {
        return undefined;
    }
    if (typeof raw === "string") {
        const t = raw.trim();
        return t.length > 0 ? t : undefined;
    }
    if (typeof raw === "object" && !Array.isArray(raw) && Object.keys(raw as object).length === 0) {
        return undefined;
    }
    try {
        const s = JSON.stringify(raw);
        return s !== undefined && s !== "{}" && s !== "[]" ? s : undefined;
    } catch {
        return undefined;
    }
}

/** Tracks tool kinds from `tool_call` so `tool_call_update` can classify sparse completions (for example read tools with only `rawOutput.content`). */
export type ToolCallKindTracking = {
    kindByToolId: Map<string, string | undefined>;
};

/** Creates a fresh map for one prompt turn (tool IDs are unique per session but clearing each turn avoids unbounded growth). */
export function createToolCallKindTracking(): ToolCallKindTracking {
    return { kindByToolId: new Map() };
}

/**
 * Derives a subtitle for the tool row when a `tool_call_update` adds paths the initial `tool_call` omitted (common with Cursor CLI: empty `rawInput` on pending).
 */
function searchSubtitleFromRawInput(
    raw: unknown,
    update: acp.ToolCallUpdate,
    pendingKind: string | undefined,
): string | undefined {
    const pattern = patternHintFromStructuredUnknown(raw) ?? patternHintFromPlainObject(raw);
    const pathHint = pathHintFromStructuredUnknown(raw);
    if (pattern !== undefined && pathHint !== undefined) {
        return `"${pattern}" in ${pathHint}`;
    }
    if (pattern !== undefined) {
        return `"${pattern}"`;
    }
    if (pathHint !== undefined) {
        return formatSubtitlePathForKind(pathHint, update, pendingKind);
    }
    return undefined;
}

function patternHintFromStructuredUnknown(raw: unknown): string | undefined {
    const direct = patternHintFromPlainObject(raw);
    if (direct !== undefined) {
        return direct;
    }
    if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
        const record = raw as Record<string, unknown>;
        const nested = record._meta;
        if (nested !== null && typeof nested === "object" && !Array.isArray(nested)) {
            return patternHintFromPlainObject(nested);
        }
    }
    return undefined;
}

export function toolCallUpdateSubtitleHint(
    update: acp.ToolCallUpdate,
    options?: { pendingKind?: string },
): string | undefined {
    const kind = effectiveToolKindForUpdate(update, options?.pendingKind);
    if (kind === "execute" || kind === "terminal") {
        const cmd =
            extractShellCommandLine(update.rawInput) ?? extractShellCommandLine(update.rawOutput);
        if (cmd !== undefined) {
            return cmd;
        }
    }
    if (update.locations && update.locations.length > 0) {
        const locPath = update.locations[0]!.path.trim();
        if (locPath.length > 0) {
            return locPath;
        }
    }
    if (update.content && update.content.length > 0) {
        for (const block of update.content) {
            if (block.type === "diff") {
                const pathLabel = block.path.trim();
                if (pathLabel.length > 0) {
                    return pathLabel;
                }
            }
        }
    }
    const fromRawInputSearch = searchSubtitleFromRawInput(
        update.rawInput,
        update,
        options?.pendingKind,
    );
    if (fromRawInputSearch !== undefined) {
        return fromRawInputSearch;
    }
    const fromRawOutputPath = pathHintFromStructuredUnknown(update.rawOutput);
    if (fromRawOutputPath !== undefined) {
        return formatSubtitlePathForKind(fromRawOutputPath, update, options?.pendingKind);
    }
    const fromRawOutputError = pathHintFromErrorField(update.rawOutput);
    if (fromRawOutputError !== undefined) {
        return formatSubtitlePathForKind(fromRawOutputError, update, options?.pendingKind);
    }
    const fromRawInputPath = pathHintFromStructuredUnknown(update.rawInput);
    if (fromRawInputPath !== undefined) {
        return formatSubtitlePathForKind(fromRawInputPath, update, options?.pendingKind);
    }
    const rawInputText = formatToolRawInput(update.rawInput);
    if (rawInputText !== undefined && rawInputText.trim().length > 0) {
        const fromJsonPath = pathHintFromJsonishRawInput(rawInputText);
        if (fromJsonPath !== undefined) {
            return formatSubtitlePathForKind(fromJsonPath, update, options?.pendingKind);
        }
    }
    if (kind === "search" || kind === "grep" || kind === "glob") {
        const stats = searchStatsSubtitleFromRawOutput(update.rawOutput);
        if (stats !== undefined) {
            return stats;
        }
    }
    return undefined;
}

function pathHintFromStructuredUnknown(raw: unknown): string | undefined {
    const direct = pathHintFromPlainObject(raw);
    if (direct !== undefined) {
        return direct;
    }
    if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
        const record = raw as Record<string, unknown>;
        const nested = record._meta;
        if (nested !== null && typeof nested === "object" && !Array.isArray(nested)) {
            return pathHintFromPlainObject(nested);
        }
    }
    return undefined;
}

function pathHintFromPlainObject(raw: unknown): string | undefined {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        return undefined;
    }
    const record = raw as Record<string, unknown>;
    for (const key of [
        "path",
        "filePath",
        "relativePath",
        "file",
        "target",
        "target_directory",
        "targetDirectory",
        "cwd",
        "root",
    ] as const) {
        const value = record[key];
        if (typeof value === "string") {
            const trimmed = value.trim();
            if (trimmed.length > 0) {
                return trimmed;
            }
        }
    }
    return undefined;
}

function patternHintFromPlainObject(raw: unknown): string | undefined {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        return undefined;
    }
    const record = raw as Record<string, unknown>;
    for (const key of [
        "pattern",
        "query",
        "search",
        "glob",
        "glob_pattern",
        "globPattern",
        "include",
    ] as const) {
        const value = record[key];
        if (typeof value === "string") {
            const trimmed = value.trim();
            if (trimmed.length > 0) {
                return trimmed;
            }
        }
    }
    return undefined;
}

function pathHintFromErrorText(text: string): string | undefined {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
        return undefined;
    }
    const pathDoesNotExist = trimmed.match(/^Path does not exist:\s*(.+)$/i)?.[1];
    if (pathDoesNotExist !== undefined && pathDoesNotExist.length > 0) {
        return pathDoesNotExist.trim();
    }
    return undefined;
}

function pathHintFromErrorField(raw: unknown): string | undefined {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        return undefined;
    }
    const record = raw as Record<string, unknown>;
    if (typeof record.error === "string") {
        return pathHintFromErrorText(record.error);
    }
    return undefined;
}

/** Compact count label for Cursor-style search completions (`totalMatches` / `totalFiles`). */
export function searchStatsSubtitleFromRawOutput(raw: unknown): string | undefined {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        return undefined;
    }
    const record = raw as Record<string, unknown>;
    if (typeof record.totalMatches === "number") {
        const count = record.totalMatches;
        return count === 1 ? "1 match" : `${count} matches`;
    }
    if (typeof record.totalFiles === "number") {
        const count = record.totalFiles;
        return count === 1 ? "1 file" : `${count} files`;
    }
    if (typeof record.resultCount === "number") {
        const count = record.resultCount;
        return count === 1 ? "1 result" : `${count} results`;
    }
    return undefined;
}

function pathHintFromJsonishRawInput(text: string): string | undefined {
    const trimmed = text.trim();
    if (!trimmed.startsWith("{")) {
        return undefined;
    }
    try {
        const parsed = JSON.parse(trimmed) as unknown;
        return pathHintFromPlainObject(parsed);
    } catch {
        return undefined;
    }
}

function effectiveToolKindForUpdate(
    update: acp.ToolCallUpdate,
    pendingKind: string | undefined,
): string | undefined {
    if (update.kind !== undefined && update.kind !== null && String(update.kind).length > 0) {
        return update.kind;
    }
    return pendingKind;
}

function formatSubtitlePathForKind(
    pathHint: string,
    update: acp.ToolCallUpdate,
    pendingKind: string | undefined,
): string | undefined {
    const kind = effectiveToolKindForUpdate(update, pendingKind);
    const status = update.status ?? "completed";
    if (kind === "read" && status === "completed") {
        return fileNameFromPath(pathHint);
    }
    return pathHint;
}

function fileNameFromPath(pathText: string): string {
    const trimmed = pathText.trim();
    const normalized = trimmed.replace(/\\/g, "/");
    const slash = normalized.lastIndexOf("/");
    if (slash >= 0 && slash < normalized.length - 1) {
        return normalized.slice(slash + 1);
    }
    return trimmed;
}

/**
 * Builds the dim subtitle line for a tool call (paths, arguments, or inline text from the agent).
 */
export function toolCallSubtitleFromToolCall(call: acp.ToolCall): string | undefined {
    const execLine = toolCallExecuteCommandSubtitle(call);
    if (execLine !== undefined) {
        return execLine;
    }
    const kindStr = call.kind !== undefined && call.kind !== null ? String(call.kind) : "";
    if (kindStr === "execute" || kindStr === "terminal") {
        if (call.locations && call.locations.length > 0) {
            const locPath = call.locations[0]!.path.trim();
            if (locPath.length > 0) {
                return locPath;
            }
        }
        return formatToolRawInput(call.rawInput);
    }
    const fromRawInputSearch = searchSubtitleFromRawInput(
        call.rawInput,
        call,
        kindStr.length > 0 ? kindStr : undefined,
    );
    if (fromRawInputSearch !== undefined) {
        return fromRawInputSearch;
    }
    const fromContent = firstToolCallTextPreview(call);
    if (fromContent !== undefined) {
        return fromContent;
    }
    if (call.locations && call.locations.length > 0) {
        const locPath = call.locations[0]!.path.trim();
        if (locPath.length > 0) {
            return locPath;
        }
    }
    const fromRawInputPath = pathHintFromStructuredUnknown(call.rawInput);
    if (fromRawInputPath !== undefined) {
        return formatSubtitlePathForKind(
            fromRawInputPath,
            call,
            kindStr.length > 0 ? kindStr : undefined,
        );
    }
    return formatToolRawInput(call.rawInput);
}

/**
 * Maps a single ACP session/update payload to zero or more webview protocol messages.
 */
export function sessionUpdateToWebviewMessages(
    update: acp.SessionUpdate,
    toolKindTracking?: ToolCallKindTracking,
): ExtensionToWebviewMessage[] {
    switch (update.sessionUpdate) {
        case "agent_thought_chunk": {
            const thoughtUpdate = update as unknown as {
                content?: { type?: string; text?: string };
                text?: string;
            };
            const textFromBlock =
                thoughtUpdate.content?.type === "text" ? thoughtUpdate.content.text : undefined;
            const text = textFromBlock ?? thoughtUpdate.text ?? "";
            if (text.length === 0) {
                return [];
            }
            const durationMs = durationMsFromUpdatePayload(update);
            return [
                {
                    type: "appendAgentThought",
                    text,
                    ...(durationMs !== undefined ? { durationMs } : {}),
                },
            ];
        }
        case "agent_message_chunk": {
            const block = update.content;
            if (block.type === "text") {
                return [{ type: "appendAgentText", text: block.text }];
            }
            return [];
        }
        case "user_message_chunk": {
            const block = update.content;
            if (block.type === "text") {
                return [{ type: "appendUserText", text: block.text }];
            }
            return [];
        }
        case "tool_call": {
            const toolCallId = canonicalToolCallId(update.toolCallId);
            toolKindTracking?.kindByToolId.set(toolCallId, update.kind);
            const subtitle = toolCallSubtitleFromToolCall(update);
            const durationMs = durationMsFromUpdatePayload(update);
            return [
                {
                    type: "appendToolCall",
                    toolCallId,
                    title: update.title,
                    kind: update.kind,
                    status: update.status ?? undefined,
                    ...(subtitle !== undefined ? { subtitle } : {}),
                    ...(durationMs !== undefined ? { durationMs } : {}),
                },
            ];
        }
        case "tool_call_update": {
            const toolCallId = canonicalToolCallId(update.toolCallId);
            const parts = toolCallUpdateToDisplayParts(update);
            const pendingKind = toolKindTracking?.kindByToolId.get(toolCallId);
            const subtitleHint = toolCallUpdateSubtitleHint(update, {
                pendingKind,
            });
            const kindFromUpdate =
                update.kind !== undefined && update.kind !== null && String(update.kind).length > 0
                    ? String(update.kind)
                    : undefined;
            if (kindFromUpdate !== undefined) {
                toolKindTracking?.kindByToolId.set(toolCallId, kindFromUpdate);
            }
            const durationMs = durationMsFromUpdatePayload(update);
            return [
                {
                    type: "updateToolCall",
                    toolCallId,
                    status: update.status ?? "completed",
                    ...(kindFromUpdate !== undefined ? { kind: kindFromUpdate } : {}),
                    ...(parts.contentText !== undefined ? { content: parts.contentText } : {}),
                    ...(parts.diffRows !== undefined && parts.diffRows.length > 0
                        ? { diffRows: parts.diffRows }
                        : {}),
                    ...(subtitleHint !== undefined ? { subtitle: subtitleHint } : {}),
                    ...(durationMs !== undefined ? { durationMs } : {}),
                },
            ];
        }
        case "available_commands_update": {
            const raw = update as unknown as { availableCommands?: unknown };
            const list = raw.availableCommands;
            if (!Array.isArray(list)) {
                return [];
            }
            const commands = list
                .map((entry) => {
                    if (entry === null || typeof entry !== "object") {
                        return null;
                    }
                    const o = entry as Record<string, unknown>;
                    const name = typeof o.name === "string" ? o.name.trim() : "";
                    const description =
                        typeof o.description === "string" ? o.description.trim() : "";
                    if (name.length === 0) {
                        return null;
                    }
                    let inputHint: string | undefined;
                    const input = o.input;
                    if (input !== null && typeof input === "object") {
                        const hint = (input as Record<string, unknown>).hint;
                        if (typeof hint === "string" && hint.trim().length > 0) {
                            inputHint = hint.trim();
                        }
                    }
                    const sourceCandidates = [o.source, o.scope, o.skillSource] as unknown[];
                    let source: string | undefined;
                    for (const candidate of sourceCandidates) {
                        if (typeof candidate === "string" && candidate.trim().length > 0) {
                            source = candidate.trim();
                            break;
                        }
                    }
                    return normalizeSlashCommand({
                        name,
                        description,
                        ...(inputHint !== undefined ? { inputHint } : {}),
                        ...(source !== undefined ? { source } : {}),
                    });
                })
                .filter((x): x is NonNullable<typeof x> => x !== null);
            return [{ type: "slashCommands", commands }];
        }
        case "plan":
            return [
                {
                    type: "appendPlan",
                    entries: update.entries.map((e) => ({
                        content: e.content,
                        status: e.status,
                        priority: e.priority,
                    })),
                },
            ];
        case "config_option_update": {
            const normalized = sessionConfigOptionsFromAgent(update.configOptions);
            if (normalized === null) {
                return [];
            }
            return [
                {
                    type: "sessionConfigOptions",
                    options: normalized.options,
                },
            ];
        }
        default:
            return [];
    }
}
