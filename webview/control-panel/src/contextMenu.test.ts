import { describe, expect, it } from "vitest";
import { findInTree, placeMenu, rowMenu } from "./contextMenu";
import type { NodeAction, TreeNode } from "./snapshot";

/**
 * 右键浮层的纯逻辑（T018）。条目拼错顺序、越界不夹、把宿主没发下来的动作凭空造出来 ——
 * 这三样都在这里挡。「点了某项回了哪条上行」在 ControlPanel.test.tsx 里写真 DOM 用例。
 */

const REFRESH: NodeAction = {
    id: "goworker.refreshTasks",
    glyph: "⟳",
    tooltip: "刷新任务列表",
};
const OPEN_TASK: NodeAction = {
    id: "goworker.openTask",
    glyph: "↗",
    label: "在编辑器里打开",
    tooltip: "打开这条任务",
};

function node(id: string, label: string, extra: Partial<TreeNode> = {}): TreeNode {
    return { id, label, ...extra };
}

describe("rowMenu：条目从哪儿来", () => {
    it("叶子一行 = 打开 + 这一行的动作 + 树头动作，按这个顺序", () => {
        const leaf = node("task:t1", "查询桂东天气", { actions: [OPEN_TASK] });
        expect(rowMenu(leaf, "task", [REFRESH]).map((e) => e.label)).toEqual([
            "打开",
            "在编辑器里打开",
            "刷新任务列表",
        ]);
    });

    it("动作只有图标时拿 tooltip 当正文；自带 label 的优先用 label", () => {
        const leaf = node("task:t1", "查询桂东天气", { actions: [REFRESH, OPEN_TASK] });
        const labels = rowMenu(leaf, "task", []).map((e) => e.label);
        expect(labels).toEqual(["打开", "刷新任务列表", "在编辑器里打开"]);
        // 正文之外，tooltip 原样带着，浮层里悬停还能看到完整一句。
        expect(rowMenu(leaf, "task", [])[1].tooltip).toBe("刷新任务列表");
    });

    it("同一个命令 id 只留一条：行内那条赢（它更具体）", () => {
        const same = node("task:t1", "查询桂东天气", { actions: [REFRESH] });
        const entries = rowMenu(same, "task", [REFRESH, OPEN_TASK]);
        expect(entries.map((e) => e.action?.id)).toEqual([
            undefined,
            "goworker.refreshTasks",
            "goworker.openTask",
        ]);
    });

    it("带 children 的行不给「打开」：宿主对这类行的 select 不落任何命令", () => {
        const group = node("task-group:working", "working", {
            group: true,
            children: [node("task:t1", "查询桂东天气", { depth: 1 })],
        });
        expect(rowMenu(group, "task", [REFRESH]).map((e) => e.label)).toEqual([
            "刷新任务列表",
        ]);
        // Worker 行同理：它下面挂的是任务，行本身开不出东西。
        const worker = node("worker:claude", "claude", {
            children: [node("worker:claude:task:t1", "查询桂东天气", { depth: 1 })],
        });
        expect(rowMenu(worker, "worker", [])).toEqual([]);
    });

    it("一个动作都没有的叶子也还有一条「打开」；纯空白行则是空表（上层据此不弹空菜单）", () => {
        expect(rowMenu(node("chat:c1", "会话"), "chat", []).map((e) => e.label)).toEqual([
            "打开",
        ]);
        expect(rowMenu(node("worker:w", "claude", { children: [] }), "worker", [])).toEqual(
            [],
        );
    });

    it("反向对照：宿主没发下来的动作，一个字都不冒出来", () => {
        // 改名 / 复制 / 删除 / 取消任务在 daemon 补 RPC 之前不进快照（T016 偏差记录）。
        // 这里断言的是：谁把它们硬编进浮层，这条就红。
        const leaf = node("chat:c1", "会话", { actions: [REFRESH] });
        const text = rowMenu(leaf, "chat", [OPEN_TASK])
            .map((e) => `${e.label}${e.tooltip ?? ""}`)
            .join("|");
        expect(text).not.toMatch(/改名|复制|删除|取消任务/);
        expect(text).toContain("刷新任务列表");
    });
});

describe("placeMenu：不许出界", () => {
    const size = { w: 160, h: 90 };
    const panel = { w: 300, h: 400 };

    it("放得下就贴着指针落点", () => {
        expect(placeMenu({ x: 20, y: 30 }, size, panel)).toEqual({ left: 20, top: 30 });
    });

    it("右/下越界往面板里收，收到留 4px 贴边", () => {
        expect(placeMenu({ x: 290, y: 395 }, size, panel)).toEqual({
            left: 300 - 160 - 4,
            top: 400 - 90 - 4,
        });
    });

    it("负坐标（菜单键在折叠行上量出来的）也夹回 4px，不飘出上边界", () => {
        expect(placeMenu({ x: -30, y: -12 }, size, panel)).toEqual({ left: 4, top: 4 });
    });

    it("反向对照：夹取用的是面板尺寸，不是浮层尺寸算右边界", () => {
        // 面板比浮层还窄时左边界优先（Math.max(4, …)），至少还在面板里。
        expect(placeMenu({ x: 500, y: 0 }, size, { w: 100, h: 400 }).left).toBe(4);
    });
});

describe("findInTree：按 id 找回那一行", () => {
    const tree = [
        node("task-group:working", "working", {
            group: true,
            children: [node("task:t1", "查询桂东天气", { depth: 1 })],
        }),
        node("task:t2", "另一条"),
    ];

    it("顶层与子层都找得到", () => {
        expect(findInTree(tree, "task:t2")?.label).toBe("另一条");
        expect(findInTree(tree, "task:t1")?.label).toBe("查询桂东天气");
    });

    it("找不着返回 undefined，不抛", () => {
        expect(findInTree(tree, "task:nope")).toBeUndefined();
        expect(findInTree([], "task:t1")).toBeUndefined();
    });

    it("id 重复时给先出现的那个（两棵树各画一条同 id 的任务，树已按 kind 选过）", () => {
        const dup = [
            node("task:t1", "先来的一条"),
            node("task-group:g", "g", {
                group: true,
                children: [node("task:t1", "后到的一条", { depth: 1 })],
            }),
        ];
        expect(findInTree(dup, "task:t1")?.label).toBe("先来的一条");
    });
});
