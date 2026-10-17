import type { ToolCallDiffRow } from "../../protocol/extensionHostMessages";

/**
 * Builds a line-oriented diff for UI (removed / added / context) from two text blobs.
 */

const maxDiffRows = 4000;

function splitLinesNormalized(text: string): string[] {
    const normalized = text.replace(/\r\n/g, "\n");
    if (normalized.length === 0) {
        return [];
    }
    const parts = normalized.split("\n");
    if (parts.length > 1 && parts[parts.length - 1] === "") {
        parts.pop();
    }
    return parts;
}

/**
 * Computes a Myers-style line diff (LCS backtrack) for git-style red/green presentation.
 */
export function computeToolCallDiffRows(oldText: string, newText: string): ToolCallDiffRow[] {
    const oldLines = splitLinesNormalized(oldText);
    const newLines = splitLinesNormalized(newText);
    const m = oldLines.length;
    const n = newLines.length;
    if (m === 0 && n === 0) {
        return [];
    }
    const lcs: number[][] = Array.from({ length: m + 1 }, () =>
        Array.from({ length: n + 1 }, () => 0),
    );
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (oldLines[i - 1] === newLines[j - 1]) {
                lcs[i]![j] = lcs[i - 1]![j - 1]! + 1;
            } else {
                lcs[i]![j] = Math.max(lcs[i - 1]![j]!, lcs[i]![j - 1]!);
            }
        }
    }
    const rows: ToolCallDiffRow[] = [];
    let i = m;
    let j = n;
    while (i > 0 || j > 0) {
        if (rows.length >= maxDiffRows) {
            rows.unshift({
                kind: "context",
                text: "… (diff truncated for display)",
            });
            break;
        }
        if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
            rows.unshift({ kind: "context", text: oldLines[i - 1]! });
            i -= 1;
            j -= 1;
        } else if (j > 0 && (i === 0 || lcs[i]![j - 1]! >= lcs[i - 1]![j]!)) {
            rows.unshift({ kind: "added", text: newLines[j - 1]! });
            j -= 1;
        } else if (i > 0) {
            rows.unshift({ kind: "removed", text: oldLines[i - 1]! });
            i -= 1;
        }
    }
    return rows;
}
