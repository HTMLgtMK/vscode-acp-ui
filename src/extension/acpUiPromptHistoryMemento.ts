import type { ExtensionContext } from "vscode";

const promptHistoryMementoKey = "ibAcpUi.promptHistoryBySession";

const maxStoredPromptsPerSession = 50;

type PromptHistoryMap = Record<string, string[]>;

function normalizeEntries(entries: string[]): string[] {
    const out: string[] = [];
    for (const line of entries) {
        if (typeof line !== "string") {
            continue;
        }
        const t = line;
        if (t.length > 0) {
            out.push(t);
        }
        if (out.length >= maxStoredPromptsPerSession) {
            break;
        }
    }
    return out;
}

function readMap(context: ExtensionContext): PromptHistoryMap {
    const raw = context.workspaceState.get<PromptHistoryMap | undefined>(promptHistoryMementoKey);
    if (raw === undefined || raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        return {};
    }
    return raw;
}

/**
 * Returns persisted composer prompt history lines for an ACP UI session (Arrow Up / Down).
 */
export function getAcpUiPromptHistoryEntries(
    context: ExtensionContext,
    sessionId: string,
): string[] {
    if (sessionId.length === 0) {
        return [];
    }
    const map = readMap(context);
    const list = map[sessionId];
    if (!Array.isArray(list)) {
        return [];
    }
    return normalizeEntries(list);
}

/**
 * Persists composer prompt history for a session (most recent tail capped per session).
 */
export function setAcpUiPromptHistoryEntries(
    context: ExtensionContext,
    sessionId: string,
    entries: string[],
): void {
    if (sessionId.length === 0) {
        return;
    }
    const map = { ...readMap(context) };
    const next = normalizeEntries(entries);
    if (next.length === 0) {
        delete map[sessionId];
    } else {
        map[sessionId] = next;
    }
    void context.workspaceState.update(promptHistoryMementoKey, map);
}

/**
 * Removes stored prompt history when a chat session is deleted.
 */
export function removeAcpUiPromptHistoryEntries(
    context: ExtensionContext,
    sessionId: string,
): void {
    if (sessionId.length === 0) {
        return;
    }
    const map = { ...readMap(context) };
    if (map[sessionId] === undefined) {
        return;
    }
    delete map[sessionId];
    void context.workspaceState.update(promptHistoryMementoKey, map);
}
