import type { AcpUiSessionConfigOption } from "../acp/session/sessionConfigOptions";
import type { AcpUiSessionModelSelection } from "../acp/session/sessionModels";
import type {
    ControlPanelDownMessage,
    ControlPanelUpMessage,
} from "./controlPanelMessages";
import {
    isControlPanelUpMessageType,
    tryParseControlPanelUpMessage,
} from "./controlPanelMessages";

/** Replayable session log events (user submit + post-init extension messages). */
export type AcpUiHistoryReplayEvent =
    | { type: "submit"; body: string }
    | Exclude<
          ExtensionToWebviewMessage,
          | { type: "init" }
          | { type: "historyReplay" }
          // 控制面板快照是"当前状态"不是"发生过什么"，不进聊天回放流。
          | { type: "controlPanel" }
      >;

/** Plan entry forwarded from an ACP agent plan update. */
export type PlanEntry = {
    content: string;
    status: string;
    priority?: string;
};

export type TodoEntry = {
    id: string;
    content: string;
    status: "pending" | "in_progress" | "completed" | "cancelled";
};

/** Tool call status forwarded from ACP. */
export type ToolCallStatus = "pending" | "in_progress" | "completed" | "failed";

/** How tool calls render in the chat trace. */
export type ToolCallVerbosity = "minimal" | "compact" | "verbose";

/** Line-level diff for tool output (git-style presentation in a webview). */
export type ToolCallDiffRow = {
    kind: "removed" | "added" | "context";
    text: string;
};

/** Slash commands advertised by the agent via `available_commands_update`. */
export type AcpUiSlashCommand = {
    name: string;
    description: string;
    inputHint?: string;
    /** Origin label from the agent (for example user, global, workspace). */
    source?: string;
};

/** How a compact tool path link should open in the workbench. */
export type WorkspacePathOpenTarget = "file" | "auto";

/**
 * Messages sent from a webview (or other UI host) to the extension host.
 */
export type WebviewToExtensionMessage =
    | {
          type: "ready";
          /** Standalone dev: composer seed id (`cursor-model`, `opus-model`, ...). */
          demoSeed?: string;
          /** Standalone dev: chat replay id (`markdown`, `tools`, ...). */
          demoFixture?: string;
          /** Standalone dev: replay the fixture on load (default true when `demoFixture` is set). */
          demoReplay?: boolean;
      }
    | { type: "send"; body: string }
    | { type: "cancel" }
    | { type: "renameSession"; title: string }
    /** Dispose the current agent session and start a fresh one (same editor / WS connection). */
    | { type: "resetSession" }
    | { type: "setSessionModel"; modelId: string }
    | {
          type: "setSessionConfigOption";
          configId: string;
          value: string | boolean;
      }
    | {
          type: "permissionResponse";
          requestId: string;
          selectedOptionId: string;
      }
    | { type: "permissionResponse"; requestId: string; cancelled: true }
    /** Persists composer Arrow Up / Down user message history for this session. */
    | { type: "saveHistory"; entries: string[] }
    /** Open a new chat with the default agent (extension host handles creation). */
    | { type: "openNewChat" }
    /** Open a workspace path from a compact tool link (`auto` reveals folders, opens files). */
    | {
          type: "openWorkspacePath";
          path: string;
          target?: WorkspacePathOpenTarget;
      }
    /** 自绘控制面板的回传动作，见 `controlPanelMessages.ts`。 */
    | ControlPanelUpMessage;

/**
 * 任务详情面板 header 的几栏（T028）。宿主只给字段，渲的位置与样式全在面板侧：
 * 这块在 trace 组件外面、由 `AcpUiApp` 画。聊天面板不发这条，整块就不存在。
 */
export interface TaskHeaderInfo {
    /** 面板上显示的任务标题（宿主取 prompt 的第一行）。 */
    title: string;
    taskId: string;
    kind?: string;
    worker?: string;
    branch?: string;
    /** daemon 的 task status（working / awaiting_review / done …），只当文本用。 */
    status?: string;
}

/**
 * Messages sent from the extension host to a webview (or other UI host).
 */
export type ExtensionToWebviewMessage =
    | {
          type: "init";
          sessionId: string;
          title: string;
          workspaceLabel?: string;
          /** Absolute user home directory for compact path labels (`~` substitution). */
          homeDir?: string;
          /** Relative workspace file paths used by `@` autocomplete in the composer. */
          workspaceFiles?: string[];
          agentVersionLabel?: string;
          acpAgentName?: string;
          /** 宿主给出的 agent 显示名列表（standalone 取配置里那几条），缺省第一条为当前。 */
          availableAcpAgents?: string[];
          /** Optional `--vscode-*` overrides applied on `document.documentElement`. */
          vscodeThemeVariables?: Record<string, string>;
          sessionModels?: AcpUiSessionModelSelection;
          history?: string[];
          /**
           * When true，模型/配置选择器过了首条消息也仍可改（agent 在建会话时就定死了）。
           * 缺省 false：发出首条消息后选择器锁住。
           */
          lockSessionAgent?: boolean;
          /**
           * 观察用的面板（任务详情）：同一套 trace 组件，但输入区只读。
           * textarea 打不进、Send 走不通，输入区里写明 reply / resume 尚未开放。
           */
          composerReadOnly?: boolean;
          /** Cached config options applied on mount before the agent connects. */
          sessionConfigOptionsSeed?: AcpUiSessionConfigOption[];
          /** Hides composer model/config controls (standalone demo and screenshots). */
          hideComposerModelControls?: boolean;
          /** True while ACP `session/load` replays conversation history. */
          sessionHistoryLoading?: boolean;
          /** Tool call display mode (`minimal`, `compact`, or `verbose`). */
          toolCallVerbosity?: ToolCallVerbosity;
          /** Fraction of panel width for transcript and composer (1 = full width). */
          contentWidthRatio?: number;
      }
    | {
          type: "toolCallVerbosity";
          verbosity: ToolCallVerbosity;
      }
    | {
          type: "contentWidthRatio";
          ratio: number;
      }
    | {
          /** Markdown heading and inline-code colors derived from the active theme. */
          type: "vscodeThemeVariables";
          variables: Record<string, string>;
      }
    | {
          type: "sessionModels";
          currentModelId: string;
          availableModels: AcpUiSessionModelSelection["availableModels"];
      }
    | {
          type: "sessionConfigOptions";
          options: AcpUiSessionConfigOption[];
      }
    | {
          /** Clears composer model/config picks while the agent session reconnects. */
          type: "sessionConfigOptionsLoading";
      }
    | {
          /** Shown while ACP `session/load` replays conversation history. */
          type: "sessionHistoryLoading";
          loading: boolean;
      }
    | { type: "appendAgentThought"; text: string; durationMs?: number }
    | { type: "appendAgentText"; text: string }
    | { type: "appendUserText"; text: string }
    | {
          type: "appendToolCall";
          toolCallId: string;
          title: string;
          kind?: string;
          status?: ToolCallStatus;
          subtitle?: string;
      }
    | {
          type: "updateToolCall";
          toolCallId: string;
          status: ToolCallStatus;
          content?: string;
          subtitle?: string;
          diffRows?: ToolCallDiffRow[];
          /** From ACP `tool_call_update` when the agent omits an initial `tool_call` (e.g. Gemini CLI). */
          kind?: string;
      }
    | {
          type: "permissionRequest";
          requestId: string;
          toolTitle: string;
          options: { optionId: string; name: string }[];
      }
    | {
          /**
           * 这条请求已经作废（宿主 150s 兜底到点、换任务、面板没连上就被判拒）：
           * 审批卡收掉，不再等用户 —— 裁决已在 daemon 侧发生，这里只是把界面同步干净。
           */
          type: "permissionDismiss";
          requestId: string;
      }
    | {
          type: "cursorUpdateTodos";
          toolCallId: string;
          todos: TodoEntry[];
          merge: boolean;
      }
    | {
          type: "cursorTask";
          toolCallId: string;
          description: string;
          prompt: string;
          subagentType: string;
          model?: string;
          agentId?: string;
          durationMs?: number;
      }
    | {
          type: "cursorGenerateImage";
          toolCallId: string;
          description: string;
          filePath?: string;
          referenceImagePaths?: string[];
      }
    | { type: "slashCommands"; commands: AcpUiSlashCommand[] }
    | { type: "appendPlan"; entries: PlanEntry[] }
    /**
     * 映射层认不出的 `session/update`（`usage_update`、以后新增的类型…）。
     * 以前这些直接 `return []` 丢掉，现在带原文到界面上折叠展示（FR-011）。
     */
    | {
          type: "appendUnknownSessionUpdate";
          sessionUpdate: string;
          rawJson: string;
      }
    | { type: "commandFeedback"; message: string }
    | { type: "turnComplete"; stopReason: string }
    /**
     * 这条任务的 trace 流走完了（宿主那条 `--attach` 正常 resolve）。跟 `turnComplete` 不是一回事：
     * 那个是"这一轮问答完了"，这个是"整个任务观察到底了"，只在任务详情那种只读面板发。
     * trace 尾部补一行 `── worker trace completed ──`。
     */
    | { type: "taskTraceCompleted" }
    | { type: "error"; message: string }
    /** Clears the transcript and tool state; sent before the host reconnects the agent session. */
    | { type: "sessionReset" }
    /**
     * 任务详情 header 的内容（换任务时跟 `sessionReset` 一起再推一次）。
     * `null` 表示收掉整块 —— 聊天面板走的就是"不发这条"，默认就没有 header。
     */
    | { type: "taskHeader"; header: TaskHeaderInfo | null }
    /**
     * 换皮肤：写 `<html data-skin>`，并照 `styleUris` 增删皮肤包那几条 `<link>`，
     * 当场重绘、不用重开面板。
     * 两条都得给：只换属性不换 `<link>`，「装好皮肤包 → 改设置项」这一发就会
     * 停在旧的那份样式表上（`:root` 写的皮肤包还会继续盖住内置档）。
     * `skin` 不给等于抹掉属性，回到 `:root` 那套跟随宿主的 token。
     */
    | { type: "setSkin"; skin?: string; styleUris?: string[] }
    /** Replays persisted session log lines after `init` (custom editor restore). */
    | { type: "historyReplay"; events: AcpUiHistoryReplayEvent[] }
    /** 控制面板的完整快照（幂等全量推送），见 `controlPanelMessages.ts`。 */
    | ControlPanelDownMessage;

/**
 * True when `raw` is a non-null object (`typeof null === "object"` is excluded).
 */
export function isPotentiallyExtensionPostMessageData(
    raw: unknown,
): raw is Record<string, unknown> {
    return raw !== null && typeof raw === "object";
}

/**
 * Parses an untrusted `postMessage` payload from a webview.
 */
export function tryParseWebviewMessage(
    raw: unknown,
): WebviewToExtensionMessage | null {
    if (raw === null || typeof raw !== "object") {
        return null;
    }
    const record = raw as Record<string, unknown>;
    const messageType = record.type;
    if (messageType === "ready") {
        const ready: Extract<WebviewToExtensionMessage, { type: "ready" }> = {
            type: "ready",
        };
        if (typeof record.demoSeed === "string" && record.demoSeed.length > 0) {
            ready.demoSeed = record.demoSeed;
        }
        if (
            typeof record.demoFixture === "string" &&
            record.demoFixture.length > 0
        ) {
            ready.demoFixture = record.demoFixture;
        }
        if (typeof record.demoReplay === "boolean") {
            ready.demoReplay = record.demoReplay;
        }
        return ready;
    }
    if (messageType === "send" && typeof record.body === "string") {
        return { type: "send", body: record.body };
    }
    if (messageType === "cancel") {
        return { type: "cancel" };
    }
    if (messageType === "renameSession" && typeof record.title === "string") {
        return { type: "renameSession", title: record.title };
    }
    if (messageType === "resetSession") {
        return { type: "resetSession" };
    }
    if (
        messageType === "setSessionModel" &&
        typeof record.modelId === "string" &&
        record.modelId.length > 0
    ) {
        return { type: "setSessionModel", modelId: record.modelId };
    }
    if (
        messageType === "setSessionConfigOption" &&
        typeof record.configId === "string" &&
        record.configId.length > 0 &&
        (typeof record.value === "string" || typeof record.value === "boolean")
    ) {
        return {
            type: "setSessionConfigOption",
            configId: record.configId,
            value: record.value,
        };
    }
    if (
        messageType === "permissionResponse" &&
        typeof record.requestId === "string" &&
        record.requestId.length > 0
    ) {
        if (record.cancelled === true) {
            return {
                type: "permissionResponse",
                requestId: record.requestId,
                cancelled: true,
            };
        }
        if (
            typeof record.selectedOptionId === "string" &&
            record.selectedOptionId.length > 0
        ) {
            return {
                type: "permissionResponse",
                requestId: record.requestId,
                selectedOptionId: record.selectedOptionId,
            };
        }
    }
    if (messageType === "saveHistory" && Array.isArray(record.entries)) {
        const entries: string[] = [];
        for (const item of record.entries) {
            if (typeof item !== "string") {
                continue;
            }
            entries.push(item);
            if (entries.length >= 55) {
                break;
            }
        }
        return { type: "saveHistory", entries };
    }
    if (messageType === "openNewChat") {
        return { type: "openNewChat" };
    }
    if (
        messageType === "openWorkspacePath" &&
        typeof record.path === "string" &&
        record.path.trim().length > 0
    ) {
        const target =
            record.target === "auto" || record.target === "file"
                ? record.target
                : undefined;
        return {
            type: "openWorkspacePath",
            path: record.path.trim(),
            ...(target !== undefined && target !== "file" ? { target } : {}),
        };
    }
    if (isControlPanelUpMessageType(messageType)) {
        return tryParseControlPanelUpMessage(record);
    }
    return null;
}
