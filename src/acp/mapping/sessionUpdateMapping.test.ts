import { describe, expect, it } from "vite-plus/test";
import { canonicalToolCallId } from "./canonicalToolCallId";
import {
    createToolCallKindTracking,
    extensionMessagesForPermissionRequest,
    searchStatsSubtitleFromRawOutput,
    sessionUpdateToWebviewMessages,
    toolCallUpdateSubtitleHint,
} from "./sessionUpdateMapping";

describe("sessionUpdateToWebviewMessages", () => {
    it("maps user_message_chunk to appendUserText", () => {
        const messages = sessionUpdateToWebviewMessages({
            sessionUpdate: "user_message_chunk",
            content: { type: "text", text: "hello" },
        });
        expect(messages).toEqual([{ type: "appendUserText", text: "hello" }]);
    });

    it("maps agent_thought_chunk duration from _meta when top-level duration is absent", () => {
        const messages = sessionUpdateToWebviewMessages({
            sessionUpdate: "agent_thought_chunk",
            content: { type: "text", text: "hmm" },
            _meta: { duration_ms: 890 },
        } as never);
        expect(messages).toEqual([{ type: "appendAgentThought", text: "hmm", durationMs: 890 }]);
    });

    it("maps tool_call_update duration from _meta", () => {
        const messages = sessionUpdateToWebviewMessages({
            sessionUpdate: "tool_call_update",
            toolCallId: "tool_exec_1",
            status: "completed",
            _meta: { durationMs: 117 },
        } as never);
        expect(messages).toEqual([
            {
                type: "updateToolCall",
                toolCallId: "tool_exec_1",
                status: "completed",
                durationMs: 117,
            },
        ]);
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
            toolCallId: "tool_grep",
            status: "completed",
            kind: "search",
            rawInput: {
                pattern: "createChatStateFromInit",
                path: "webview/acp-ui/src/chatReducer.test.ts",
            },
        });
        expect(hint).toBe('"createChatStateFromInit" in webview/acp-ui/src/chatReducer.test.ts');
    });

    it("maps Cursor-style completed edit update to diffRows and path subtitle", () => {
        const multilineId =
            "call-c4d9d88d-ab6e-48ed-9ff3-5425c287173c-4\nfc_p5fq8ry-6jKPYy-8ee7667a-aws_ue1_0";
        const messages = sessionUpdateToWebviewMessages({
            sessionUpdate: "tool_call_update",
            toolCallId: multilineId,
            status: "completed",
            content: [
                {
                    type: "diff",
                    path: "/home/econn/git/irishbruse-utilities/docs/test.md",
                    oldText: "# Test\nold\n",
                    newText: "# Test\nnew\n",
                },
            ],
        });
        expect(messages).toHaveLength(1);
        const msg = messages[0];
        expect(msg?.type).toBe("updateToolCall");
        if (msg?.type !== "updateToolCall") {
            return;
        }
        expect(msg.toolCallId).toBe(canonicalToolCallId(multilineId));
        expect(msg.subtitle).toBe("/home/econn/git/irishbruse-utilities/docs/test.md");
        expect(msg.diffRows).toBeDefined();
        expect(msg.diffRows!.length).toBeGreaterThan(0);
        expect(msg.diffRows!.some((row) => row.kind === "removed" || row.kind === "added")).toBe(
            true,
        );
    });

    it("forwards permission toolCall diff content as updateToolCall", () => {
        const messages = extensionMessagesForPermissionRequest("perm-1", {
            sessionId: "sess-1",
            toolCall: {
                toolCallId: "call-edit-1\nfc_extra",
                kind: "edit",
                title: "Write File",
                status: "pending",
                content: [
                    {
                        type: "diff",
                        path: "docs/test.md",
                        oldText: "a\n",
                        newText: "b\n",
                    },
                ],
            },
            options: [{ optionId: "allow", name: "Allow", kind: "allow_once" }],
        });
        expect(messages[0]?.type).toBe("permissionRequest");
        const update = messages.find((m) => m.type === "updateToolCall");
        expect(update).toBeDefined();
        if (update?.type !== "updateToolCall") {
            return;
        }
        expect(update.toolCallId).toBe("call-edit-1");
        expect(update.kind).toBe("edit");
        expect(update.subtitle).toBe("docs/test.md");
        expect(update.diffRows).toBeDefined();
        expect(update.diffRows!.length).toBeGreaterThan(0);
    });
});

describe("canonicalToolCallId", () => {
    it("keeps the first line of a Cursor multi-line toolCallId", () => {
        expect(
            canonicalToolCallId(
                "call-c4d9d88d-ab6e-48ed-9ff3-5425c287173c-4\nfc_p5fq8ry-6jKPYy-8ee7667a-aws_ue1_0",
            ),
        ).toBe("call-c4d9d88d-ab6e-48ed-9ff3-5425c287173c-4");
    });
});
