/**
 * 控制面板的消息契约 —— 宿主一次推一份完整快照，webview 只回动作。
 *
 * 放在协议层而不是 webview 里，是因为两侧（宿主与本仓）都要吃同一份类型：
 * 宿主从 `@htmlgtmk/acp-ui` 拿，webview 从相对路径拿，避免两份定义漂移。
 * 上行消息按不可信输入处理：一律过 `tryParseControlPanelUpMessage` 白名单。
 */

/** 三棵树的种类；折叠状态与计数都按这个键存。 */
export type ControlPanelTreeKind = "chat" | "worker" | "task";

/** 任务生命周期五档，沿用宿主 `src/views/taskTree.ts` 的收敛结果，不新造词表。 */
export type ControlPanelNodeState =
    | "running"
    | "review"
    | "done"
    | "failed"
    | "queued";

/**
 * 行上的动作。`id` 必须是宿主已注册的命令名 —— webview 不自己实现行为，
 * 只把它原样回传，由宿主 `executeCommand`。
 */
export type ControlPanelNodeAction = {
    id: string;
    glyph: string;
    tooltip: string;
};

export type ControlPanelTreeNode = {
    id: string;
    label: string;
    state?: ControlPanelNodeState;
    /** 右侧等宽小字（时间、`claude · feat/retry`）；hover/选中时被 actions 顶掉。 */
    meta?: string;
    /** 只用于缩进，不表达树深语义 —— 三棵树各自最多两层。 */
    depth?: number;
    children?: ControlPanelTreeNode[];
    /** 分组行（working / archived）：不渲染状态点，计数由 children 推。 */
    group?: boolean;
    /** 分组折叠的初值种子；点开/收起落在组件本地状态，不回宿主。 */
    collapsed?: boolean;
    actions?: ControlPanelNodeAction[];
};

/** 一条链路（dispatcher / agent）的展示状态。 */
export type ControlPanelLinkState = {
    label: string;
    value: string;
    state: "up" | "down" | "connecting" | "unknown";
};

export type ControlPanelHint = {
    title: string;
    detail: string;
};

/** 幂等全量快照；webview 不做增量合并。 */
export type ControlPanelSnapshot = {
    brand: { name: string; version: string };
    chats: ControlPanelTreeNode[];
    /** 宿主把 worker 的任务 id 展开成子节点后再推，webview 不查表。 */
    workers: ControlPanelTreeNode[];
    tasks: ControlPanelTreeNode[];
    /** 三棵树标题上的动作（折叠全部 / 刷新 / worker 配置），同样只带命令 id。 */
    treeActions?: Partial<
        Record<ControlPanelTreeKind, ControlPanelNodeAction[]>
    >;
    connection: ControlPanelLinkState[];
    /** 本轮只占位：任何真实身份字段都不许出现。 */
    account: { placeholder: true };
    ui: {
        collapsed: Partial<Record<ControlPanelTreeKind, boolean>>;
        canCreateChat: boolean;
        /** 基准字号 px；缺省则用 CSS 里那套阶梯的原点。 */
        fontSize?: number;
        /** 皮肤名；缺省则不写 `data-skin`，沿用 `:root` 那套跟随宿主的 token。 */
        skin?: ControlPanelSkin;
    };
    /** 非空即画离线块，并盖掉三棵树的正常内容。 */
    offline?: ControlPanelHint | null;
    /** 首启空态只占 Chat 树内部，品牌头与 connection 仍可见。 */
    emptyHint?: ControlPanelHint | null;
};

/** 基准字号的合法区间：宿主设置项与 model 的夹取都以此为准。 */
export const CONTROL_PANEL_FONT_SIZE = {
    min: 11,
    max: 20,
    default: 14,
} as const;

/** 内置三套皮肤，与 `webview/acp-ui/src/tokens.css` 里那三个 `[data-skin]` 块一一对应。 */
export const CONTROL_PANEL_SKINS = [
    "terminal",
    "vscode",
    "light-paper",
] as const;
export type ControlPanelSkin = (typeof CONTROL_PANEL_SKINS)[number];

export function isControlPanelSkin(raw: unknown): raw is ControlPanelSkin {
    return (CONTROL_PANEL_SKINS as readonly unknown[]).includes(raw);
}

/** 下行：宿主 → 控制面板 webview。 */
export type ControlPanelDownMessage = {
    type: "controlPanel";
    snapshot: ControlPanelSnapshot;
};

/** 上行：控制面板 webview → 宿主。 */
export type ControlPanelUpMessage =
    | { type: "controlPanel.ready" }
    | { type: "controlPanel.select"; id: string; kind: ControlPanelTreeKind }
    | { type: "controlPanel.toggleTree"; kind: ControlPanelTreeKind }
    | {
          type: "controlPanel.action";
          actionId: string;
          id: string;
      }
    | { type: "controlPanel.newChat" }
    | { type: "controlPanel.openSettings" };

/** 上行里字符串字段的长度上限 —— 不可信输入，超长即视为伪造。 */
const MAX_UP_STRING_LENGTH = 256;

function shortString(raw: unknown): string | undefined {
    if (typeof raw !== "string") {
        return undefined;
    }
    const trimmed = raw.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_UP_STRING_LENGTH) {
        return undefined;
    }
    return trimmed;
}

export function isControlPanelTreeKind(
    raw: unknown,
): raw is ControlPanelTreeKind {
    return raw === "chat" || raw === "worker" || raw === "task";
}

/**
 * 解析来自 webview 的控制面板上行消息；不在白名单内的一律返回 `null`。
 * 命令 id 只做形状校验，**是否允许执行由宿主的命令表决定**（见 `CONTROL_PANEL_ACTION_COMMANDS`）。
 */
export function tryParseControlPanelUpMessage(
    raw: unknown,
): ControlPanelUpMessage | null {
    if (raw === null || typeof raw !== "object") {
        return null;
    }
    const record = raw as Record<string, unknown>;
    switch (record.type) {
        case "controlPanel.ready":
            return { type: "controlPanel.ready" };
        case "controlPanel.newChat":
            return { type: "controlPanel.newChat" };
        case "controlPanel.openSettings":
            return { type: "controlPanel.openSettings" };
        case "controlPanel.toggleTree": {
            const kind = record.kind;
            if (!isControlPanelTreeKind(kind)) {
                return null;
            }
            return { type: "controlPanel.toggleTree", kind };
        }
        case "controlPanel.select": {
            const id = shortString(record.id);
            const kind = record.kind;
            if (id === undefined || !isControlPanelTreeKind(kind)) {
                return null;
            }
            return { type: "controlPanel.select", id, kind };
        }
        case "controlPanel.action": {
            const actionId = shortString(record.actionId);
            const id = shortString(record.id);
            if (actionId === undefined || id === undefined) {
                return null;
            }
            return { type: "controlPanel.action", actionId, id };
        }
        default:
            return null;
    }
}

/** 上行 `type` 的判别前缀，供合并协议表的 `tryParseWebviewMessage` 分派。 */
export function isControlPanelUpMessageType(raw: unknown): boolean {
    return typeof raw === "string" && raw.startsWith("controlPanel.");
}
