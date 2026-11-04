import type { NodeAction, TreeNode, TreeKind } from "./snapshot";

/**
 * 右键浮层（T018 / FR-006）。这里只放纯逻辑：条目怎么拼、浮层怎么摆、按 id 怎么找回节点。
 *
 * 一条硬口径：**浮层里不出现宿主没发下来的动作**。改名 / 复制 / 删除 / 取消任务在
 * daemon 补上 `session/rename|duplicate|delete|cancel` 之前不进快照（见本仓 T016 的偏差记录），
 * 所以它们也不出现在这儿 —— 浮层只是把同一批动作换个入口，不是一张许愿单。
 */
export interface MenuEntry {
    key: string;
    label: string;
    tooltip?: string;
    /** 回宿主命令的那一项。 */
    action?: NodeAction;
    /** "打开这一行"：走的是行本身那条 `onSelect`，不是宿主命令。 */
    open?: { node: TreeNode; kind: TreeKind };
}

/**
 * 动作 → 菜单项。`tooltip` 是这些动作唯一带着人话的地方（行内只有个图标），所以直接当正文；
 * 连接行那种自带 `label` 的优先用 `label`。同一个命令 id 只留一条。
 */
function addActions(into: MenuEntry[], actions: NodeAction[]): void {
    for (const action of actions) {
        // __menu__ 是组头 hover 的“打开右键”专用动作，不是菜单条目本身。
        if (action.id === "__menu__") continue;
        if (into.some((entry) => entry.action?.id === action.id)) continue;
        into.push({
            key: action.id,
            label: action.label ?? action.tooltip,
            tooltip: action.tooltip,
            action,
        });
    }
}

/**
 * 一行的浮层 = 「打开这一行」+ 这一行自己的动作 + 所在树的树头动作。
 * 带 children 的行不给"打开"：宿主对这类行的 `controlPanel.select` 不落任何命令
 * （分组行 id 是 `chat-group:` / `task-group:`，worker 行没有任务引用），展开交给行首那个三角。
 */
export function rowMenu(
    node: TreeNode,
    kind: TreeKind,
    treeActions: NodeAction[],
): MenuEntry[] {
    const entries: MenuEntry[] = [];
    if (!node.children) {
        entries.push({
            key: "open",
            label: "打开",
            tooltip: node.label,
            open: { node, kind },
        });
    }
    addActions(entries, node.actions ?? []);
    addActions(entries, treeActions);
    return entries;
}

/** 浮层不许出界：先按指针落点放，越界就往面板里收，收到贴边。 */
export function placeMenu(
    pointer: { x: number; y: number },
    size: { w: number; h: number },
    panel: { w: number; h: number },
): { left: number; top: number } {
    const gap = 4;
    return {
        left: Math.max(gap, Math.min(pointer.x, panel.w - size.w - gap)),
        top: Math.max(gap, Math.min(pointer.y, panel.h - size.h - gap)),
    };
}

/** 按 id 在一棵树里找回节点（键盘开浮层时用，调用方已经知道是哪棵树）。 */
export function findInTree(
    nodes: TreeNode[],
    id: string,
): TreeNode | undefined {
    for (const node of nodes) {
        if (node.id === id) return node;
        const hit = node.children ? findInTree(node.children, id) : undefined;
        if (hit) return hit;
    }
    return undefined;
}
