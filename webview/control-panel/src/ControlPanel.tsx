import { useState, type CSSProperties, type ReactElement } from "react";
import type {
    ControlPanelSnapshot,
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
    worker: "Worker",
    task: "Task",
};

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

function glyphFor(node: TreeNode, kind: TreeKind, selected: boolean): string {
    if (kind === "chat" && !node.group) {
        return selected ? "●" : "◇";
    }
    return node.state ? STATE_GLYPH[node.state] : "◇";
}

interface RowsProps extends ControlPanelHandlers {
    nodes: TreeNode[];
    kind: TreeKind;
    depth: number;
    selectedId: string | undefined;
    groupOpen: Record<string, boolean>;
    onToggleGroup(id: string, open: boolean): void;
}

function NodeRows({
    nodes,
    kind,
    depth,
    selectedId,
    groupOpen,
    onToggleGroup,
    ...handlers
}: RowsProps): ReactElement {
    const rows: ReactElement[] = [];
    for (const node of nodes) {
        const selected = node.id === selectedId;
        const open = groupOpen[node.id] ?? !node.collapsed;
        rows.push(
            <div
                key={node.id}
                className="gw-node"
                data-sel={selected ? "" : undefined}
                data-group={node.group ? "" : undefined}
                data-state={node.state}
                style={{ "--gw-indent": depth } as CSSProperties}
            >
                {node.children ? (
                    <button
                        type="button"
                        className="gw-node-twist"
                        onClick={() => {
                            onToggleGroup(node.id, open);
                        }}
                    >
                        {open ? "▾" : "▸"}
                    </button>
                ) : (
                    <span className="gw-node-twist" />
                )}
                {node.group ? null : (
                    <span className="gw-node-icon" data-state={node.state}>
                        {glyphFor(node, kind, selected)}
                    </span>
                )}
                <button
                    type="button"
                    className="gw-node-label"
                    title={node.label}
                    onClick={() => {
                        handlers.onSelect(node, kind);
                    }}
                >
                    {node.label}
                </button>
                {node.group && node.children ? (
                    <span className="gw-node-meta">{node.children.length}</span>
                ) : node.meta ? (
                    <span className="gw-node-meta" title={node.meta}>
                        {node.meta}
                    </span>
                ) : null}
                {node.actions?.length ? (
                    <span className="gw-node-act">
                        {node.actions.map((action) => (
                            <button
                                key={action.id}
                                type="button"
                                className="gw-iconbtn"
                                title={action.tooltip}
                                onClick={() => {
                                    handlers.onAction(action, node);
                                }}
                            >
                                {action.glyph}
                            </button>
                        ))}
                    </span>
                ) : null}
            </div>,
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
                    onToggleGroup={onToggleGroup}
                    {...handlers}
                />,
            );
        }
    }
    return <>{rows}</>;
}

interface SectionProps extends ControlPanelHandlers {
    kind: TreeKind;
    nodes: TreeNode[];
    collapsed: boolean;
    selectedId: string | undefined;
    actions: NodeAction[];
    count: number | string;
}

function TreeSection({
    kind,
    nodes,
    collapsed,
    selectedId,
    actions,
    count,
    onSelect,
    onToggleTree,
    onAction,
    onNewChat,
    onOpenSettings,
}: SectionProps): ReactElement {
    const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>({});
    return (
        <div className="gw-tree">
            <div className="gw-tree-head">
                <button
                    type="button"
                    className="gw-hicon"
                    title={collapsed ? "展开" : "折叠"}
                    onClick={() => {
                        onToggleTree(kind);
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
                            onClick={() => {
                                onAction(action, {
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
                <NodeRows
                    nodes={nodes}
                    kind={kind}
                    depth={0}
                    selectedId={selectedId}
                    groupOpen={groupOpen}
                    onToggleGroup={(id, open) => {
                        setGroupOpen((prev) => ({ ...prev, [id]: !open }));
                    }}
                    onSelect={onSelect}
                    onToggleTree={onToggleTree}
                    onAction={onAction}
                    onNewChat={onNewChat}
                    onOpenSettings={onOpenSettings}
                />
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
    const handlers: ControlPanelHandlers = {
        onSelect,
        onToggleTree,
        onAction,
        onNewChat,
        onOpenSettings,
    };
    const count = (kind: TreeKind, nodes: TreeNode[]): number | string => {
        if (offline) return "—";
        /** Worker 树的计数口径是「几个 worker」，子层是派给它的任务；
            Chat / Task 树数的是叶子。稿子 02① 的 3 / 2 / 6 就是这个差。 */
        return kind === "worker" ? nodes.length : leafCount(nodes);
    };
    return (
        <div className="gw-shell">
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
                <TreeSection
                    kind="chat"
                    nodes={snapshot.chats}
                    collapsed={ui.collapsed.chat === true}
                    selectedId={selectedId}
                    actions={snapshot.treeActions?.chat ?? []}
                    count={count("chat", snapshot.chats)}
                    {...handlers}
                />
                {offline ? (
                    <div className="gw-offline">
                        <div>
                            <b>{offline.title}</b>
                        </div>
                        <code>{offline.detail}</code>
                        <div className="gw-offline-actions">
                            <button
                                type="button"
                                className="gw-btn"
                                onClick={() => {
                                    onAction(
                                        {
                                            id: "goworker.reconnect",
                                            glyph: "⟳",
                                            tooltip: "重连 dispatcher",
                                        },
                                        { id: "connection", label: "connection" },
                                    );
                                }}
                            >
                                ⟳ Reconnect
                            </button>
                            <button
                                type="button"
                                className="gw-btn"
                                data-secondary=""
                                onClick={() => {
                                    onAction(
                                        {
                                            id: "goworker.showDaemonLog",
                                            glyph: "▤",
                                            tooltip: "打开 daemon 日志",
                                        },
                                        { id: "connection", label: "connection" },
                                    );
                                }}
                            >
                                daemon 日志
                            </button>
                        </div>
                    </div>
                ) : null}
                {!offline &&
                snapshot.emptyHint &&
                snapshot.chats.length === 0 ? (
                    <div className="gw-empty">
                        <div>{snapshot.emptyHint.title}</div>
                        <div className="gw-empty-sub">
                            {snapshot.emptyHint.detail}
                        </div>
                    </div>
                ) : null}
                <TreeSection
                    kind="worker"
                    nodes={snapshot.workers}
                    collapsed={ui.collapsed.worker === true}
                    selectedId={selectedId}
                    actions={snapshot.treeActions?.worker ?? []}
                    count={count("worker", snapshot.workers)}
                    {...handlers}
                />
                <TreeSection
                    kind="task"
                    nodes={snapshot.tasks}
                    collapsed={ui.collapsed.task === true}
                    selectedId={selectedId}
                    actions={snapshot.treeActions?.task ?? []}
                    count={count("task", snapshot.tasks)}
                    {...handlers}
                />
            </div>

            <div className="gw-conn">
                <div className="gw-conn-head">connection</div>
                {connection.map((link) => (
                    <div key={link.label} className="gw-conn-row">
                        <span
                            className="gw-led"
                            data-on={LED[link.state] === "on" ? "" : undefined}
                            data-off={
                                LED[link.state] === "off" ? "" : undefined
                            }
                            data-spin={
                                LED[link.state] === "spin" ? "" : undefined
                            }
                        />
                        {link.label}
                        <span className="gw-conn-val" title={link.value}>
                            {link.value}
                        </span>
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
                    onClick={onOpenSettings}
                >
                    ⚙
                </button>
            </div>
        </div>
    );
}
