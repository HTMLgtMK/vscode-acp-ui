import type * as acp from "@agentclientprotocol/sdk";
import { describe, expect, it } from "vitest";
import {
    createToolCallKindTracking,
    searchStatsSubtitleFromRawOutput,
    sessionUpdateToWebviewMessages,
    toolCallUpdateSubtitleHint,
} from "./sessionUpdateMapping";

/** 映射层只认 `sessionUpdate` 的字面量，测试要喂协议里还没有的名字就得绕一层断言。 */
function rawUpdate(update: Record<string, unknown>): acp.SessionUpdate {
    return update as unknown as acp.SessionUpdate;
}

describe("sessionUpdateToWebviewMessages", () => {
    it("maps user_message_chunk to appendUserText", () => {
        const messages = sessionUpdateToWebviewMessages({
            sessionUpdate: "user_message_chunk",
            content: { type: "text", text: "hello" },
        });
        expect(messages).toEqual([{ type: "appendUserText", text: "hello" }]);
    });

    it("consumes session_info_update as host metadata without a transcript message", () => {
        const messages = sessionUpdateToWebviewMessages(
            rawUpdate({
                sessionUpdate: "session_info_update",
                title: "Generated title",
                updatedAt: "2026-11-06T12:00:00Z",
            }),
        );
        expect(messages).toEqual([]);
    });
    it("derives grep match counts from Cursor-style rawOutput", () => {
        expect(
            searchStatsSubtitleFromRawOutput({
                totalMatches: 2,
                truncated: false,
            }),
        ).toBe("2 matches");
        expect(
            searchStatsSubtitleFromRawOutput({
                totalFiles: 209,
                truncated: false,
            }),
        ).toBe("209 files");
    });

    it("maps sparse Cursor grep completion to subtitle with match count", () => {
        const tracking = createToolCallKindTracking();
        sessionUpdateToWebviewMessages(
            {
                sessionUpdate: "tool_call",
                toolCallId: "tool_a471658c",
                title: "grep",
                kind: "search",
                status: "pending",
                rawInput: {},
            },
            tracking,
        );
        const messages = sessionUpdateToWebviewMessages(
            {
                sessionUpdate: "tool_call_update",
                toolCallId: "tool_a471658c",
                status: "completed",
                rawOutput: { totalMatches: 2, truncated: false },
            },
            tracking,
        );
        expect(messages).toEqual([
            {
                type: "updateToolCall",
                toolCallId: "tool_a471658c",
                status: "completed",
                content: "2 match(es), complete",
                subtitle: "2 matches",
            },
        ]);
    });

    it("extracts path from Cursor-style search error rawOutput", () => {
        const hint = toolCallUpdateSubtitleHint({
            sessionUpdate: "tool_call_update",
            toolCallId: "tool_4298cf79",
            status: "completed",
            kind: "search",
            rawOutput: {
                error: "Path does not exist: /home/econn/.cursor/projects/home-econn-git-vscode-acp-ui-docs/agent-transcripts",
            },
        });
        expect(hint).toBe(
            "/home/econn/.cursor/projects/home-econn-git-vscode-acp-ui-docs/agent-transcripts",
        );
    });

    it("derives pattern and path subtitles from structured rawInput", () => {
        const hint = toolCallUpdateSubtitleHint({
            sessionUpdate: "tool_call_update",
            toolCallId: "tool_grep",
            status: "completed",
            kind: "search",
            rawInput: {
                pattern: "createChatStateFromInit",
                path: "webview/acp-ui/src/chatReducer.test.ts",
            },
        });
        expect(hint).toBe(
            '"createChatStateFromInit" in webview/acp-ui/src/chatReducer.test.ts',
        );
    });

    // FR-011：认不出来的 `session/update` 不能静默丢掉，得带原文往下走。
    it("turns an unrecognised sessionUpdate into one unknown message with raw text", () => {
        const messages = sessionUpdateToWebviewMessages(
            rawUpdate({
                sessionUpdate: "usage_update",
                used: 1234,
                size: 8000,
            }),
        );
        expect(messages).toHaveLength(1);
        const message = messages[0];
        expect(message?.type).toBe("appendUnknownSessionUpdate");
        if (message?.type !== "appendUnknownSessionUpdate") {
            return;
        }
        expect(message.sessionUpdate).toBe("usage_update");
        expect(JSON.parse(message.rawJson)).toEqual({
            sessionUpdate: "usage_update",
            used: 1234,
            size: 8000,
        });
    });

    it("still surfaces a payload whose own type tag is missing or unreadable", () => {
        const messages = sessionUpdateToWebviewMessages(rawUpdate({ used: 1 }));
        const message = messages[0];
        expect(message?.type).toBe("appendUnknownSessionUpdate");
        if (message?.type !== "appendUnknownSessionUpdate") {
            return;
        }
        expect(message.sessionUpdate.length).toBeGreaterThan(0);
    });

    it("does not throw on an unrecognised update JSON cannot serialise", () => {
        const messages = sessionUpdateToWebviewMessages(
            rawUpdate({ sessionUpdate: "quantum_update", amount: BigInt(7) }),
        );
        expect(messages[0]?.type).toBe("appendUnknownSessionUpdate");
    });
});
