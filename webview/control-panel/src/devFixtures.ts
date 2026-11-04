import type { ControlPanelSnapshot } from "./snapshot";

/** 浏览器端回放数据，逐行对应对面那三份稿子：
    design/screens/02-control-panel.html 的 ①（默认）④（断连）⑤（首启空态）。
    这里的 action id 与宿主真实注册的那批保持一致（goworker `src/views/controlPanel/commands.ts`
    与 `extension.ts`）；改名/复制/删除三条已注册但只会回一句「缺 RPC」，daemon 补接口前不画。 */
const RENAME = { id: "goworker.renameChat", glyph: "✎", tooltip: "改名" };
const DUPLICATE = { id: "goworker.duplicateChat", glyph: "⧉", tooltip: "复制" };
const DELETE = { id: "goworker.deleteChat", glyph: "⌫", tooltip: "删除" };
const RECONNECT = {
    id: "goworker.reconnect",
    glyph: "⟳",
    label: "Reconnect",
    tooltip: "重连 dispatcher（断开后重拉任务目录）",
};
const DAEMON_LOG = {
    id: "goworker.showDaemonLog",
    glyph: "▤",
    label: "daemon 日志",
    tooltip: "打开 daemon 日志文件",
};
const RECONNECT_AGENT = {
    id: "goworker.refreshChats",
    glyph: "⟳",
    tooltip: "重连 agent 那条连接（重拉会话列表）",
};

const READY: ControlPanelSnapshot = {
    brand: { name: "GOWORKER", version: "v0.1.0" },
    treeActions: {
        chat: [
            { id: "goworker.refreshChats", glyph: "⟳", tooltip: "刷新会话列表" },
            { id: "goworker.collapseChats", glyph: "⊟", tooltip: "折叠会话树" },
        ],
        worker: [{ id: "goworker.workerConfig", glyph: "⚙", tooltip: "打开 worker 配置（daemon config.yaml）" }],
        task: [{ id: "goworker.refreshTasks", glyph: "⟳", tooltip: "刷新任务列表" }],
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
            // 子节点 id 与宿主 model.ts 的规则一致：`worker:<名>:task:<任务 id>`。
            // 原来这里直接抄了 Task 树那批 id，于是同一条任务在两棵树里 id 一模一样 ——
            // 键盘导航按 id 找行时，↓ 会在那两行之间打转（导航现在按下标找，数据也照实修对）。
            children: [
                {
                    id: "worker:claude:task:dispatcher-retry",
                    label: "为 dispatcher 增加超时重试",
                    state: "running",
                    meta: "12:04",
                },
                {
                    id: "worker:claude:task:skin-review",
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
        {
            label: "dispatcher",
            value: "acp.sock · 2 workers",
            state: "up",
            actions: [RECONNECT, DAEMON_LOG],
        },
        {
            label: "agent",
            value: "vscode.sock",
            state: "up",
            actions: [RECONNECT_AGENT],
        },
    ],
    account: { placeholder: true },
    ui: { collapsed: {}, canCreateChat: true },
};

/** 断连态。三棵树的数据都留着 —— 宿主那边只是 dispatcher 探不到了，
    缓存的会话 / 任务并不会被清空，所以这里照实带上。
    稿子 02④ 把 Worker / Task 画成折叠的，是因为 480px 里放不下；这里三树常开，
    为的是同时验两件事：Chat 那格整段让位给离线块，Worker / Task 仍画旧行。 */
const STALE: ControlPanelSnapshot = {
    ...READY,
    connection: [
        {
            label: "dispatcher",
            // 与宿主实发的口径一致：文件名 + 失败原因（长到会顶破行，见 .gw-conn-val 的 min-width）
            value: "acp.sock · connect ENOENT /Users/me/.config/goworker/dispatch/acp.sock",
            state: "down",
            actions: [RECONNECT, DAEMON_LOG],
        },
        {
            label: "agent",
            value: "vscode.sock",
            state: "up",
            actions: [RECONNECT_AGENT],
        },
        { label: "dispatch dir", value: "~/…/goworker", state: "unknown" },
    ],
    ui: { collapsed: {}, canCreateChat: false },
    offline: {
        title: "dispatcher 未响应",
        detail: "~/…/dispatcher/acp.sock · ECONNREFUSED",
        actions: [RECONNECT, DAEMON_LOG],
    },
};

const EMPTY: ControlPanelSnapshot = {
    ...READY,
    chats: [],
    workers: [],
    tasks: [],
    connection: [
        {
            label: "dispatcher",
            value: "connecting…",
            state: "connecting",
            actions: [RECONNECT, DAEMON_LOG],
        },
        {
            label: "agent",
            value: "未启动",
            state: "down",
            actions: [RECONNECT_AGENT],
        },
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
