import { describe, expect, it } from "vite-plus/test";
import {
    ACP_UI_VISIBLE_TRACE_SCHEMA,
    parseVisibleTraceDocument,
    parseVisibleTraceJsonl,
    serializeVisibleTraceJsonl,
} from "../protocol/visibleTrace";
import {
    ACP_UI_SESSION_SCHEMA,
    enqueueSessionFileWrite,
    isFlatSessionFilePath,
    normalizeUserMessageHistory,
    parseSessionDocument,
    parseSessionFile,
    parseSessionHeaderBlock,
    parseSessionHeaderLine,
    serializeSessionDocument,
    sessionFileBaseNameFromTitle,
    shouldDeferJsonlHistoryReplay,
    uniqueSessionFileBaseNameFromTitle,
    visibleTraceFileNameForSessionFile,
} from "./acpUiSessionJsonlFormat";

describe("enqueueSessionFileWrite", () => {
    it("runs operations for the same file in order", async () => {
        const key = "/tmp/test-session.acp";
        const order: number[] = [];
        let releaseFirst: (() => void) | undefined;
        const firstGate = new Promise<void>((resolve) => {
            releaseFirst = resolve;
        });
        const first = enqueueSessionFileWrite(key, async () => {
            order.push(1);
            await firstGate;
            order.push(2);
        });
        const second = enqueueSessionFileWrite(key, async () => {
            order.push(3);
        });
        await new Promise<void>((resolve) => {
            queueMicrotask(() => resolve());
        });
        expect(order).toEqual([1]);
        releaseFirst?.();
        await Promise.all([first, second]);
        expect(order).toEqual([1, 2, 3]);
    });
});

describe("sessionFileBaseNameFromTitle", () => {
    it("sanitizes invalid characters and appends .acp", () => {
        expect(sessionFileBaseNameFromTitle("Fix auth flow")).toBe("Fix auth flow.acp");
        expect(sessionFileBaseNameFromTitle('bad<>:"/\\|?*name')).toBe("badname.acp");
    });

    it("falls back when the title is empty after sanitization", () => {
        expect(sessionFileBaseNameFromTitle("   ")).toBe("Chat.acp");
    });
});

describe("uniqueSessionFileBaseNameFromTitle", () => {
    it("adds a numeric suffix when the base name is taken", () => {
        const used = new Set(["Chat 1.acp"]);
        expect(uniqueSessionFileBaseNameFromTitle("Chat 1", used)).toBe("Chat 1 (2).acp");
    });

    it("keeps the current file name when excluding it", () => {
        const used = new Set(["Chat 1.acp", "Chat 2.acp"]);
        expect(uniqueSessionFileBaseNameFromTitle("Chat 1", used, "Chat 1.acp")).toBe("Chat 1.acp");
    });
});

describe("normalizeUserMessageHistory", () => {
    it("keeps non-empty strings and caps at 55 entries", () => {
        const entries = Array.from({ length: 60 }, (_, i) => `msg-${i}`);
        expect(normalizeUserMessageHistory(entries)).toHaveLength(55);
        expect(normalizeUserMessageHistory(["", "hello", 1, null])).toEqual(["hello"]);
    });

    it("extracts submit bodies from legacy replay events", () => {
        expect(
            normalizeUserMessageHistory([
                { type: "submit", body: "hello" },
                { type: "appendAgentText", text: "ignored" },
            ]),
        ).toEqual(["hello"]);
    });
});

describe("serializeSessionDocument", () => {
    it("round-trips a session document with user message history", () => {
        const document = {
            schema: ACP_UI_SESSION_SCHEMA,
            id: "id-1",
            title: "Chat",
            createdAt: 1,
            updatedAt: 2,
            history: ["hello", "world"],
        };
        const text = serializeSessionDocument(document);
        expect(parseSessionDocument(text)).toEqual(document);
        expect(parseSessionFile(text).header).toEqual(document);
    });
});

describe("parseSessionHeaderBlock", () => {
    it("spans all lines of a session document", () => {
        const document = {
            schema: ACP_UI_SESSION_SCHEMA,
            id: "id-1",
            title: "Chat",
            createdAt: 1,
            updatedAt: 2,
            history: ["hi"],
        };
        const text = serializeSessionDocument(document).trimEnd();
        const parsed = parseSessionHeaderBlock(text);
        expect(parsed?.header).toEqual(document);
        expect(parsed?.consumedLines).toBe(text.split("\n").length);
    });
});

describe("parseSessionHeaderLine", () => {
    it("parses a valid legacy single-line header with promptHistory", () => {
        const header = {
            schema: ACP_UI_SESSION_SCHEMA,
            id: "abc",
            title: "Chat 1",
            agentName: "Cursor",
            runtimeSessionId: "runtime-1",
            promptHistory: ["hello"],
            createdAt: 100,
            updatedAt: 200,
        };
        const parsed = parseSessionHeaderLine(JSON.stringify(header));
        expect(parsed).toEqual({
            schema: ACP_UI_SESSION_SCHEMA,
            id: "abc",
            title: "Chat 1",
            agentName: "Cursor",
            runtimeSessionId: "runtime-1",
            createdAt: 100,
            updatedAt: 200,
            history: ["hello"],
        });
    });

    it("returns null for malformed header", () => {
        expect(parseSessionHeaderLine("{}")).toBeNull();
        expect(parseSessionHeaderLine("")).toBeNull();
        expect(parseSessionHeaderLine("not json")).toBeNull();
    });
});

describe("isFlatSessionFilePath", () => {
    it("detects legacy flat files directly under the chats root", () => {
        expect(isFlatSessionFilePath("/data/chats/My Chat.acp", "/data/chats")).toBe(true);
        expect(isFlatSessionFilePath("/data/chats/session-id/My Chat.acp", "/data/chats")).toBe(
            false,
        );
    });
});

describe("visibleTraceFileNameForSessionFile", () => {
    it("uses the session file stem with a jsonl suffix", () => {
        expect(visibleTraceFileNameForSessionFile("Fix auth flow.acp")).toBe("Fix auth flow.jsonl");
        expect(visibleTraceFileNameForSessionFile("Chat.acp")).toBe("Chat.jsonl");
    });
});

describe("visible trace jsonl", () => {
    it("round-trips trace items and drops invalid lines", () => {
        const items = [
            { type: "user" as const, text: "hi" },
            {
                type: "thought" as const,
                text: "The user sent a simple greeting.",
                durationMs: 1200,
            },
            { type: "agent" as const, text: "Hi – what do you want to work on?" },
        ];
        const text = `${serializeVisibleTraceJsonl(items)}not json\n`;
        expect(parseVisibleTraceJsonl(text)).toEqual(items);
    });

    it("writes a meta header that references the session document", () => {
        const items = [
            { type: "user" as const, text: "hi" },
            { type: "thought" as const, text: "Planning.", durationMs: 800 },
        ];
        const text = serializeVisibleTraceJsonl(items, {
            sessionId: "57b8da34-3117-4d12-b86d-08c1dc85bc34",
            sessionFile: "List Folder.acp",
        });
        const document = parseVisibleTraceDocument(text);
        expect(document.meta).toEqual({
            type: "meta",
            schema: ACP_UI_VISIBLE_TRACE_SCHEMA,
            sessionId: "57b8da34-3117-4d12-b86d-08c1dc85bc34",
            sessionFile: "List Folder.acp",
        });
        expect(document.items).toEqual(items);
    });

    it("drops non-positive thought durations", () => {
        const text = [
            JSON.stringify({ type: "thought", text: "A", durationMs: 0 }),
            JSON.stringify({ type: "thought", text: "B", durationMs: -3 }),
            JSON.stringify({ type: "thought", text: "C", durationMs: 40 }),
        ].join("\n");
        expect(parseVisibleTraceJsonl(text)).toEqual([
            { type: "thought", text: "A" },
            { type: "thought", text: "B" },
            { type: "thought", text: "C", durationMs: 40 },
        ]);
    });

    it("round-trips tool command durations and drops non-positive values", () => {
        const items = [
            {
                type: "tool" as const,
                toolCallId: "exec1",
                title: "Terminal",
                kind: "execute",
                status: "completed" as const,
                subtitle: "ls -la tests",
                durationMs: 117,
            },
        ];
        expect(parseVisibleTraceJsonl(serializeVisibleTraceJsonl(items))).toEqual(items);
        const text = JSON.stringify({
            type: "tool",
            toolCallId: "exec2",
            title: "Terminal",
            kind: "execute",
            status: "completed",
            durationMs: 0,
        });
        expect(parseVisibleTraceJsonl(text)).toEqual([
            {
                type: "tool",
                toolCallId: "exec2",
                title: "Terminal",
                kind: "execute",
                status: "completed",
            },
        ]);
    });

    it("keeps the last 40 items", () => {
        const items = Array.from({ length: 45 }, (_, index) => ({
            type: "user" as const,
            text: `m-${index}`,
        }));
        const parsed = parseVisibleTraceJsonl(serializeVisibleTraceJsonl(items));
        expect(parsed).toHaveLength(40);
        expect(parsed[0]).toEqual({ type: "user", text: "m-5" });
        expect(parsed[39]).toEqual({ type: "user", text: "m-44" });
    });
});

describe("shouldDeferJsonlHistoryReplay", () => {
    it("defers when a runtime session id is stored", () => {
        expect(shouldDeferJsonlHistoryReplay({ runtimeSessionId: "runtime-1" })).toBe(true);
        expect(
            shouldDeferJsonlHistoryReplay({
                runtimeSessionId: "  runtime-1  ",
            }),
        ).toBe(true);
    });

    it("does not defer without a runtime session id", () => {
        expect(shouldDeferJsonlHistoryReplay({})).toBe(false);
        expect(shouldDeferJsonlHistoryReplay({ runtimeSessionId: "" })).toBe(false);
        expect(shouldDeferJsonlHistoryReplay({ runtimeSessionId: "   " })).toBe(false);
    });
});
