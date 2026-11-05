import { describe, expect, it } from "vitest";
import {
    chatReducer,
    createChatStateFromInit,
    createInitialChatState,
    joinThoughtChunks,
    replayChatState,
} from "./chatReducer";
import {
    writeCachedModelParamOptions,
    writeCachedSessionConfigOptions,
} from "../../../src/acp/session/sessionConfigOptionsCache";

describe("chatReducer", () => {
    it("merges appendAgentThought chunks into one thought row", () => {
        let state = createInitialChatState();
        state = chatReducer(state, {
            type: "appendAgentThought",
            text: "Considering test execution\n",
            durationMs: 700,
        });
        state = chatReducer(state, {
            type: "appendAgentThought",
            text: "Need to validate before continuing.",
        });
        expect(state.trace).toHaveLength(1);
        const row = state.trace[0];
        expect(row?.type).toBe("thought");
        if (row?.type !== "thought") {
            return;
        }
        expect(row.durationMs).toBe(700);
        expect(row.text).toContain("Considering test execution");
        expect(row.text).toContain("Need to validate");
    });

    it("adds one space between adjacent thought words", () => {
        expect(joinThoughtChunks("hello", "world")).toBe("hello world");
        expect(joinThoughtChunks("hello ", "world")).toBe("hello world");
        expect(joinThoughtChunks("hello", ", world")).toBe("hello, world");
    });

    it("does not insert spaces between CJK thought chunks", () => {
        expect(joinThoughtChunks("又被拒了", "一次")).toBe("又被拒了一次");
        expect(joinThoughtChunks("用户可能不想", "让第二条命令跑")).toBe(
            "用户可能不想让第二条命令跑",
        );
        expect(joinThoughtChunks("已经确认", "1.")).toBe("已经确认1.");
    });

    it("does not alter spacing inside fenced code block streams", () => {
        expect(joinThoughtChunks("```ts\nconst x", "=1;\n```")).toBe(
            "```ts\nconst x=1;\n```",
        );
    });

    it("merges appendToolCall into an existing tool row from an earlier updateToolCall", () => {
        let state = createInitialChatState();
        state = chatReducer(state, {
            type: "updateToolCall",
            toolCallId: "early",
            status: "pending",
            subtitle: "npm test",
            content: undefined,
            diffRows: undefined,
        });
        expect(state.trace).toHaveLength(1);
        const before = state.trace[0];
        expect(before?.type).toBe("tool");
        if (before?.type !== "tool") {
            return;
        }
        expect(before.title).toBe("Tool");
        expect(before.kind).toBeUndefined();
        state = chatReducer(state, {
            type: "appendToolCall",
            toolCallId: "early",
            title: "Run command",
            kind: "execute",
            status: "in_progress",
            subtitle: undefined,
        });
        expect(state.trace).toHaveLength(1);
        const after = state.trace[0];
        expect(after?.type).toBe("tool");
        if (after?.type !== "tool") {
            return;
        }
        expect(after.title).toBe("Run command");
        expect(after.kind).toBe("execute");
        expect(after.subtitle).toBe("npm test");
    });

    it("labels edit tools as Write File when only updateToolCall arrives (Gemini-style)", () => {
        let state = createInitialChatState();
        state = chatReducer(state, {
            type: "updateToolCall",
            toolCallId: "write-1",
            status: "completed",
            kind: "edit",
            subtitle: "/home/econn/git/irishbruse-acp/test.txt",
            diffRows: [
                { kind: "added", text: "hello world" },
            ],
        });
        expect(state.trace).toHaveLength(1);
        const row = state.trace[0];
        expect(row?.type).toBe("tool");
        if (row?.type !== "tool") {
            return;
        }
        expect(row.title).toBe("Write File");
        expect(row.kind).toBe("edit");
        expect(row.subtitle).toContain("test.txt");
    });

    it("replays submit and agent text from persisted events", () => {
        const init = {
            type: "init" as const,
            sessionId: "s1",
            title: "Chat",
        };
        const state = replayChatState(init, [
            { type: "submit", body: "hello" },
            { type: "appendAgentText", text: "hi there" },
            { type: "turnComplete", stopReason: "end" },
        ]);
        expect(state.trace).toEqual([
            { type: "user", text: "hello" },
            { type: "agent", text: "hi there" },
        ]);
        expect(state.promptInFlight).toBe(false);
    });

    it("任务 trace 走完：置结束标记，并关掉在飞的这一段", () => {
        let state = chatReducer(createInitialChatState(), {
            type: "appendAgentText",
            text: "最后一段",
        });
        expect(state.traceCompleted).toBe(false);
        state = chatReducer(state, { type: "taskTraceCompleted" });
        expect(state.traceCompleted).toBe(true);
        expect(state.openStreamIndex).toBeNull();
        expect(state.promptInFlight).toBe(false);
    });

    it("换任务时结束标记跟着清掉", () => {
        let state = chatReducer(
            chatReducer(createInitialChatState(), { type: "taskTraceCompleted" }),
            { type: "appendAgentText", text: "新任务的第一段" },
        );
        state = chatReducer(state, { type: "sessionReset" });
        expect(state.traceCompleted).toBe(false);
        expect(state.trace).toEqual([]);
    });

    it("clears model config on loading and restores on sessionConfigOptions", () => {
        const withOptions = chatReducer(
            {
                ...createInitialChatState(),
                sessionConfigOptions: [
                    {
                        configId: "model",
                        name: "Model",
                        category: "model",
                        type: "select",
                        currentValue: "claude-opus-4-8",
                        options: [
                            { value: "claude-opus-4-8", name: "Opus 4.8" },
                        ],
                    },
                ],
                sessionConfigLoading: false,
            },
            { type: "sessionConfigOptionsLoading" },
        );
        expect(withOptions.sessionConfigOptions).toBeNull();
        expect(withOptions.sessionConfigLoading).toBe(true);

        const restored = chatReducer(withOptions, {
            type: "sessionConfigOptions",
            options: [
                {
                    configId: "model",
                    name: "Model",
                    category: "model",
                    type: "select",
                    currentValue: "claude-sonnet-4-6",
                    options: [
                        { value: "claude-sonnet-4-6", name: "Sonnet 4.6" },
                    ],
                },
            ],
        });
        expect(restored.sessionConfigLoading).toBe(false);
        expect(restored.sessionConfigOptions?.[0]?.currentValue).toBe(
            "claude-sonnet-4-6",
        );
    });

    it("restores cached param options immediately after a model pick", () => {
        writeCachedModelParamOptions("cursor", "GPT 5.4", [
            {
                configId: "_derived:context",
                name: "Context",
                type: "select",
                currentValue: "272k",
                options: [{ value: "272k", name: "272K" }],
            },
            {
                configId: "_derived:reasoning",
                name: "Reasoning",
                type: "select",
                currentValue: "medium",
                options: [{ value: "medium", name: "Medium" }],
            },
        ]);
        const base = {
            ...createInitialChatState(),
            sessionConfigLoading: false,
            acpAgentSelection: {
                currentName: "cursor",
            },
            sessionConfigOptions: [
                {
                    configId: "model",
                    name: "Model",
                    category: "model",
                    type: "select" as const,
                    currentValue: "claude-opus-4-8",
                    options: [
                        { value: "claude-opus-4-8", name: "Opus 4.8" },
                        { value: "gpt-5.4", name: "GPT 5.4" },
                    ],
                },
                {
                    configId: "_derived:effort",
                    name: "Effort",
                    type: "select" as const,
                    currentValue: "high",
                    options: [{ value: "high", name: "High" }],
                },
            ],
        };
        const afterModelPick = chatReducer(base, {
            type: "pickSessionConfigOption",
            configId: "model",
            value: "gpt-5.4",
        });
        expect(afterModelPick.sessionConfigOptions?.map((row) => row.name)).toEqual(
            ["Model", "Context", "Reasoning"],
        );
    });

    it("tracks sessionHistoryLoading during ACP resume", () => {
        const loading = chatReducer(createInitialChatState(), {
            type: "sessionHistoryLoading",
            loading: true,
        });
        expect(loading.sessionHistoryLoading).toBe(true);

        const done = chatReducer(loading, {
            type: "sessionHistoryLoading",
            loading: false,
        });
        expect(done.sessionHistoryLoading).toBe(false);
    });

    it("clears transcript and unlocks composer picks on sessionReset", () => {
        let state = createInitialChatState();
        state = {
            ...state,
            trace: [{ type: "user", text: "hello" }],
            composerPicksLocked: true,
            promptInFlight: true,
            sessionConfigOptions: [
                {
                    configId: "model",
                    name: "Model",
                    category: "model",
                    type: "select",
                    currentValue: "a",
                    options: [{ value: "a", name: "A" }],
                },
            ],
        };
        const reset = chatReducer(state, { type: "sessionReset" });
        expect(reset.trace).toEqual([]);
        expect(reset.composerPicksLocked).toBe(false);
        expect(reset.promptInFlight).toBe(false);
        expect(reset.sessionConfigOptions).toBeNull();
        expect(reset.sessionConfigLoading).toBe(true);
    });

    it("seeds sessionHistoryLoading from init when resuming a runtime session", () => {
        const state = createChatStateFromInit({
            type: "init",
            sessionId: "s1",
            title: "Chat",
            sessionHistoryLoading: true,
        });
        expect(state.sessionHistoryLoading).toBe(true);
        expect(state.trace).toEqual([]);
    });

    it("seeds composer state from init cache without loading", () => {
        writeCachedSessionConfigOptions("cursor", [
            {
                configId: "model",
                name: "Model",
                category: "model",
                type: "select",
                currentValue: "claude-opus-4-8",
                options: [{ value: "claude-opus-4-8", name: "Opus 4.8" }],
            },
        ]);
        const state = createChatStateFromInit({
            type: "init",
            sessionId: "s1",
            title: "Chat",
            acpAgentName: "cursor",
            availableAcpAgents: ["cursor"],
            sessionConfigOptionsSeed: [
                {
                    configId: "model",
                    name: "Model",
                    category: "model",
                    type: "select",
                    currentValue: "claude-opus-4-8",
                    options: [{ value: "claude-opus-4-8", name: "Opus 4.8" }],
                },
            ],
        });
        expect(state.sessionConfigLoading).toBe(false);
        expect(state.sessionConfigOptions?.[0]?.currentValue).toBe(
            "claude-opus-4-8",
        );
    });

    // FR-011：未知更新是一条看得见的条目，不是一次静默丢弃。
    it("appends an unknown session/update as its own trace row", () => {
        let state = createInitialChatState();
        state = chatReducer(state, { type: "appendAgentText", text: "正在收尾" });
        state = chatReducer(state, {
            type: "appendUnknownSessionUpdate",
            sessionUpdate: "current_mode_update",
            rawJson: '{"sessionUpdate":"current_mode_update","modeId":"plan"}',
        });
        const row = state.trace[state.trace.length - 1];
        expect(row?.type).toBe("unknown");
        if (row?.type !== "unknown") {
            return;
        }
        expect(row.sessionUpdate).toBe("current_mode_update");
        expect(row.rawJson).toContain('"modeId":"plan"');
        // 未知条目不是一条流：它把正在流的上一条关掉，自己不当 openStreamIndex。
        expect(state.openStreamIndex).toBeNull();
    });

    // FR-009 / T026：只读标志从 init 走到 state，缺省必须是可写（Agent Chat 靠这个）。
    it("seeds composerReadOnly from init, defaulting to writable", () => {
        expect(
            createChatStateFromInit({
                type: "init",
                sessionId: "s1",
                title: "Chat",
            }).composerReadOnly,
        ).toBe(false);
        expect(
            createChatStateFromInit({
                type: "init",
                sessionId: "s1",
                title: "Chat",
                composerReadOnly: true,
            }).composerReadOnly,
        ).toBe(true);
    });

    // 只读的门槛在状态层也要有一道：宿主之外谁 dispatched 一条 submit 都进不了 trace。
    it("refuses submit while the composer is read-only", () => {
        const readOnly = createChatStateFromInit({
            type: "init",
            sessionId: "s1",
            title: "Chat",
            composerReadOnly: true,
        });
        const after = chatReducer(readOnly, { type: "submit", body: "还能发出去？" });
        expect(after).toBe(readOnly);
        expect(after.trace).toEqual([]);
        expect(after.promptInFlight).toBe(false);
    });

    it("keeps submitting while the composer is writable", () => {
        const writable = createChatStateFromInit({
            type: "init",
            sessionId: "s1",
            title: "Chat",
        });
        const after = chatReducer(writable, { type: "submit", body: "照常发送" });
        expect(after.trace).toEqual([{ type: "user", text: "照常发送" }]);
        expect(after.promptInFlight).toBe(true);
    });

    // 只读是这块面板的性质，不是一次会话的状态：重置轨迹不能把它顺手解掉。
    it("keeps composerReadOnly across sessionReset", () => {
        const state = chatReducer(
            createChatStateFromInit({
                type: "init",
                sessionId: "s1",
                title: "Task Detail",
                composerReadOnly: true,
            }),
            { type: "appendAgentText", text: "一条轨迹" },
        );
        expect(chatReducer(state, { type: "sessionReset" }).composerReadOnly).toBe(
            true,
        );
    });

    // 只读挡的是「此刻按发送」，不是历史里那些发过的话——否则任务详情会缺 user 行。
    it("replays persisted user rows into a read-only composer", () => {
        const state = replayChatState(
            { type: "init", sessionId: "s1", title: "Task Detail", composerReadOnly: true },
            [
                { type: "submit", body: "派发这条任务" },
                { type: "appendAgentText", text: "开始执行" },
                { type: "turnComplete", stopReason: "end" },
            ],
        );
        expect(state.trace).toEqual([
            { type: "user", text: "派发这条任务" },
            { type: "agent", text: "开始执行" },
        ]);
        expect(state.composerReadOnly).toBe(true);
        expect(
            chatReducer(state, { type: "submit", body: "再发一条" }).trace,
        ).toHaveLength(2);
    });

    // T028：聊天面板不发这条下行，header 就得一直是 null（整块不渲）。
    it("leaves taskHeader unset until the host sends it", () => {
        const state = chatReducer(
            createChatStateFromInit({ type: "init", sessionId: "s1", title: "Chat" }),
            { type: "appendAgentText", text: "一条轨迹" },
        );
        expect(state.taskHeader).toBeNull();
    });

    it("stores the task header the host sends", () => {
        const header = {
            title: "为 dispatcher 增加超时重试",
            taskId: "task-4f2a",
            kind: "code",
            worker: "claude",
            status: "working",
        };
        expect(chatReducer(createInitialChatState(), { type: "taskHeader", header }).taskHeader).toEqual(
            header,
        );
    });

    // 换任务时前端实例留着：先保住旧 header，宿主紧接着发新任务那份覆盖掉，不留空窗。
    it("keeps taskHeader across sessionReset and takes a null to drop it", () => {
        const header = { title: "标题", taskId: "task-1", status: "queued" };
        const withHeader = chatReducer(createInitialChatState(), {
            type: "taskHeader",
            header,
        });
        expect(chatReducer(withHeader, { type: "sessionReset" }).taskHeader).toEqual(header);
        expect(
            chatReducer(withHeader, { type: "taskHeader", header: null }).taskHeader,
        ).toBeNull();
    });

    // init 那一步建出来的 state 不带 header：宿主只能在 init 之后发，先发等于没发。
    it("starts without a taskHeader when init builds the state", () => {
        expect(
            createChatStateFromInit({ type: "init", sessionId: "s2", title: "Chat" })
                .taskHeader,
        ).toBeNull();
    });
});

/** T031：权限请求由单值改队列。造一条 daemon 形状的下行请求。 */
function permissionRequest(requestId: string) {
    return {
        type: "permissionRequest" as const,
        requestId,
        toolTitle: `rm -rf ${requestId}`,
        options: [
            { optionId: "allow_once", name: "允许一次" },
            { optionId: "reject_once", name: "拒绝" },
        ],
    };
}

// daemon 对同一任务的请求是串行的：后来的排队，不顶掉用户正在看的那张卡（稿 03 B②③）。
describe("chatReducer 权限审批队列", () => {
    it("第一条上屏、第二条只排队", () => {
        let state = chatReducer(createInitialChatState(), permissionRequest("perm-1"));
        expect(state.permissionQueue).toHaveLength(1);
        expect(state.permissionQueue[0]).toMatchObject({ requestId: "perm-1", index: 1 });
        expect(state.permissionTotal).toBe(1);

        state = chatReducer(state, permissionRequest("perm-2"));
        expect(state.permissionQueue[0]?.requestId).toBe("perm-1");
        expect(state.permissionQueue).toHaveLength(2);
        // 稿 03 B②：第一条卡的角标 1 / 2 pending。
        expect(state.permissionTotal).toBe(2);
    });

    it("裁决第一条后第二条顶上，位次不回退", () => {
        let state = chatReducer(createInitialChatState(), permissionRequest("perm-1"));
        state = chatReducer(state, permissionRequest("perm-2"));
        state = chatReducer(state, { type: "resolvePermission", requestId: "perm-1" });
        expect(state.permissionQueue.map((item) => item.requestId)).toEqual(["perm-2"]);
        // 稿 03 B③：第二条是 2 / 2 pending，不是 1 / 1 —— 分母是本轮到达总数。
        expect(state.permissionQueue[0]).toMatchObject({ index: 2 });
        expect(state.permissionTotal).toBe(2);
    });

    it("整批裁决完才归零，下一轮从 1 重新数", () => {
        let state = chatReducer(createInitialChatState(), permissionRequest("perm-1"));
        state = chatReducer(state, permissionRequest("perm-2"));
        state = chatReducer(state, { type: "resolvePermission", requestId: "perm-1" });
        state = chatReducer(state, { type: "resolvePermission", requestId: "perm-2" });
        expect(state.permissionQueue).toEqual([]);
        expect(state.permissionTotal).toBe(0);

        state = chatReducer(state, permissionRequest("perm-3"));
        expect(state.permissionQueue[0]).toMatchObject({ index: 1 });
        expect(state.permissionTotal).toBe(1);
    });

    it("同一 requestId 重发不重复上屏", () => {
        const state = chatReducer(createInitialChatState(), permissionRequest("perm-1"));
        const next = chatReducer(state, permissionRequest("perm-1"));
        expect(next).toBe(state);
        expect(next.permissionQueue).toHaveLength(1);
        expect(next.permissionTotal).toBe(1);
    });

    it("宿主报失效：队首被摘就轮到下一条，摘不到就原样返回", () => {
        let state = chatReducer(createInitialChatState(), permissionRequest("perm-1"));
        state = chatReducer(state, permissionRequest("perm-2"));
        state = chatReducer(state, { type: "permissionDismiss", requestId: "perm-1" });
        // 失效那条已在 daemon 侧判拒、卡收掉；下一条顶上，位次仍是 2。
        expect(state.permissionQueue[0]).toMatchObject({ requestId: "perm-2", index: 2 });

        const before = state;
        state = chatReducer(state, { type: "permissionDismiss", requestId: "perm-9" });
        expect(state).toBe(before);
    });

    it("失效的是唯一一条时，审批卡整块消失", () => {
        let state = chatReducer(createInitialChatState(), permissionRequest("perm-1"));
        state = chatReducer(state, { type: "permissionDismiss", requestId: "perm-1" });
        expect(state.permissionQueue).toEqual([]);
        expect(state.permissionTotal).toBe(0);
    });

    it("换任务（sessionReset）清空队列与计数", () => {
        let state = chatReducer(createInitialChatState(), permissionRequest("perm-1"));
        state = chatReducer(state, permissionRequest("perm-2"));
        state = chatReducer(state, { type: "sessionReset" });
        expect(state.permissionQueue).toEqual([]);
        expect(state.permissionTotal).toBe(0);
    });
});

describe("chatReducer provider 模型目录", () => {
    const catalog = {
        currentProviderId: "zhipu",
        currentModel: "glm-4.7",
        currentEffort: "high",
        providers: [
            { id: "zhipu", name: "zhipu", type: "openai", models: ["glm-4.7", "glm-4.6"] },
        ],
    };

    it("providerCatalog 快照落 state（幂等覆盖）", () => {
        let state = createInitialChatState();
        state = chatReducer(state, { type: "providerCatalog", ...catalog });
        expect(state.providerCatalog).toEqual(catalog);
        state = chatReducer(state, {
            type: "providerCatalog",
            ...catalog,
            currentModel: "glm-4.6",
        });
        expect(state.providerCatalog?.currentModel).toBe("glm-4.6");
    });

    it("pickModelSelection 就地更新快照的当前选择", () => {
        let state = createInitialChatState();
        state = chatReducer(state, { type: "providerCatalog", ...catalog });
        state = chatReducer(state, {
            type: "pickModelSelection",
            provider: "zhipu",
            model: "glm-4.6",
        });
        expect(state.providerCatalog?.currentProviderId).toBe("zhipu");
        expect(state.providerCatalog?.currentModel).toBe("glm-4.6");
    });

    it("无快照 / 锁选择期间 pickModelSelection 不动", () => {
        const untouched = createInitialChatState();
        expect(
            chatReducer(untouched, {
                type: "pickModelSelection",
                provider: "zhipu",
                model: "glm-4.6",
            }),
        ).toBe(untouched);
        let state = createInitialChatState();
        state = chatReducer(state, { type: "providerCatalog", ...catalog });
        state = chatReducer(state, { type: "submit", body: "hi" });
        expect(state.composerPicksLocked).toBe(true);
        expect(
            chatReducer(state, {
                type: "pickModelSelection",
                provider: "deepseek",
                model: "deepseek-v3",
            }).providerCatalog?.currentProviderId,
        ).toBe("zhipu");
    });

    it("sessionReset 不清 providerCatalog（daemon 全局面）", () => {
        let state = createInitialChatState();
        state = chatReducer(state, { type: "providerCatalog", ...catalog });
        state = chatReducer(state, { type: "sessionReset" });
        expect(state.providerCatalog).toEqual(catalog);
    });
});
