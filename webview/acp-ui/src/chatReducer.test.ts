import { afterEach, describe, expect, it, vi } from "vite-plus/test";
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
  afterEach(() => {
    vi.useRealTimers();
  });

  it("measures thought duration client-side when the agent omits durationMs", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    let state = createInitialChatState();
    state = chatReducer(state, { type: "appendAgentThought", text: "Thinking…" });
    expect(state.thoughtStartedAtMs).toBe(Date.now());
    vi.advanceTimersByTime(450);
    state = chatReducer(state, { type: "appendAgentText", text: "Answer" });
    const thought = state.trace[0];
    expect(thought?.type).toBe("thought");
    if (thought?.type !== "thought") {
      return;
    }
    expect(thought.durationMs).toBe(450);
    expect(state.thoughtStartedAtMs).toBeNull();
  });

  it("keeps agent-provided thought duration over client timing", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    let state = createInitialChatState();
    state = chatReducer(state, { type: "appendAgentThought", text: "A", durationMs: 1200 });
    vi.advanceTimersByTime(5000);
    state = chatReducer(state, { type: "turnComplete", stopReason: "end" });
    const thought = state.trace[0];
    expect(thought?.type).toBe("thought");
    if (thought?.type !== "thought") {
      return;
    }
    expect(thought.durationMs).toBe(1200);
  });

  it("finalizes client thought duration when a new tool call opens", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    let state = createInitialChatState();
    state = chatReducer(state, { type: "appendAgentThought", text: "Plan tool" });
    vi.advanceTimersByTime(200);
    state = chatReducer(state, {
      type: "appendToolCall",
      toolCallId: "t1",
      title: "Run",
      kind: "execute",
      status: "pending",
      subtitle: undefined,
    });
    const thought = state.trace[0];
    expect(thought?.type).toBe("thought");
    if (thought?.type !== "thought") {
      return;
    }
    expect(thought.durationMs).toBe(200);
  });

  it("measures command duration client-side when the agent omits durationMs", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    let state = createInitialChatState();
    state = chatReducer(state, {
      type: "appendToolCall",
      toolCallId: "exec1",
      title: "Run",
      kind: "execute",
      status: "pending",
      subtitle: "ls -la tests",
    });
    expect(state.toolStartedAtMsById.get("exec1")).toBe(Date.now());
    vi.advanceTimersByTime(117);
    state = chatReducer(state, {
      type: "updateToolCall",
      toolCallId: "exec1",
      status: "completed",
      content: "total 0",
    });
    const tool = state.trace[0];
    expect(tool?.type).toBe("tool");
    if (tool?.type !== "tool") {
      return;
    }
    expect(tool.durationMs).toBe(117);
    expect(state.toolStartedAtMsById.has("exec1")).toBe(false);
  });

  it("keeps agent-provided command duration over client timing", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    let state = createInitialChatState();
    state = chatReducer(state, {
      type: "appendToolCall",
      toolCallId: "exec1",
      title: "Run",
      kind: "execute",
      status: "in_progress",
      subtitle: "pwd",
    });
    vi.advanceTimersByTime(5000);
    state = chatReducer(state, {
      type: "updateToolCall",
      toolCallId: "exec1",
      status: "completed",
      durationMs: 88,
    });
    const tool = state.trace[0];
    expect(tool?.type).toBe("tool");
    if (tool?.type !== "tool") {
      return;
    }
    expect(tool.durationMs).toBe(88);
  });

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

  it("does not alter spacing inside fenced code block streams", () => {
    expect(joinThoughtChunks("```ts\nconst x", "=1;\n```")).toBe("```ts\nconst x=1;\n```");
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
      diffRows: [{ kind: "added", text: "hello world" }],
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

  it("merges Cursor multi-line toolCallId update onto the pending edit row with diff preview", () => {
    let state = createInitialChatState();
    state = chatReducer(state, {
      type: "appendToolCall",
      toolCallId: "call-c4d9d88d-ab6e-48ed-9ff3-5425c287173c-4",
      title: "Write File",
      kind: "edit",
      status: "pending",
      subtitle: undefined,
    });
    state = chatReducer(state, {
      type: "updateToolCall",
      toolCallId:
        "call-c4d9d88d-ab6e-48ed-9ff3-5425c287173c-4\nfc_p5fq8ry-6jKPYy-8ee7667a-aws_ue1_0",
      status: "completed",
      subtitle: "/home/econn/git/irishbruse-utilities/docs/test.md",
      diffRows: [
        { kind: "removed", text: "old line" },
        { kind: "added", text: "new line" },
      ],
    });
    expect(state.trace).toHaveLength(1);
    const row = state.trace[0];
    expect(row?.type).toBe("tool");
    if (row?.type !== "tool") {
      return;
    }
    expect(row.toolCallId).toBe("call-c4d9d88d-ab6e-48ed-9ff3-5425c287173c-4");
    expect(row.status).toBe("completed");
    expect(row.detailVisible).toBe(true);
    expect(row.diffRows).toEqual([
      { kind: "removed", text: "old line" },
      { kind: "added", text: "new line" },
    ]);
    expect(row.subtitle).toContain("test.md");
  });

  it("restores detailVisible from cached diffRows when the flag was omitted", () => {
    const state = createChatStateFromInit({
      type: "init",
      sessionId: "s1",
      title: "Chat",
      visibleTrace: [
        {
          type: "tool",
          toolCallId: "write-cached",
          title: "Write File",
          kind: "edit",
          status: "completed",
          subtitle: "docs/test.md",
          diffRows: [{ kind: "added", text: "hello" }],
        },
      ],
    });
    expect(state.trace).toHaveLength(1);
    const row = state.trace[0];
    expect(row?.type).toBe("tool");
    if (row?.type !== "tool") {
      return;
    }
    expect(row.detailVisible).toBe(true);
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
            options: [{ value: "claude-opus-4-8", name: "Opus 4.8" }],
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
          options: [{ value: "claude-sonnet-4-6", name: "Sonnet 4.6" }],
        },
      ],
    });
    expect(restored.sessionConfigLoading).toBe(false);
    expect(restored.sessionConfigOptions?.[0]?.currentValue).toBe("claude-sonnet-4-6");
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
    expect(afterModelPick.sessionConfigOptions?.map((row) => row.name)).toEqual([
      "Model",
      "Context",
      "Reasoning",
    ]);
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

  it("seeds the visible trace cache and buffers replay until load finishes", () => {
    const cached = [
      { type: "user" as const, text: "hi" },
      { type: "agent" as const, text: "Hi – what do you want to work on?" },
    ];
    let state = createChatStateFromInit({
      type: "init",
      sessionId: "s1",
      title: "Chat",
      sessionHistoryLoading: true,
      visibleTrace: cached,
    });
    expect(state.trace).toEqual(cached);
    expect(state.viewportCacheActive).toBe(true);

    state = chatReducer(state, { type: "appendUserText", text: "older" });
    expect(state.trace).toEqual(cached);
    expect(state.replayTrace).toEqual([{ type: "user", text: "older" }]);

    state = chatReducer(state, {
      type: "permissionRequest",
      requestId: "p1",
      toolTitle: "Read",
      options: [{ optionId: "allow", name: "Allow" }],
    });
    expect(state.permissionPrompt?.requestId).toBe("p1");
    expect(state.trace).toEqual(cached);

    state = chatReducer(state, { type: "sessionHistoryLoading", loading: false });
    expect(state.sessionHistoryLoading).toBe(false);
    expect(state.viewportCacheActive).toBe(false);
    expect(state.trace).toEqual([{ type: "user", text: "older" }]);
    expect(state.historyCommit).toBe(1);
  });

  it("merges cached thought durations onto agent replay when load finishes", () => {
    const cached = [
      { type: "user" as const, text: "hi" },
      { type: "thought" as const, text: "Thinking about hi.", durationMs: 1500 },
      { type: "agent" as const, text: "Hello" },
    ];
    let state = createChatStateFromInit({
      type: "init",
      sessionId: "s1",
      title: "Chat",
      sessionHistoryLoading: true,
      visibleTrace: cached,
    });
    state = chatReducer(state, { type: "appendUserText", text: "hi" });
    state = chatReducer(state, { type: "appendAgentThought", text: "Thinking about hi." });
    state = chatReducer(state, { type: "appendAgentText", text: "Hello" });
    state = chatReducer(state, { type: "sessionHistoryLoading", loading: false });
    expect(state.trace).toEqual([
      { type: "user", text: "hi" },
      { type: "thought", text: "Thinking about hi.", durationMs: 1500 },
      { type: "agent", text: "Hello" },
    ]);
  });

  it("merges cached command durations onto agent replay when load finishes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const cached = [
      { type: "user" as const, text: "list tests" },
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
    let state = createChatStateFromInit({
      type: "init",
      sessionId: "s1",
      title: "Chat",
      sessionHistoryLoading: true,
      visibleTrace: cached,
    });
    state = chatReducer(state, { type: "appendUserText", text: "list tests" });
    state = chatReducer(state, {
      type: "appendToolCall",
      toolCallId: "exec1",
      title: "Terminal",
      kind: "execute",
      status: "pending",
      subtitle: "ls -la tests",
    });
    state = chatReducer(state, {
      type: "updateToolCall",
      toolCallId: "exec1",
      status: "completed",
    });
    state = chatReducer(state, { type: "sessionHistoryLoading", loading: false });
    const tool = state.trace[1];
    expect(tool?.type).toBe("tool");
    if (tool?.type !== "tool") {
      return;
    }
    expect(tool.durationMs).toBe(117);
  });

  it("ignores non-positive agent thought durations so client timing can run", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    let state = createInitialChatState();
    state = chatReducer(state, {
      type: "appendAgentThought",
      text: "Thinking…",
      durationMs: 0,
    });
    expect(state.thoughtStartedAtMs).toBe(Date.now());
    vi.advanceTimersByTime(400);
    state = chatReducer(state, { type: "appendAgentText", text: "Answer" });
    const thought = state.trace[0];
    expect(thought?.type).toBe("thought");
    if (thought?.type !== "thought") {
      return;
    }
    expect(thought.durationMs).toBe(400);
  });

  it("keeps the visible cache when load finishes with no replay", () => {
    let state = createChatStateFromInit({
      type: "init",
      sessionId: "s1",
      title: "Chat",
      sessionHistoryLoading: true,
      visibleTrace: [{ type: "user", text: "hi" }],
    });
    state = chatReducer(state, { type: "sessionHistoryLoading", loading: false });
    expect(state.trace).toEqual([{ type: "user", text: "hi" }]);
    expect(state.historyCommit).toBe(0);
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
    expect(state.sessionConfigOptions?.[0]?.currentValue).toBe("claude-opus-4-8");
  });
});
