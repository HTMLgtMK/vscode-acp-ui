import type { ControlPanelSnapshot } from "./snapshot";

/** 浏览器端回放数据，逐行对应对面那三份稿子：
    design/screens/02-control-panel.html 的 ①（默认）④（断连）⑤（首启空态）。
    action id 里 goworker.refreshChats / refreshTasks / reconnect 是已注册命令，
    rename / duplicate / delete / collapseAll / workerConfig / showDaemonLog 还没有，
    由 T016 / T018 在宿主侧补注册。 */
const RENAME = { id: "goworker.renameChat", glyph: "✎", tooltip: "改名" };
const DUPLICATE = { id: "goworker.duplicateChat", glyph: "⧉", tooltip: "复制" };
const DELETE = { id: "goworker.deleteChat", glyph: "⌫", tooltip: "删除" };

const READY: ControlPanelSnapshot = {
    brand: { name: "GOWORKER", version: "v0.1.0" },
    treeActions: {
        chat: [
            { id: "goworker.collapseChats", glyph: "⌄", tooltip: "全部折叠" },
            { id: "goworker.refreshChats", glyph: "⟳", tooltip: "刷新会话" },
        ],
        worker: [{ id: "goworker.workerConfig", glyph: "⚙", tooltip: "worker 配置" }],
        task: [{ id: "goworker.refreshTasks", glyph: "⟳", tooltip: "刷新任务" }],
    },
    chats: [
        {
            id: "chat:retry-policy",
            label: "dispatcher 超时重试策略",
            state: "done",
            meta: "now · last",
            actions: [RENAME, DUPLICATE, DELETE],
        },
        {
            id: "chat:archived",
            label: "archived",
            group: true,
            collapsed: true,
            children: [
                {
                    id: "chat:contracts-doc",
                    label: "socket 协议契约文档拆分",
                    meta: "2h ago",
                    actions: [RENAME, DUPLICATE, DELETE],
                },
                {
                    id: "chat:relative-link",
                    label: "acp-ui 本地链接改相对路径",
                    meta: "1d ago",
                    actions: [RENAME, DUPLICATE, DELETE],
                },
            ],
        },
    ],
    workers: [
        {
            id: "worker:claude",
            label: "claude",
            state: "running",
            meta: "2 task · working",
            children: [
                {
                    id: "task:dispatcher-retry",
                    label: "为 dispatcher 增加超时重试",
                    state: "running",
                    meta: "12:04",
                },
                {
                    id: "task:skin-review",
                    label: "webview 皮肤契约评审",
                    state: "review",
                    meta: "11:47",
                },
            ],
        },
        { id: "worker:codex", label: "codex", state: "done", meta: "0 task · idle" },
    ],
    tasks: [
        {
            id: "task-group:working",
            label: "working",
            group: true,
            children: [
                {
                    id: "task:dispatcher-retry",
                    label: "为 dispatcher 增加超时重试",
                    state: "running",
                    meta: "claude · feat/retry",
                },
                {
                    id: "task:attach-diagram",
                    label: "补 contracts 的 attach 时序图",
                    state: "running",
                    meta: "claude · feat/attach",
                },
            ],
        },
        {
            id: "task-group:awaiting_review",
            label: "awaiting_review",
            group: true,
            children: [
                {
                    id: "task:skin-review",
                    label: "webview 皮肤契约评审",
                    state: "review",
                    meta: "claude",
                },
            ],
        },
        {
            id: "task-group:done",
            label: "done",
            group: true,
            collapsed: true,
            children: [
                { id: "task:closed-1", label: "daemon 出包命令改在 daemon 目录内构建", state: "done", meta: "claude" },
            ],
        },
        {
            id: "task-group:failed",
            label: "failed",
            group: true,
            collapsed: true,
            children: [
                { id: "task:failed-1", label: "rebase 冲突自动解决", state: "failed", meta: "codex" },
            ],
        },
        {
            id: "task-group:queued",
            label: "queued",
            group: true,
            collapsed: true,
            children: [
                { id: "task:queued-1", label: "补齐 socket 重连用例", state: "queued", meta: "claude" },
            ],
        },
    ],
    connection: [
        { label: "dispatcher", value: "acp.sock · 2 workers", state: "up" },
        { label: "agent", value: "vscode.sock", state: "up" },
    ],
    account: { placeholder: true },
    ui: { collapsed: {}, canCreateChat: true },
};

const STALE: ControlPanelSnapshot = {
    ...READY,
    chats: [],
    workers: [],
    tasks: [],
    connection: [
        { label: "dispatcher", value: "ECONNREFUSED", state: "down" },
        { label: "agent", value: "vscode.sock", state: "up" },
        { label: "dispatch dir", value: "~/…/goworker", state: "unknown" },
    ],
    ui: { collapsed: { worker: true, task: true }, canCreateChat: false },
    offline: {
        title: "dispatcher 未响应",
        detail: "~/…/dispatcher/acp.sock · ECONNREFUSED",
    },
};

const EMPTY: ControlPanelSnapshot = {
    ...READY,
    chats: [],
    workers: [],
    tasks: [],
    connection: [
        { label: "dispatcher", value: "connecting…", state: "connecting" },
        { label: "agent", value: "未启动", state: "down" },
    ],
    ui: { collapsed: { worker: true, task: true }, canCreateChat: true },
    offline: null,
    emptyHint: { title: "还没有会话", detail: "点上方 New chat 开始" },
};

export const DEV_SNAPSHOTS: Record<
    "ready" | "stale" | "empty",
    ControlPanelSnapshot
> = { ready: READY, stale: STALE, empty: EMPTY };

export const DEV_SELECTED: Record<"ready" | "stale" | "empty", string | undefined> = {
    ready: "chat:retry-policy",
    stale: undefined,
    empty: undefined,
};
