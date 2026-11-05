/**
 * 控制面板的消息契约 —— 宿主一次推一份完整快照，webview 只回动作。
 *
 * 放在协议层而不是 webview 里，是因为两侧（宿主与本仓）都要吃同一份类型：
 * 宿主从 `@htmlgtmk/acp-ui` 拿，webview 从相对路径拿，避免两份定义漂移。
 * 上行消息按不可信输入处理：一律过 `tryParseControlPanelUpMessage` 白名单。
 */

/**
 * 四棵树的种类；折叠状态与计数都按这个键存。
 * 词表只这一份：类型与上行守卫（isControlPanelTreeKind）都从它派生 ——
 * 守卫此前手抄了一份字面量且漏了 `project`，PROJECTS 的 toggleTree/select
 * 上行全被白名单丢掉（树头成死按钮），而类型侧一切正常，编译期看不出来。
 */
const CONTROL_PANEL_TREE_KINDS = ["chat", "project", "worker", "task"] as const;

export type ControlPanelTreeKind = (typeof CONTROL_PANEL_TREE_KINDS)[number];

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
    /** 正文标签：只给离线块那种文字按钮用，行内图标按钮仍只画 `glyph`。 */
    label?: string;
    /**
     * 仅右键菜单（Plan B）：行内 hover 不渲染该动作。会话行的 archive/copy
     * 走这里 —— hover 保持干净。
     */
    menuOnly?: boolean;
};

export type ControlPanelTreeNode = {
    id: string;
    label: string;
    state?: ControlPanelNodeState;
    /** 会话 agent 有 run 在飞（Plan B：chats 树旋转标识的数据源；仅 chat 行消费）。 */
    running?: boolean;
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

/**
 * 一条连接（dispatcher / agent）的展示状态。
 * 两条连接各自独立：单条断开不把另一条也标成异常，
 * 重连入口也因此挂在行上，而不是共用一个全局按钮（稿 02④）。
 */
export type ControlPanelLinkState = {
    label: string;
    value: string;
    state: "up" | "down" | "connecting" | "unknown";
    /** 行内动作（重连 / 打开日志…），与树行同一套结构，只带命令 id。 */
    actions?: ControlPanelNodeAction[];
};

export type ControlPanelHint = {
    title: string;
    detail: string;
    /** 离线块就地给的操作（稿 02④）；由宿主填，webview 不硬编码命令名。 */
    actions?: ControlPanelNodeAction[];
};

/** 幂等全量快照；webview 不做增量合并。 */
export type ControlPanelSnapshot = {
    brand: { name: string; version: string };
    chats: ControlPanelTreeNode[];
    /** Projects 树（Plan B）：workspace 分组，与 chats 平行；无 workspace 的会话留 chats。 */
    projects?: ControlPanelTreeNode[];
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
        /**
         * 皮肤名；缺省则不写 `data-skin`，沿用 `:root` 那套跟随宿主的 token。
         * 类型是 `string` 而不是那三档的联合：第三方皮肤包（`~/.goworker/skins/<id>/`）
         * 也走这一格。认不认、装不装得上由宿主那侧的校验说了算，这里只负责渲。
         */
        skin?: string;
        /**
         * 皮肤包样式表的 webview URI，按该挂的顺序给全量（内置档就是空数组）。
         * 快照每推一次页面就照这份增删 `<link data-gw-skin>`，所以换皮肤包不用重开侧栏。
         */
        skinStyleUris?: string[];
    };
    /** 非空即画离线块，并盖掉三棵树的正常内容。
     *  `actions` 按主次排序：第一条走主按钮样式（那是恢复这条连接的动作），其余次级。 */
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

/** 内置三套皮肤，与 `webview/acp-ui/src/skins/` 下那三个 `[data-skin]` 块一一对应。
 *  第三方皮肤包（`~/.goworker/skins/<id>/`）不在这个枚举里：它由宿主那侧枚举、校验后
 *  以字符串投递，认不认由宿主说了算。 */
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

/**
 * 下行（仅开发宿主）：注入一条按键，webview 里 dispatch 成真的 keydown。
 * 真宿主里没法用坐标敲侧栏，键盘导航只有这一个入口；它证不了物理按键能否穿过
 * VS Code 的键位层 —— 那一句要人手按。
 */
export type ControlPanelDevKeyMessage = {
    type: "devKey";
    /** 按键名（"ArrowDown" / "ContextMenu" / "Escape" …）。 */
    key?: string;
    /**
     * 直接点当前聚焦的元素。派发出来的 KeyboardEvent 属"不可信事件"，浏览器不会替它跑
     * 激活行为，所以注入的 Enter 在宿主里点不动按钮 —— "执行聚焦的那一项"只能这样取证
     * （真 Enter 能激活菜单项那一条只能在浏览器层验）。
     */
    activate?: boolean;
};

/**
 * 下行（仅开发宿主）：让侧栏那块 webview 回读一次自己的 DOM。
 * 快照落盘只能证明**宿主推了什么**，证不了页面把它渲成了什么 —— 皮肤就是这一类：
 * `ui.skin` 与那份 `<link>` 都到了，页面里那份样式表却可能没抢过产物默认值。
 * 报告以 `controlPanel.devProbe` 上行回给宿主，落在 /tmp/gw-dev-received-<pid>.jsonl。
 */
export type ControlPanelDevProbeMessage = {
    type: "devProbe";
    probeId: string;
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
    | { type: "controlPanel.openSettings" } /**
     * 上行（仅开发宿主）：注入按键后回传"焦点现在落在哪一行"，让键盘导航留下文本证据
     * —— 焦点环画不画得出来取决于 webview 的焦点态，截图不可靠。
     * `focused` 是 `document.hasFocus()`：宿主没把焦点给过 webview 时它是 false，
     * 那时 :focus 不匹配、环自然不画，别把这件事当成导航缺陷。
     * 宿主不登记这个 type，收到只会记日志。
     */
    | { type: "controlPanel.devFocus"; id?: string; focused?: boolean }
    /**
     * 上行（仅开发宿主）：`devProbe` 那一发的回读报告。`probeId` 原样带回，
     * 让脚本把自己那一发从流水里认出来。宿主要它只为落证据，收到不执行任何动作。
     */
    | {
          type: "controlPanel.devProbe";
          probeId?: string;
          facts?: Record<string, unknown>;
      };

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

/** 探针报告的上限：一份 DOM 读数用不了这么多，超长就当伪造丢掉整条。 */
const MAX_FACTS_JSON_LENGTH = 32_768;

/**
 * 探针的 `facts` 是不可信输入，而且宿主拿到就原样往 /tmp 追加一行 ——
 * 结构不猜（那是页面自己的读数），只挡两样：不是对象的、和能灌爆日志的。
 */
function smallFacts(raw: unknown): Record<string, unknown> | undefined {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        return undefined;
    }
    let json: string;
    try {
        json = JSON.stringify(raw);
    } catch {
        return undefined;
    }
    if (json.length > MAX_FACTS_JSON_LENGTH) {
        return undefined;
    }
    return raw as Record<string, unknown>;
}

export function isControlPanelTreeKind(
    raw: unknown,
): raw is ControlPanelTreeKind {
    return (
        typeof raw === "string" &&
        (CONTROL_PANEL_TREE_KINDS as readonly string[]).includes(raw)
    );
}

/**
 * 解析来自 webview 的控制面板上行消息；不在白名单内的一律返回 `null`。
 * 命令 id 只做形状校验，**是否允许执行由宿主的命令白名单决定**（goworker `panel.ts` 的 `ALLOWED_COMMANDS`）。
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
        case "controlPanel.devFocus": {
            // 没有焦点时 id 缺省，所以这一条不能因为 id 不合法就被丢掉。
            const id = shortString(record.id);
            const focused =
                typeof record.focused === "boolean"
                    ? record.focused
                    : undefined;
            return { type: "controlPanel.devFocus", id, focused };
        }
        case "controlPanel.devProbe": {
            // 没有 probeId 就对不上是哪一发，留着只会让脚本读到别人的报告。
            const probeId = shortString(record.probeId);
            if (probeId === undefined) {
                return null;
            }
            return {
                type: "controlPanel.devProbe",
                probeId,
                facts: smallFacts(record.facts),
            };
        }
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
