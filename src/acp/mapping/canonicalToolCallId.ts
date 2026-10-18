/**
 * Cursor sometimes embeds a second line (`fc_…`) in `toolCallId`.
 * Use the first non-empty line so pending `tool_call` and later updates share one key.
 */
export function canonicalToolCallId(toolCallId: string): string {
    const firstLine = toolCallId.split(/\r?\n/, 1)[0]?.trim() ?? "";
    return firstLine.length > 0 ? firstLine : toolCallId;
}

/**
 * Resolves a tool row index when the map key may be a short or multi-line Cursor id.
 * Returns undefined if no unique match exists.
 */
export function resolveToolIndexByCallId(
    toolIndexById: ReadonlyMap<string, number>,
    toolCallId: string,
): number | undefined {
    const exact = toolIndexById.get(toolCallId);
    if (exact !== undefined) {
        return exact;
    }
    const canonical = canonicalToolCallId(toolCallId);
    const byCanonical = toolIndexById.get(canonical);
    if (byCanonical !== undefined) {
        return byCanonical;
    }
    let found: number | undefined;
    for (const [id, idx] of toolIndexById) {
        if (canonicalToolCallId(id) !== canonical) {
            continue;
        }
        if (found !== undefined && found !== idx) {
            return undefined;
        }
        found = idx;
    }
    return found;
}
