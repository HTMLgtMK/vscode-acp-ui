import {
    memo,
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type CSSProperties,
    type ReactElement,
} from "react";
import {
    findInTree,
    placeMenu,
    rowMenu,
    type MenuEntry,
} from "./contextMenu";
import {
    focusedRowIndex,
    hasModifier,
    isTypeAheadKey,
    moveIndex,
    NAV_KEYS,
    rowElements,
    toLabels,
    TYPE_AHEAD_MAX_LEN,
    TYPE_AHEAD_TIMEOUT_MS,
    typeAheadIndex,
} from "./keyboard";
import {
    rowsVisible,
    splitMeta,
    tierFor,
    type PanelTier,
} from "./tiers";
import type {
    ControlPanelSnapshot,
    Hint,
    NodeAction,
    NodeState,
    TreeNode,
    TreeKind,
} from "./snapshot";

const STATE_GLYPH: Record<NodeState, string> = {
    running: "⟳",
    review: "⚗",
    done: "✓",
    failed: "✕",
    queued: "◇",
};

const TREE_LABEL: Record<TreeKind, string> = {
    chat: "Chat",
    project: "Projects",
    worker: "Worker",
    task: "Task",
};

/** kind → 快照里那棵树的字段名（菜单键要从焦点行找回节点时用）。 */
const TREE_NODES: Record<TreeKind, "chats" | "projects" | "workers" | "tasks"> = {
    chat: "chats",
    project: "projects",
    worker: "workers",
    task: "tasks",
};

/** 浮层开在谁身上、在哪儿。它是面板自己的状态，不进快照。 */
interface MenuState {
    entries: MenuEntry[];
    x: number;
    y: number;
    node: TreeNode;
    kind: TreeKind;
}

export interface ControlPanelHandlers {
    onSelect(node: TreeNode, kind: TreeKind): void;
    onToggleTree(kind: TreeKind): void;
    onAction(action: NodeAction, node: TreeNode): void;
    onNewChat(): void;
    onOpenSettings(): void;
}

function leafCount(nodes: TreeNode[]): number {
    let total = 0;
    for (const node of nodes) {
        total += node.children ? leafCount(node.children) : 1;
    }
    return total;
}

/** 会话行（chats / projects 两棵树共用同一套渲染）：不画状态字形（◇/● 已废），
 * run 在飞时由 gw-node-spin 旋转环表达。绝不为不同树复制第二套行渲染。 */
function isSessionRow(node: TreeNode, kind: TreeKind): boolean {
    return !node.group && (kind === "chat" || kind === "project");
}

function glyphFor(node: TreeNode, kind: TreeKind, selected: boolean): string {
    if (isSessionRow(node, kind)) {
        return "";
    }
    return node.state ? STATE_GLYPH[node.state] : "◇";
}

/** 行状态在界面上是符号 + 颜色，读屏拿不到，所以念出来要一份词。 */
const STATE_WORD: Record<NodeState, string> = {
    running: "working",
    review: "awaiting review",
    done: "done",
    failed: "failed",
    queued: "queued",
};

/**
 * treeitem 的可访问名：`标题 · meta · 状态`。
 * 不给这一份，读屏只会念出标题，`◇` 与颜色承载的状态全丢。
 * 状态词只在 meta 没说到它时才补 —— worker 行的 meta 本来就是 `2 task · working`，
 * 再缀一遍是「claude · 2 task · working · working」。
 */
function rowName(node: TreeNode): string {
    const word = node.state ? STATE_WORD[node.state] : undefined;
    const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const said =
        word !== undefined &&
        node.meta !== undefined &&
        norm(node.meta).includes(norm(word));
    return [node.label, node.meta, said ? undefined : word]
        .filter((part) => part !== undefined && part !== "")
        .join(" · ");
}

/** 这一棵树里第一个真画出来的行 —— Tab 该停在它上面（没人选、也没人点过时）。
 * 分组行本身也是一行，所以就是顶层第一条（`NodeRows` 按这个顺序 push 的）。 */
function firstRenderedRow(nodes: TreeNode[]): string | undefined {
    return nodes[0]?.id;
}

interface RowsProps {
    nodes: TreeNode[];
    kind: TreeKind;
    depth: number;
    selectedId: string | undefined;
    groupOpen: Record<string, boolean>;
    /** 拖窄退让：这一档省掉行尾 meta 的前缀（`claude · feat/retry` 只留后半）。 */
    trimMeta: boolean;
    /** 这一棵树唯一吃 Tab 的那一行（roving tabindex，见 TreeSection 里的 tabStop）。 */
    tabStop: string | undefined;
    /** 五个上行回调。身份必须稳定（见 ControlPanel 里那份袋子），否则行 memo 全废。 */
    handlers: ControlPanelHandlers;
    onToggleGroup(id: string, open: boolean): void;
    onRowFocus(id: string): void;
    /** 右键（或菜单键）开浮层，位置和这一行是谁交给上层去拼。 */
    onRowMenu(node: TreeNode, kind: TreeKind, x: number, y: number): void;
}

interface RowProps {
    node: TreeNode;
    kind: TreeKind;
    depth: number;
    selected: boolean;
    /** 分组行开没开（`groupOpen` 覆盖过快照默认值之后的结果）。 */
    open: boolean;
    trimMeta: boolean;
    tabStop: boolean;
    handlers: ControlPanelHandlers;
    onToggleGroup(id: string, open: boolean): void;
    onRowFocus(id: string): void;
    onRowMenu(node: TreeNode, kind: TreeKind, x: number, y: number): void;
}

/**
 * 一行。宿主每推一份快照就换一整套新对象（快照是 postMessage 反序列化出来的），
 * 720 行全量重渲染实测 commit 124-130ms —— 滚一下卡一下。memo 掉之后只有真变了的那几行重画。
 * 比对走 JSON：字段清单会漏掉快照以后新增的东西，串一遍不会；两侧各串 720 行实测约 1.3ms。
 */
const NodeRow = memo(
    function NodeRow({
        node,
        kind,
        depth,
        selected,
        open,
        trimMeta,
        tabStop,
        handlers,
        onToggleGroup,
        onRowFocus,
        onRowMenu,
    }: RowProps): ReactElement {
        const meta = node.meta ? splitMeta(node.meta) : undefined;
        return (
            <div
                className="gw-node"
                // 整行是 treeitem，也是唯一的焦点落点：读屏念到的和键盘走的就是这一个元素。
                role="treeitem"
                data-row-id={node.id}
                data-row-kind={kind}
                // 键盘导航与 type-ahead 都按 data-row-id 认行（见 keyboard.ts）；
                // 值只用于查自己那张表，不进选择器，所以 id 里有引号也不怕。
                data-sel={selected ? "" : undefined}
                data-group={node.group ? "" : undefined}
                data-state={node.state}
                aria-selected={selected}
                aria-level={depth + 1}
                aria-expanded={node.children ? open : undefined}
                aria-label={rowName(node)}
                tabIndex={tabStop ? 0 : -1}
                onFocus={() => {
                    onRowFocus(node.id);
                }}
                onClick={() => {
                    handlers.onSelect(node, kind);
                }}
                // 缩进以宿主声明的 node.depth 为准（TreeNode.depth 契约："只用于缩进"），
                // 宿主未声明（undefined）时退回递归层。chats 的 workspace 分组子项
                // depth=0 —— 与组头同左缘，不再层层缩进。
                style={{ "--gw-indent": node.depth ?? depth } as CSSProperties}
                onContextMenu={(event) => {
                    // 不拦下宿主会给一份 Copy/Paste 原生菜单，和这张浮层叠着出。
                    event.preventDefault();
                    onRowMenu(node, kind, event.clientX, event.clientY);
                }}
            >
                {node.children ? (
                    <button
                        type="button"
                        className="gw-node-twist"
                        // 展开状态已经由 aria-expanded 报在行上，这个三角只是它的可点版本；
                        // 也不给 Tab 停（一棵树一个停靠点），键盘走 →← 与 Enter。
                        tabIndex={-1}
                        aria-hidden={true}
                        onClick={(event) => {
                            event.stopPropagation();
                            onToggleGroup(node.id, open);
                        }}
                    >
                        {open ? "▾" : "▸"}
                    </button>
                ) : (
                    <span className="gw-node-twist" />
                )}
                {isSessionRow(node, kind) ? (
                    node.running ? (
                        // run 在飞：旋转标识（无字形，纯 CSS 动画，读屏走 aria-label 状态词）。
                        <span className="gw-node-icon gw-node-spin" aria-hidden={true} />
                    ) : (
                        // 无状态字形：占位保持行高与对齐一致。
                        <span className="gw-node-icon" aria-hidden={true} />
                    )
                ) : node.group ? null : (
                    <span
                        className="gw-node-icon"
                        // ◇ ⟳ ⚗ 这些字形读屏会照念，状态词已经在 aria-label 里了。
                        aria-hidden={true}
                        data-state={node.state}
                    >
                        {glyphFor(node, kind, selected)}
                    </span>
                )}
                <span className="gw-node-label" title={node.label}>
                    {node.label}
                </span>
                {node.group && node.children ? (
                    <span className="gw-node-meta">{node.children.length}</span>
                ) : meta ? (
                    <span className="gw-node-meta" title={node.meta}>
                        {trimMeta ? meta.tail : node.meta}
                    </span>
                ) : null}
                {node.actions?.length ? (
                    <span className="gw-node-act">
                        {node.actions.filter((action) => !action.menuOnly).map((action) => (
                            <button
                                key={action.id}
                                type="button"
                                className="gw-iconbtn"
                                title={action.tooltip}
                                aria-label={action.tooltip}
                                // 行内动作不是 Tab 停靠点（否则 720 行要按 720 次才出得去），
                                // 键盘够得着它的路是那一行的浮层（菜单键 → ↑↓ → Enter）。
                                tabIndex={-1}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    handlers.onAction(action, node);
                                }}
                            >
                                {action.glyph}
                            </button>
                        ))}
                    </span>
                ) : null}
            </div>
        );
    },
    (a, b) =>
        a.kind === b.kind &&
        a.depth === b.depth &&
        a.selected === b.selected &&
        a.open === b.open &&
        a.trimMeta === b.trimMeta &&
        a.tabStop === b.tabStop &&
        (a.node === b.node ||
            JSON.stringify(a.node) === JSON.stringify(b.node)),
);

function NodeRows({
    nodes,
    kind,
    depth,
    selectedId,
    groupOpen,
    trimMeta,
    tabStop,
    handlers,
    onToggleGroup,
    onRowFocus,
    onRowMenu,
}: RowsProps): ReactElement {
    const rows: ReactElement[] = [];
    for (const node of nodes) {
        const open = groupOpen[node.id] ?? !node.collapsed;
        rows.push(
            <NodeRow
                key={node.id}
                node={node}
                kind={kind}
                depth={depth}
                selected={node.id === selectedId}
                open={open}
                trimMeta={trimMeta}
                tabStop={node.id === tabStop}
                handlers={handlers}
                onToggleGroup={onToggleGroup}
                onRowFocus={onRowFocus}
                onRowMenu={onRowMenu}
            />,
        );
        if (node.children && open) {
            rows.push(
                <NodeRows
                    key={`${node.id}›`}
                    nodes={node.children}
                    kind={kind}
                    depth={depth + 1}
                    selectedId={selectedId}
                    groupOpen={groupOpen}
                    trimMeta={trimMeta}
                    tabStop={tabStop}
                    handlers={handlers}
                    onToggleGroup={onToggleGroup}
                    onRowFocus={onRowFocus}
                    onRowMenu={onRowMenu}
                />,
            );
        }
    }
    return <>{rows}</>;
}

/**
 * 离线块与首启空态都画在 Chat 树**内部**（稿 02④⑤）：树头、品牌头与 connection 一直在，
 * 用户才分得清「没数据」和「没连上」。所以它们不是 `.gw-trees` 的兄弟节点，而是 Chat 树
 * 在特殊状态下的正文，由 TreeSection 的 `body` 挂进去。
 */
function OfflineBody({
    hint,
    onAction,
}: {
    hint: Hint;
    onAction: ControlPanelHandlers["onAction"];
}): ReactElement {
    return (
        <div className="gw-offline">
            <div>
                <b>{hint.title}</b>
            </div>
            <code>{hint.detail}</code>
            {hint.actions?.length ? (
                <div className="gw-offline-actions">
                    {hint.actions.map((action, index) => (
                        <button
                            key={action.id}
                            type="button"
                            className="gw-btn"
                            // 第一条是恢复动作（主按钮），其余次级 —— 顺序由宿主定。
                            data-secondary={index === 0 ? undefined : ""}
                            title={action.tooltip}
                            onClick={() => {
                                onAction(action, {
                                    id: "offline",
                                    label: hint.title,
                                });
                            }}
                        >
                            {action.glyph}
                            {action.label ? <span>{action.label}</span> : null}
                        </button>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

function EmptyBody({ hint }: { hint: Hint }): ReactElement {
    return (
        <div className="gw-empty">
            <div>{hint.title}</div>
            <div className="gw-empty-sub">{hint.detail}</div>
        </div>
    );
}

interface SectionProps {
    kind: TreeKind;
    nodes: TreeNode[];
    collapsed: boolean;
    selectedId: string | undefined;
    actions: NodeAction[];
    count: number | string;
    /** 分组开合表，提到 ControlPanel 画的 —— ← → 要在那边的按键处理器里翻它。 */
    groupOpen: Record<string, boolean>;
    onToggleGroup(id: string, open: boolean): void;
    /** 给了就用它替掉整段行列表（离线块 / 空态），折叠时同样不画。 */
    body?: ReactElement;
    /** 拖窄退让：这一档这棵树还画不画行（树头与计数一直留着）。 */
    rowsShown: boolean;
    /** 拖窄退让：行尾 meta 只留末段。 */
    trimMeta: boolean;
    /** 五个上行回调，身份稳定（见 ControlPanel 里的袋子）。 */
    handlers: ControlPanelHandlers;
    onRowMenu(node: TreeNode, kind: TreeKind, x: number, y: number): void;
}

function TreeSection({
    kind,
    nodes,
    collapsed,
    selectedId,
    actions,
    count,
    groupOpen,
    onToggleGroup,
    body,
    rowsShown,
    trimMeta,
    handlers,
    onRowMenu,
}: SectionProps): ReactElement {
    /**
     * 这一棵树唯一的 Tab 停靠点在哪一行（roving tabindex）。一次 Tab 进一棵树、
     * 落在这行，之后靠 ↑↓ 走 —— 720 行全给 tabIndex=0 的话，Tab 按到手酸也出不了第一棵树。
     * 起点：上次焦点停过的行 → 选中行 → 首行。
     * 只查「还在不在这棵树里」，不查「当前画没画出来」：焦点收进折叠的分组时这里不给停靠点，
     * 那一棵树的行本来就不在，Tab 落在树头按钮上就够了。
     */
    const [stopId, setStopId] = useState<string | undefined>(undefined);
    const tabStop = [stopId, selectedId].find(
        (id) => id !== undefined && findInTree(nodes, id) !== undefined,
    ) ?? firstRenderedRow(nodes);
    // 身份要稳定，不然下面每一行的 memo 都会被这一个 prop 打穿。
    const onRowFocus = useCallback((id: string): void => {
        setStopId(id);
    }, []);
    const rowsId = `gw-rows-${kind}`;
    return (
        <div className="gw-tree" data-kind={kind}>
            <div className="gw-tree-head">
                <button
                    type="button"
                    className="gw-hicon"
                    title={collapsed ? "展开" : "折叠"}
                    aria-label={`${collapsed ? "展开" : "折叠"} ${TREE_LABEL[kind]}`}
                    aria-expanded={!collapsed}
                    aria-controls={rowsId}
                    onClick={() => {
                        handlers.onToggleTree(kind);
                    }}
                >
                    {collapsed ? "▸" : "▾"}
                </button>
                {TREE_LABEL[kind]}
                <span className="gw-count">{count}</span>
                <span className="gw-tree-actions">
                    {actions.map((action) => (
                        <button
                            key={action.id}
                            type="button"
                            className="gw-iconbtn"
                            title={action.tooltip}
                            aria-label={`${TREE_LABEL[kind]}：${action.tooltip}`}
                            onClick={() => {
                                handlers.onAction(action, {
                                    id: `tree:${kind}`,
                                    label: TREE_LABEL[kind],
                                });
                            }}
                        >
                            {action.glyph}
                        </button>
                    ))}
                </span>
            </div>
            {collapsed ? null : (
                // 离线块与空态不是 treeitem，别把它们塞进 role="tree" 的壳里；
                // 但这一格始终存在，树头的 aria-controls 才有个能对上的 id。
                <div
                    id={rowsId}
                    role={body ? undefined : "tree"}
                    aria-label={body ? undefined : TREE_LABEL[kind]}
                >
                    {body ??
                        (rowsShown ? (
                            <NodeRows
                                nodes={nodes}
                                kind={kind}
                                depth={0}
                                selectedId={selectedId}
                                groupOpen={groupOpen}
                                trimMeta={trimMeta}
                                tabStop={tabStop}
                                handlers={handlers}
                                onToggleGroup={onToggleGroup}
                                onRowFocus={onRowFocus}
                                onRowMenu={onRowMenu}
                            />
                        ) : null)}
                </div>
            )}
        </div>
    );
}

const LED: Record<string, "on" | "off" | "spin" | undefined> = {
    up: "on",
    down: "off",
    connecting: "spin",
    unknown: undefined,
};

/** 连接状态的可读说法 —— 界面上是灯的颜色与转速，读屏只认文字。 */
const LINK_WORD: Record<string, string> = {
    up: "connected",
    down: "not connected",
    connecting: "connecting",
    unknown: "state unknown",
};

export function ControlPanel({
    snapshot,
    selectedId,
    onNewChat,
    onSelect,
    onToggleTree,
    onAction,
    onOpenSettings,
}: {
    snapshot: ControlPanelSnapshot;
    selectedId: string | undefined;
} & ControlPanelHandlers): ReactElement {
    const { ui, connection, offline } = snapshot;
    const shellRef = useRef<HTMLDivElement>(null);
    const [tier, setTier] = useState<PanelTier>("full");
    /**
     * 分组开合表放在这一层而不是 TreeSection 里：← → 要翻它，那两个键由下面这个
     * document 级处理器管，读不到子组件的 state。key 是分组行 id，跨树不撞。
     */
    const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>({});
    const toggleGroup = useCallback((id: string, open: boolean): void => {
        setGroupOpen((prev) => ({ ...prev, [id]: !open }));
    }, []);
    useEffect(() => {
        const shell = shellRef.current;
        // 量不了（jsdom 没有 ResizeObserver）就停在默认档，行照画。
        if (!shell || typeof ResizeObserver === "undefined") return undefined;
        const see = () => {
            // 0 不是"面板窄到 0"，是没量到（未挂载、或宿主把 webview 藏了）。
            // 按 0 退让会把三棵树的行全清空，看起来像数据丢了。
            if (shell.clientWidth === 0) return;
            setTier(tierFor(shell.clientWidth));
        };
        see();
        const observer = new ResizeObserver(see);
        observer.observe(shell);
        return () => {
            observer.disconnect();
        };
    }, []);
    /** type-ahead 缓冲：连着敲的字拼成一条前缀；停 800ms 或按方向键作废。 */
    const typing = useRef({ text: "", anchor: null as HTMLElement | null });
    const [menu, setMenu] = useState<MenuState | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    /**
     * document 上那个 keydown 的依赖是 `[]`（换订阅会把 type-ahead 缓冲冲掉），
     * 读不到最新 state，所以这几样各镜像一份。
     */
    const live = useRef({ snapshot, menu, onSelect, onAction, groupOpen });
    useEffect(() => {
        live.current = { snapshot, menu, onSelect, onAction, groupOpen };
    });

    useEffect(() => {
        let idle: ReturnType<typeof setTimeout> | undefined;
        const drop = (): void => {
            typing.current = { text: "", anchor: null };
        };
        /** 浮层开着时按键归浮层管：↑↓/Home/End 走条目，Esc 关掉并把焦点还给那一行。 */
        function onMenuKey(event: KeyboardEvent): boolean {
            const open = live.current.menu;
            const shell = shellRef.current;
            if (!open || !shell) return false;
            if (event.key === "Escape") {
                event.preventDefault();
                setMenu(null);
                giveRowFocus(open.node.id);
                return true;
            }
            const move = NAV_KEYS[event.key];
            if (!move || hasModifier(event)) {
                // 其余按键到这里就算处理完了（不再让 type-ahead 在背后挑行），
                // 但**不拦默认动作**：Enter / Space 要靠它激活当前聚焦的菜单项。
                return true;
            }
            const items = [...shell.querySelectorAll<HTMLElement>(".gw-menu button")];
            const to = moveIndex(
                items.length,
                items.indexOf(document.activeElement as HTMLElement),
                move,
            );
            if (to >= 0) {
                event.preventDefault();
                items[to].focus();
            }
            return true;
        }
        /** 一行 DOM → 快照里那个节点（菜单键与 ← → 都要反查，同一 id 可能在两棵树都画）。 */
        function nodeOfRow(
            el: HTMLElement,
        ): { node: TreeNode; kind: TreeKind } | undefined {
            const id = el.dataset.rowId;
            const kind = el.closest<HTMLElement>(".gw-tree")?.dataset
                .kind as TreeKind | undefined;
            if (!id || !kind) return undefined;
            const nodes = live.current.snapshot[TREE_NODES[kind]] ?? [];
            const node = findInTree(nodes, id);
            return node ? { node, kind } : undefined;
        }
        /** 菜单键（Chromium 也把它映射到 Shift+F10）：给当前焦点行开同一张浮层。 */
        function openFromKeyboard(shell: HTMLElement, els: HTMLElement[]): void {
            const at = focusedRowIndex(shell, els);
            if (at < 0) return;
            const el = els[at];
            const found = nodeOfRow(el);
            if (!found) return;
            const rect = el.getBoundingClientRect();
            openMenuAt(found.node, found.kind, rect.left + 8, rect.bottom + 2);
        }
        function onKeyDown(event: KeyboardEvent): void {
            const shell = shellRef.current;
            if (!shell || event.defaultPrevented) return;
            if (onMenuKey(event)) return;
            const els = rowElements(shell);
            if (els.length === 0) return;
            if (event.key === "ContextMenu" && !hasModifier(event)) {
                event.preventDefault();
                openFromKeyboard(shell, els);
                return;
            }
            const labels = toLabels(els);
            const at = focusedRowIndex(shell, els);

            /**
             * ← →：开 / 合一个分组。行上那个三角是 `aria-hidden` 且不吃 Tab 的
             * （一棵树一个停靠点），所以这是键盘开合分组的唯一一条路。
             * → 打在已展开的分组上 = 进它的第一行（DOM 顺序里就是下一行）；
             * 其余情况不办事，也不吃掉按键。
             */
            if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                if (hasModifier(event) || at < 0) return;
                const node = nodeOfRow(els[at])?.node;
                if (!node?.children) return;
                const open = live.current.groupOpen[node.id] ?? !node.collapsed;
                event.preventDefault();
                drop();
                if (event.key === "ArrowRight") {
                    if (open) els[at + 1]?.focus();
                    else toggleGroup(node.id, open);
                } else if (open) {
                    toggleGroup(node.id, open);
                }
                return;
            }
            // Enter / 空格：选中焦点行，和点它走同一个入口。行是 div、没有原生激活行为，
            // 所以得显式 click()（宿主里注入的 keydown 是不可信事件，也不自带点击）。
            // 焦点在行里那些钮上时不插手 —— 让浏览器去激活那个钮，别把点击抢成选中整行。
            if (event.key === "Enter" || event.key === " ") {
                if (hasModifier(event) || at < 0) return;
                if (document.activeElement !== els[at]) return;
                event.preventDefault();
                drop();
                els[at].click();
                return;
            }
            const move = NAV_KEYS[event.key];
            if (move) {
                if (hasModifier(event)) return;
                const to = moveIndex(els.length, at, move);
                if (to < 0) return;
                // 拦下来才不会被宿主当成翻页滚走。
                event.preventDefault();
                drop();
                els[to].focus();
                return;
            }
            if (!isTypeAheadKey(event)) return;
            const prev = typing.current;
            // 同一个字母连按 = 在同类行里轮转；换了字母 = 把前缀细化。
            const cycle =
                prev.text.length === 0 ||
                prev.text.length >= TYPE_AHEAD_MAX_LEN ||
                event.key === prev.text.slice(-1);
            const text = cycle ? event.key : prev.text + event.key;
            if (idle !== undefined) clearTimeout(idle);
            idle = setTimeout(drop, TYPE_AHEAD_TIMEOUT_MS);
            // 锚点存元素而不是下标：两次按键之间宿主推了新快照，元素还在就还认得。
            const anchor = prev.anchor ? els.indexOf(prev.anchor) : -1;
            const hit = typeAheadIndex(labels, cycle ? at : anchor, text, {
                inclusive: !cycle,
            });
            // 没有命中就保持焦点不动，也不吃掉这个按键。
            if (hit < 0) {
                drop();
                return;
            }
            event.preventDefault();
            typing.current = { text, anchor: els[hit] };
            els[hit].focus();
        }
        // 挂在 document 上而不是 .gw-shell 上：焦点还在 New chat / 空白处时
        // 按键不会经过这个子树，方向键就漏了。
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("keydown", onKeyDown);
            if (idle !== undefined) clearTimeout(idle);
        };
    }, []);

    /**
     * 浮层收掉之后把焦点还给原来那一行 —— 键盘选完还能接着 ↑↓ 走，不用从头点位。
     * 行按下标在 DOM 里找，不拿 id 拼选择器（id 里什么都有）。
     */
    const giveRowFocus = (id: string): void => {
        const shell = shellRef.current;
        if (!shell) return;
        rowElements(shell).find((el) => el.dataset.rowId === id)?.focus();
    };

    // 身份要稳定：它是 720 行 memo 的 prop 之一，每渲染新建就把 memo 全打穿了。
    const openMenuAt = useCallback(
        (node: TreeNode, kind: TreeKind, x: number, y: number): void => {
            const entries = rowMenu(
                node,
                kind,
                live.current.snapshot.treeActions?.[kind] ?? [],
            );
            // 一个动作都没有就别开一张空菜单 —— 那只会让人以为右键坏了。
            setMenu(entries.length === 0 ? null : { entries, x, y, node, kind });
        },
        [],
    );

    const runEntry = (entry: MenuEntry): void => {
        const open = live.current.menu;
        setMenu(null);
        if (entry.open) {
            live.current.onSelect(entry.open.node, entry.open.kind);
        } else if (entry.action && open) {
            live.current.onAction(entry.action, open.node);
        }
        // 执行完也回到那一行：Esc 还得把焦点还回去，键盘选完不该比鼠标多点一下才找回位置。
        if (open) giveRowFocus(open.node.id);
    };

    useLayoutEffect(() => {
        const el = menuRef.current;
        const shell = shellRef.current;
        if (!el || !shell || !menu) return;
        // 存的是 clientX / clientY（视口坐标），而 .gw-menu 是绝对定位、以面板为原点 ——
        // 面板本身在视口里偏多少就得减掉，否则浮层不贴着光标（浏览器那页顶上有条 26px 的开发条）。
        const base = shell.getBoundingClientRect();
        // 先按指针位置画出来才知道它多大，然后才夹得回面板里。
        const { left, top } = placeMenu(
            { x: menu.x - base.left, y: menu.y - base.top },
            { w: el.offsetWidth, h: el.offsetHeight },
            { w: shell.clientWidth, h: shell.clientHeight },
        );
        el.style.left = `${left}px`;
        el.style.top = `${top}px`;
        el.querySelector<HTMLElement>("button")?.focus();
    }, [menu]);

    useEffect(() => {
        if (!menu) return;
        const close = (): void => setMenu(null);
        const onPointerDown = (event: Event): void => {
            if (!menuRef.current?.contains(event.target as Node)) close();
        };
        document.addEventListener("pointerdown", onPointerDown, true);
        // 行会滚、浮层不会：一滚就对不上位置，直接关掉（与宿主同一口径）。
        document.addEventListener("wheel", close, true);
        window.addEventListener("blur", close);
        window.addEventListener("resize", close);
        return () => {
            document.removeEventListener("pointerdown", onPointerDown, true);
            document.removeEventListener("wheel", close, true);
            window.removeEventListener("blur", close);
            window.removeEventListener("resize", close);
        };
    }, [menu]);

    /**
     * 上行回调的袋子：宿主与独立页每次渲染都传新闭包进来，直接往下传会把 720 行的 memo
     * 全部打穿。这里保持**对象身份**不变、每渲染刷新一次字段，点击时永远调到最新那一份。
     */
    const bag = useRef<ControlPanelHandlers>({
        onSelect,
        onToggleTree,
        onAction,
        onNewChat,
        onOpenSettings,
    });
    Object.assign(bag.current, {
        onSelect,
        onToggleTree,
        onAction,
        onNewChat,
        onOpenSettings,
    });
    const handlers = bag.current;
    const count = (kind: TreeKind, nodes: TreeNode[]): number | string => {
        if (offline) return "—";
        /** Worker 树的计数口径是「几个 worker」，子层是派给它的任务；
            Chat / Task 树数的是叶子。稿子 02① 的 3 / 2 / 6 就是这个差。 */
        return kind === "worker" ? nodes.length : leafCount(nodes);
    };
    // 离线块优先于空态：连不上时说"没连上"，不说"没数据"。
    const emptyHint =
        !offline && snapshot.emptyHint && snapshot.chats.length === 0
            ? snapshot.emptyHint
            : undefined;
    return (
        <div className="gw-shell" data-tier={tier} ref={shellRef}>
            <div className="gw-brand">
                <span className="gw-brand-mark">
                    {snapshot.brand.name.slice(0, 1)}
                </span>
                <span className="gw-brand-name">{snapshot.brand.name}</span>
                <span className="gw-brand-ver">{snapshot.brand.version}</span>
            </div>
            <button
                type="button"
                className="gw-primary"
                disabled={!ui.canCreateChat}
                onClick={onNewChat}
            >
                ＋ New chat
                <span className="gw-key">⌘T</span>
            </button>

            <div className="gw-trees">
                {/* 拖窄退让：档位决定哪几棵树还画行、meta 留不留前缀（tiers.ts 量的阈值）。 */}
                <TreeSection
                    kind="chat"
                    onRowMenu={openMenuAt}
                    // 断连时旧会话行不画 —— body（离线块 / 空态）整段替掉行列表；
                    // Worker / Task 没有 body，仍留着上一次的数据（稿 02④）。
                    nodes={snapshot.chats}
                    collapsed={ui.collapsed.chat === true}
                    selectedId={selectedId}
                    actions={snapshot.treeActions?.chat ?? []}
                    count={count("chat", snapshot.chats)}
                    rowsShown={rowsVisible(tier, "chat")}
                    trimMeta={tier !== "full"}
                    body={
                        offline ? (
                            <OfflineBody hint={offline} onAction={onAction} />
                        ) : emptyHint ? (
                            <EmptyBody hint={emptyHint} />
                        ) : undefined
                    }
                    handlers={handlers}
                    groupOpen={groupOpen}
                    onToggleGroup={toggleGroup}
                />
                {(snapshot.projects?.length ?? 0) > 0 ? (
                    <TreeSection
                        kind="project"
                        onRowMenu={openMenuAt}
                        nodes={snapshot.projects ?? []}
                        collapsed={ui.collapsed.project === true}
                        selectedId={selectedId}
                        actions={snapshot.treeActions?.project ?? []}
                        count={count("project", snapshot.projects ?? [])}
                        rowsShown={rowsVisible(tier, "project")}
                        trimMeta={tier !== "full"}
                        handlers={handlers}
                        groupOpen={groupOpen}
                        onToggleGroup={toggleGroup}
                    />
                ) : null}
                <TreeSection
                    kind="worker"
                    onRowMenu={openMenuAt}
                    nodes={snapshot.workers}
                    collapsed={ui.collapsed.worker === true}
                    selectedId={selectedId}
                    actions={snapshot.treeActions?.worker ?? []}
                    count={count("worker", snapshot.workers)}
                    rowsShown={rowsVisible(tier, "worker")}
                    trimMeta={tier !== "full"}
                    handlers={handlers}
                    groupOpen={groupOpen}
                    onToggleGroup={toggleGroup}
                />
                <TreeSection
                    kind="task"
                    onRowMenu={openMenuAt}
                    nodes={snapshot.tasks}
                    collapsed={ui.collapsed.task === true}
                    selectedId={selectedId}
                    actions={snapshot.treeActions?.task ?? []}
                    count={count("task", snapshot.tasks)}
                    rowsShown={rowsVisible(tier, "task")}
                    trimMeta={tier !== "full"}
                    handlers={handlers}
                    groupOpen={groupOpen}
                    onToggleGroup={toggleGroup}
                />
            </div>

            <div className="gw-conn">
                <div className="gw-conn-head">connection</div>
                {connection.map((link) => (
                    <div key={link.label} className="gw-conn-row">
                        <span
                            className="gw-led"
                            aria-hidden={true}
                            data-on={LED[link.state] === "on" ? "" : undefined}
                            data-off={
                                LED[link.state] === "off" ? "" : undefined
                            }
                            data-spin={
                                LED[link.state] === "spin" ? "" : undefined
                            }
                        />
                        {link.label}
                        {/* 灯只有颜色和转速，读屏拿不到；socket 路径也分不出连接中还是断。 */}
                        <span className="gw-sr">
                            {LINK_WORD[link.state] ?? link.state}
                        </span>
                        <span className="gw-conn-val" title={link.value}>
                            {link.value}
                        </span>
                        {link.actions?.length ? (
                            <span className="gw-conn-act">
                                {link.actions.map((action) => (
                                    <button
                                        key={action.id}
                                        type="button"
                                        className="gw-iconbtn"
                                        title={action.tooltip}
                                        aria-label={`${link.label}：${action.tooltip}`}
                                        onClick={() => {
                                            onAction(action, {
                                                id: `connection:${link.label}`,
                                                label: link.label,
                                            });
                                        }}
                                    >
                                        {action.glyph}
                                    </button>
                                ))}
                            </span>
                        ) : null}
                    </div>
                ))}
            </div>

            <div className="gw-foot">
                <span className="gw-foot-account" title="daemon 鉴权未接入">
                    <span className="gw-avatar">?</span>
                    <span className="gw-foot-name">未登录 · 待 daemon 鉴权</span>
                </span>
                <button
                    type="button"
                    className="gw-iconbtn"
                    title="打开扩展设置"
                    aria-label="打开扩展设置"
                    onClick={onOpenSettings}
                >
                    ⚙
                </button>
            </div>

            {menu ? (
                <div
                    className="gw-menu"
                    role="menu"
                    // 报出这张浮层是谁的：读屏念「菜单」之前先知道开在哪一行上。
                    aria-label={rowName(menu.node)}
                    ref={menuRef}
                    style={{ left: menu.x, top: menu.y } as CSSProperties}
                    onContextMenu={(event) => {
                        // 浮层开着的时候再右键它自己：别让原生 Copy/Paste 叠上来。
                        event.preventDefault();
                    }}
                >
                    {menu.entries.map((entry) => (
                        <button
                            key={entry.key}
                            type="button"
                            role="menuitem"
                            className="gw-menu-item"
                            title={entry.tooltip}
                            onClick={() => {
                                runEntry(entry);
                            }}
                        >
                            {entry.label}
                        </button>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
