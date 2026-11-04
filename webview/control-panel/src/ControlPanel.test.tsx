// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ControlPanel } from "./ControlPanel";
import type {
    ControlPanelSnapshot,
    TreeNode,
    TreeKind,
} from "./snapshot";

/**
 * 控制面板组件用例（T012）。跑真 DOM：真的 render、真的派发 KeyboardEvent、
 * 真的看 document.activeElement。键盘导航与焦点环没法测"把规则抄一份出来"的镜像函数 ——
 * 那种用例红了不代表界面没坏，绿了也不代表界面是对的。
 */

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * jsdom 没有 ResizeObserver，补一个只记回调的假件 —— 这样档位只剩"按面板实宽量"这一条
 * 入口，产品代码里不用给测试留直接指定档位的口子。
 */
const measure: Array<() => void> = [];
let panelWidth = 0;
class FakeObserver {
    private drop: () => void = () => {};
    constructor(cb: () => void) {
        measure.push(cb);
        this.drop = () => {
            const at = measure.indexOf(cb);
            if (at >= 0) measure.splice(at, 1);
        };
    }
    observe(): void {}
    disconnect(): void {
        this.drop();
    }
}
vi.stubGlobal("ResizeObserver", FakeObserver);

/**
 * 一行到底有没有被 memo 挡在门外，DOM 上是看不出来的（React 本来就复用节点、
 * 内容没变就不写 DOM）。行渲染必经 `splitMeta`，拿它当计数探针：跳过的行不会涨。
 */
const rowRenders = vi.hoisted(() => ({ n: 0 }));
vi.mock("./tiers", async (importOriginal) => {
    const real = await importOriginal<typeof import("./tiers")>();
    return {
        ...real,
        splitMeta: (meta: string) => {
            rowRenders.n += 1;
            return real.splitMeta(meta);
        },
    };
});

function node(
    id: string,
    label: string,
    extra: Partial<TreeNode> = {},
): TreeNode {
    return { id, label, ...extra };
}

const CHATS: TreeNode[] = [
    node("chat:retry", "dispatcher 超时重试策略", {
        actions: [{ id: "goworker.renameChat", glyph: "✎", tooltip: "改名" }],
    }),
    node("chat:archived", "archived", {
        group: true,
        collapsed: true,
        children: [
            node("chat:links", "acp-ui 本地链接改相对路径", { depth: 1 }),
        ],
    }),
];
const WORKERS: TreeNode[] = [
    node("worker:claude", "claude", {
        state: "running",
        meta: "1 task · working",
        children: [
            node("worker:claude:task:t1", "查询桂东天气", {
                state: "running",
                depth: 1,
            }),
        ],
    }),
    // 第二条故意也叫 c 开头：type-ahead 连按同一个字母要在同类行里轮转。
    node("worker:claude-code", "claude-code", { state: "done", meta: "claude-code · idle" }),
];
const TASKS: TreeNode[] = [
    node("task-group:working", "working", {
        group: true,
        meta: "1",
        children: [
            node("task:t1", "查询桂东天气", {
                state: "running",
                meta: "claude",
                depth: 1,
            }),
        ],
    }),
];

/** 这份 fixture 画出来的 7 行 —— 多处断言按它写死。 */
const VISIBLE = [
    "chat:retry",
    "chat:archived",
    "worker:claude",
    "worker:claude:task:t1",
    "worker:claude-code",
    "task-group:working",
    "task:t1",
];

function snap(over: Partial<ControlPanelSnapshot> = {}): ControlPanelSnapshot {
    return {
        brand: { name: "GOWORKER", version: "v0.1.0" },
        chats: CHATS,
        workers: WORKERS,
        tasks: TASKS,
        connection: [
            { label: "dispatcher", value: "/run/acp.sock", state: "up" },
            { label: "agent", value: "/run/vscode.sock", state: "down" },
        ],
        account: { placeholder: true },
        ui: { collapsed: {}, canCreateChat: true },
        offline: null,
        emptyHint: null,
        ...over,
    };
}

type Props = Parameters<typeof ControlPanel>[0];
let host: HTMLDivElement;
let root: Root;

/** 渲染并把五个上行回调换成 spy —— 返回值就是 spy，断言直接点 `.mock`。 */
function render(over: Partial<Props> = {}) {
    const spies = {
        onSelect: vi.fn(),
        onToggleTree: vi.fn(),
        onAction: vi.fn(),
        onNewChat: vi.fn(),
        onOpenSettings: vi.fn(),
    };
    const props: Props = { snapshot: snap(), selectedId: undefined, ...spies, ...over };
    act(() => {
        root.render(<ControlPanel {...props} />);
    });
    return spies;
}

function shell(): HTMLElement {
    return host.querySelector<HTMLElement>(".gw-shell") as HTMLElement;
}

/** 当前真画出来的行，按 DOM 顺序取 id。 */
function rowIds(): string[] {
    return [...host.querySelectorAll<HTMLElement>("[data-row-id]")].map(
        (el) => el.dataset.rowId as string,
    );
}

function focusedRow(): string | null {
    return document.activeElement?.getAttribute("data-row-id") ?? null;
}

function focusRow(id: string): void {
    const el = host.querySelector<HTMLElement>(`[data-row-id="${id}"]`);
    if (!el) throw new Error(`行 ${id} 没画出来，当前是 ${rowIds().join(",")}`);
    act(() => {
        el.focus();
    });
}

/** 真按键：从当前焦点元素冒泡上去，跟浏览器一致。 */
function press(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
    const from = (document.activeElement ?? shell()) as HTMLElement;
    const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
        ...init,
    });
    act(() => {
        from.dispatchEvent(event);
    });
    return event;
}

beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => {
        root.unmount();
    });
    host.remove();
});

describe("四段结构", () => {
    it("品牌头 → New chat → 三棵树 → connection → 底部，按这个顺序画", () => {
        render();
        expect([...shell().children].map((el) => el.className)).toEqual([
            "gw-brand",
            "gw-primary",
            "gw-trees",
            "gw-conn",
            "gw-foot",
        ]);
        expect(
            [...host.querySelectorAll<HTMLElement>(".gw-tree")].map(
                (el) => el.dataset.kind,
            ),
        ).toEqual(["chat", "worker", "task"]);
    });

    it("New chat 只在宿主说能建时可用；点了回 onNewChat", () => {
        const off = render({ snapshot: snap({ ui: { collapsed: {}, canCreateChat: false } }) });
        const disabled = shell().querySelector<HTMLButtonElement>(".gw-primary");
        expect(disabled?.disabled).toBe(true);
        act(() => disabled?.click());
        expect(off.onNewChat).not.toHaveBeenCalled();

        const on = render();
        const btn = shell().querySelector<HTMLButtonElement>(".gw-primary") as HTMLButtonElement;
        expect(btn.disabled).toBe(false);
        act(() => btn.click());
        expect(on.onNewChat).toHaveBeenCalledTimes(1);
    });

    it("account 只有占位，⚙ 回 onOpenSettings", () => {
        const props = render();
        const foot = host.querySelector<HTMLElement>(".gw-foot") as HTMLElement;
        expect(foot.textContent).toContain("未登录");
        const gear = foot.querySelector<HTMLButtonElement>(".gw-iconbtn") as HTMLButtonElement;
        expect(gear.textContent).toBe("⚙");
        act(() => gear.click());
        expect(props.onOpenSettings).toHaveBeenCalledTimes(1);
    });
});

describe("折叠", () => {
    it("折叠一棵树只让那棵树没有行，树头还在，别的树照旧", () => {
        render({
            snapshot: snap({ ui: { collapsed: { worker: true }, canCreateChat: true } }),
        });
        const worker = host.querySelector<HTMLElement>('[data-kind="worker"]');
        expect(worker?.querySelectorAll("[data-row-id]")).toHaveLength(0);
        expect(worker?.querySelector(".gw-tree-head")).not.toBeNull();
        expect(rowIds()).toEqual([
            "chat:retry",
            "chat:archived",
            "task-group:working",
            "task:t1",
        ]);
    });

    it("点树头的折叠钮回 onToggleTree，webview 自己不收", () => {
        const props = render();
        const btn = host
            .querySelector<HTMLElement>('[data-kind="task"]')
            ?.querySelector<HTMLButtonElement>(".gw-hicon") as HTMLButtonElement;
        act(() => btn.click());
        expect(props.onToggleTree).toHaveBeenCalledWith("task");
    });

    it("分组标题默认收起时不画子行，点开才画", () => {
        render();
        expect(rowIds()).not.toContain("chat:links");
        const twist = host
            .querySelector<HTMLElement>('[data-row-id="chat:archived"]')
            ?.closest(".gw-node")
            ?.querySelector<HTMLButtonElement>(".gw-node-twist") as HTMLButtonElement;
        act(() => twist.click());
        expect(rowIds()).toContain("chat:links");
    });

    it("计数口径：Worker 数节点，Chat / Task 数叶子；断连时三处都是 —", () => {
        const counts = () =>
            [...host.querySelectorAll<HTMLElement>(".gw-count")].map((el) => el.textContent);
        render();
        expect(counts()).toEqual(["2", "2", "1"]);
        render({ snapshot: snap({ offline: { title: "dispatcher 未连接", detail: "/run/acp.sock" } }) });
        expect(counts()).toEqual(["—", "—", "—"]);
    });
});

describe("离线块与空态各占一格", () => {
    it("离线块在 Chat 树内部；Worker / Task 仍画旧行，品牌头与 connection 不受影响", () => {
        render({
            snapshot: snap({
                offline: {
                    title: "dispatcher 未连接",
                    detail: "/run/acp.sock",
                    actions: [
                        {
                            id: "goworker.reconnect",
                            glyph: "⟳",
                            label: "Reconnect",
                            tooltip: "重连 dispatcher",
                        },
                    ],
                },
            }),
        });
        const chat = host.querySelector<HTMLElement>('[data-kind="chat"]');
        expect(chat?.querySelector(".gw-offline")).not.toBeNull();
        expect(chat?.querySelectorAll("[data-row-id]")).toHaveLength(0);
        expect(
            host.querySelectorAll('[data-kind="worker"] [data-row-id]').length,
        ).toBeGreaterThan(0);
        expect(
            host.querySelectorAll('[data-kind="task"] [data-row-id]').length,
        ).toBeGreaterThan(0);
        expect(host.querySelector(".gw-brand")).not.toBeNull();
        expect(host.querySelectorAll(".gw-conn-row")).toHaveLength(2);
    });

    it("离线优先于空态：连不上时说没连上，不说没数据", () => {
        render({
            snapshot: snap({
                chats: [],
                offline: { title: "dispatcher 未连接", detail: "/run/acp.sock" },
                emptyHint: { title: "还没有会话", detail: "点 New chat" },
            }),
        });
        expect(host.querySelector(".gw-offline")).not.toBeNull();
        expect(host.querySelector(".gw-empty")).toBeNull();
    });

    it("会话不空就不画空态", () => {
        render({
            snapshot: snap({ emptyHint: { title: "还没有会话", detail: "点 New chat" } }),
        });
        expect(host.querySelector(".gw-empty")).toBeNull();
        expect(rowIds()).toContain("chat:retry");
    });
});

describe("行点击回宿主", () => {
    it("点行标回 onSelect(node, kind)，点行内动作回 onAction", () => {
        const props = render();
        act(() =>
            (
                host.querySelector<HTMLElement>(
                    '[data-row-id="worker:claude"]',
                ) as HTMLButtonElement
            ).click(),
        );
        expect(props.onSelect).toHaveBeenCalledTimes(1);
        const [picked, kind] = props.onSelect.mock.calls[0] as [
            { id: string },
            TreeKind,
        ];
        expect(picked.id).toBe("worker:claude");
        expect(kind).toBe("worker");
    });

    it("树头动作回 onAction，带的节点是那一棵树", () => {
        const props = render({
            snapshot: snap({
                treeActions: {
                    task: [{ id: "goworker.refreshTasks", glyph: "⟳", tooltip: "刷新任务列表" }],
                },
            }),
        });
        const btn = host
            .querySelector<HTMLElement>('[data-kind="task"]')
            ?.querySelector<HTMLButtonElement>(".gw-tree-actions .gw-iconbtn") as HTMLButtonElement;
        act(() => btn.click());
        const [action, on] = props.onAction.mock.calls[0] as [{ id: string }, { id: string }];
        expect(action.id).toBe("goworker.refreshTasks");
        expect(on.id).toBe("tree:task");
    });
});

describe("键盘导航与焦点", () => {
    /**
     * 真跑出来的缺陷：浏览器 fixture 里 Worker 树的子行直接抄了 Task 树那批 id，
     * 于是同一条任务在两棵树里 data-row-id 一模一样，旧实现按 id `findIndex` 找下一行，
     * ↓ 就在那两行之间打转走不到底。导航现在全程按下标走，id 重不重复都无所谓。
     */
    it("两棵树画出同一个 id：↓ 仍然逐行走完，不停在原地打转", () => {
        render({
            snapshot: snap({
                chats: [],
                workers: [
                    node("worker:claude", "claude", {
                        children: [node("task:dup", "重复 id 的这一条", { depth: 1 })],
                    }),
                ],
                tasks: [
                    node("task-group:working", "working", {
                        group: true,
                        children: [node("task:dup", "重复 id 的这一条", { depth: 1 })],
                    }),
                ],
            }),
        });
        const els = [...host.querySelectorAll<HTMLElement>("[data-row-id]")];
        expect(els.map((el) => el.dataset.rowId)).toEqual([
            "worker:claude",
            "task:dup",
            "task-group:working",
            "task:dup",
        ]);
        act(() => els[0].focus());
        for (let i = 1; i < els.length; i += 1) {
            press("ArrowDown");
            expect(document.activeElement).toBe(els[i]);
        }
        // 最后那一行属于 Task 树 —— 证明焦点真的落在第二个同 id 元素上，而不是第一个。
        expect(
            els[els.length - 1].closest(".gw-tree")?.getAttribute("data-kind"),
        ).toBe("task");
    });

    it("整行是 role=treeitem 的 div —— Enter / Space 由键盘处理器补出点击", () => {
        render();
        expect(rowIds()).toEqual(VISIBLE);
        for (const el of [...host.querySelectorAll<HTMLElement>("[data-row-id]")]) {
            expect(el.tagName).toBe("DIV");
            expect(el.getAttribute("role")).toBe("treeitem");
            // 一棵树只有一个停靠点，所以最多一行的 tabIndex 是 0，其余 -1。
            expect(el.tabIndex).toBeLessThanOrEqual(0);
        }
    });

    it("↑↓ 沿可见行走，跨树不停；末行往下不绕回", () => {
        render();
        focusRow(VISIBLE[0]);
        for (const id of VISIBLE.slice(1)) {
            press("ArrowDown");
            expect(focusedRow()).toBe(id);
        }
        press("ArrowDown");
        expect(focusedRow()).toBe(VISIBLE[VISIBLE.length - 1]);
        press("ArrowUp");
        expect(focusedRow()).toBe(VISIBLE[VISIBLE.length - 2]);
    });

    it("焦点不在行上时，↓ 从第一行开始", () => {
        render();
        act(() => (document.activeElement as HTMLElement)?.blur());
        press("ArrowDown");
        expect(focusedRow()).toBe("chat:retry");
    });

    it("Home / End 落到首末行", () => {
        render();
        focusRow("worker:claude");
        press("Home");
        expect(focusedRow()).toBe("chat:retry");
        press("End");
        expect(focusedRow()).toBe("task:t1");
    });

    it("type-ahead 连按同一个字母在同类行里轮转，最后一行再按绕回第一条", () => {
        render();
        focusRow("chat:retry");
        press("c");
        expect(focusedRow()).toBe("worker:claude");
        press("c");
        expect(focusedRow()).toBe("worker:claude-code");
        press("c");
        expect(focusedRow()).toBe("worker:claude");
    });

    it("第二个字符只做细化，不把刚定位到的行让出去", () => {
        render();
        focusRow("chat:retry");
        press("查");
        expect(focusedRow()).toBe("worker:claude:task:t1");
        press("询");
        expect(focusedRow()).toBe("worker:claude:task:t1");
    });

    it("收起的分组里的行不参与命中；点开同一条缓冲区就能命中", () => {
        render();
        focusRow("chat:retry");
        press("a");
        expect(focusedRow()).toBe("chat:archived");
        // chat:links（"acp-ui …"）在 archived 组里，那一组默认收起：缓冲区补成 "ac" 也不该跳进去。
        press("c");
        expect(focusedRow()).toBe("chat:archived");

        const twist = host
            .querySelector<HTMLElement>('[data-row-id="chat:archived"]')
            ?.closest(".gw-node")
            ?.querySelector<HTMLButtonElement>(".gw-node-twist") as HTMLButtonElement;
        act(() => twist.click());
        focusRow("chat:retry");
        press("a");
        press("c");
        expect(focusedRow()).toBe("chat:links");
    });

    it("带修饰键的按键不当字面量吃（⌘C 之类不该污染缓冲区）", () => {
        render();
        focusRow("chat:retry");
        press("w", { metaKey: true });
        expect(focusedRow()).toBe("chat:retry");
        press("w");
        expect(focusedRow()).toBe("task-group:working");
    });

    it("反向对照：折叠掉 Worker 树后，敲 c 不再命中那一行", () => {
        render({
            snapshot: snap({ ui: { collapsed: { worker: true }, canCreateChat: true } }),
        });
        focusRow("chat:retry");
        press("c");
        expect(focusedRow()).toBe("chat:retry");
    });

    it("导航按键被吃掉（否则宿主把 webview 滚走），未命中的按键不拦", () => {
        render();
        focusRow("chat:retry");
        expect(press("ArrowDown").defaultPrevented).toBe(true);
        expect(press("Home").defaultPrevented).toBe(true);
        expect(press("z").defaultPrevented).toBe(false);
    });

    it("焦点在行内动作钮上时，↓ 走下一行而不是跳回首行", () => {
        render();
        const action = host
            .querySelector<HTMLElement>('[data-row-id="chat:retry"]')
            ?.closest(".gw-node")
            ?.querySelector<HTMLElement>(".gw-node-act .gw-iconbtn");
        expect(action).toBeDefined();
        act(() => action?.focus());
        press("ArrowDown");
        expect(focusedRow()).toBe("chat:archived");
    });

    it("焦点环样式在 CSS 里（文本守卫：jsdom 不解析 var()，算不出真环）", () => {
        const css = readFileSync(
            join(
                process.cwd(),
                "webview/control-panel/src/control-panel.css",
            ),
            "utf8",
        );
        expect(css).toMatch(/\.gw-node:focus\s*[,{]/);
        expect(css).toMatch(/outline\s*:\s*[^;]*var\(--gw-focus\)/);
        // 键盘选中也要顶出动作钮，否则动作钮 display:none，浮层之外的路都到不了它。
        expect(css).toMatch(/\.gw-node:focus-within \.gw-node-act/);
        // 给读屏的那份文字不能图省事写成 display:none：整棵子树会一起从无障碍树里消失。
        expect(css).toMatch(/\.gw-sr\s*\{[^}]*clip-path/);
        expect(css).not.toMatch(/\.gw-sr\s*\{[^}]*display\s*:\s*none/);
    });
});

describe("无障碍语义（T056）", () => {
    const rowEl = (id: string): HTMLElement =>
        host.querySelector<HTMLElement>(`[data-row-id="${id}"]`) as HTMLElement;

    /** 某一棵树里当前吃 Tab 的行。 */
    const stops = (kind: TreeKind): string[] =>
        [
            ...host.querySelectorAll<HTMLElement>(
                `.gw-tree[data-kind="${kind}"] [data-row-id][tabindex="0"]`,
            ),
        ].map((el) => el.dataset.rowId as string);

    it("三棵树各一个 Tab 停靠点，落点没人选时是首行", () => {
        render();
        for (const kind of ["chat", "worker", "task"] as TreeKind[]) {
            expect(stops(kind)).toHaveLength(1);
        }
        expect(stops("chat")).toEqual(["chat:retry"]);
        expect(stops("worker")).toEqual(["worker:claude"]);
        // 分组行本身也算一行，所以 Task 树停在它上面。
        expect(stops("task")).toEqual(["task-group:working"]);
        // 行内那些钮（动作 / 折叠三角）一律不吃 Tab —— 否则 720 行按不出第一棵树。
        expect(
            host.querySelectorAll<HTMLElement>(".gw-node button[tabindex='0']"),
        ).toHaveLength(0);
    });

    it("有选中行就停在选中行上，且只停在它所在的那棵树", () => {
        render({ selectedId: "task:t1" });
        expect(stops("task")).toEqual(["task:t1"]);
        expect(stops("chat")).toEqual(["chat:retry"]);
    });

    it("焦点走过一行，停靠点就跟过去（Tab 出去再回来还在原地）", () => {
        render();
        focusRow("worker:claude-code");
        expect(stops("worker")).toEqual(["worker:claude-code"]);
    });

    it("反向对照：停靠点被让给消失的行时，这一棵树不留 0 号", () => {
        // 选中行不在这一棵树里 → 这一棵树回落到首行，而不是一个都/no tab stop。
        render({ selectedId: "task:t1" });
        expect(stops("chat")).toEqual(["chat:retry"]);
        // 选中的行整个没了（宿主推了份没有它的快照）也一样回落到首行。
        render({
            selectedId: "gone",
            snapshot: snap({ chats: [node("chat:retry", "dispatcher 超时重试策略")] }),
        });
        expect(stops("chat")).toEqual(["chat:retry"]);
    });

    it("行列表包在 role=tree 里；离线块 / 空态不算 treeitem", () => {
        render();
        expect(
            [...host.querySelectorAll<HTMLElement>("[role='tree']")].map(
                (el) => el.getAttribute("aria-label"),
            ),
        ).toEqual(["Chat", "Worker", "Task"]);
        render({
            snapshot: snap({
                offline: { title: "daemon 没起", detail: "connect ENOENT ..." },
            }),
        });
        const body = host.querySelector<HTMLElement>(".gw-offline");
        expect(body).not.toBeNull();
        expect(body?.closest("[role='tree']")).toBeNull();
    });

    it("树头的折叠钮报出展开态，aria-controls 指得着那一片行", () => {
        render({ snapshot: snap({ ui: { collapsed: { worker: true }, canCreateChat: true } }) });
        const btn = host.querySelector<HTMLElement>(
            '.gw-tree[data-kind="worker"] .gw-hicon',
        );
        expect(btn?.getAttribute("aria-expanded")).toBe("false");
        const target = btn?.getAttribute("aria-controls");
        expect(target).toBeTruthy();
        expect(host.querySelector(`[data-kind="worker"] #${target}`)).toBeNull();
        render();
        const open = host.querySelector<HTMLElement>(
            '.gw-tree[data-kind="chat"] .gw-hicon',
        );
        expect(open?.getAttribute("aria-expanded")).toBe("true");
        expect(
            host.querySelector(`[data-kind="chat"] #${open?.getAttribute("aria-controls")}`),
        ).not.toBeNull();
    });

    it("行上的 meta 与状态进了可访问名，meta 已说过的就不再缀一遍", () => {
        render();
        expect(rowEl("worker:claude").getAttribute("aria-label")).toBe(
            "claude · 1 task · working",
        );
        // 没 meta 的行才补状态词；符号 ⟳ 与底色读屏都拿不到。
        expect(rowEl("worker:claude:task:t1").getAttribute("aria-label")).toBe(
            "查询桂东天气 · working",
        );
        expect(rowEl("worker:claude-code").getAttribute("aria-label")).toBe(
            // meta 说的是 worker 的空闲，glyph 是 ✓done —— 两个信息不同，都得念。
            "claude-code · claude-code · idle · done",
        );
        expect(rowEl("chat:retry").getAttribute("aria-label")).toBe(
            "dispatcher 超时重试策略",
        );
    });

    it("选中与分组层级用 aria 报出来", () => {
        render({ selectedId: "worker:claude:task:t1" });
        expect(rowEl("worker:claude:task:t1").getAttribute("aria-selected")).toBe(
            "true",
        );
        expect(rowEl("worker:claude").getAttribute("aria-selected")).toBe("false");
        expect(rowEl("worker:claude").getAttribute("aria-level")).toBe("1");
        expect(rowEl("worker:claude:task:t1").getAttribute("aria-level")).toBe("2");
        expect(rowEl("worker:claude").getAttribute("aria-expanded")).toBe("true");
        // 折叠的分组：aria-expanded=false，子行也不在 DOM 里。
        expect(rowEl("chat:archived").getAttribute("aria-expanded")).toBe("false");
        expect(rowIds()).not.toContain("chat:links");
    });

    it("Enter / 空格选中焦点行，走的是和点同一份 onSelect", () => {
        const spies = render();
        focusRow("task:t1");
        expect(press("Enter").defaultPrevented).toBe(true);
        expect(spies.onSelect.mock.calls.map((c) => (c[0] as TreeNode).id)).toEqual([
            "task:t1",
        ]);
        press(" ");
        expect(spies.onSelect).toHaveBeenCalledTimes(2);
        // 焦点在行内动作钮上时不插手：那条路归浏览器自己激活那个钮，
        // 抢过来 click 整行会变成"按 Enter 选中了这行"。
        const action = host.querySelector<HTMLElement>(
            '[data-row-id="chat:retry"] .gw-iconbtn',
        ) as HTMLElement;
        act(() => action.focus());
        expect(press("Enter").defaultPrevented).toBe(false);
        expect(spies.onSelect).toHaveBeenCalledTimes(2);
    });

    it("修饰键不改选中：⌘Enter 留给宿主", () => {
        const spies = render();
        focusRow("task:t1");
        press("Enter", { metaKey: true });
        press(" ", { ctrlKey: true });
        expect(spies.onSelect).not.toHaveBeenCalled();
    });

    it("connection 行的状态有文字可念（灯只有颜色和转速）", () => {
        render();
        expect(
            [...host.querySelectorAll<HTMLElement>(".gw-conn .gw-sr")].map(
                (el) => el.textContent,
            ),
        ).toEqual(["connected", "not connected"]);
        // 灯本身是装饰，别让它占一个朗读位。
        expect(
            host
                .querySelector(".gw-led")
                ?.getAttribute("aria-hidden"),
        ).toBe("true");
    });

    it("→ 展开分组，再按进第一行；← 收回去", () => {
        render();
        focusRow("chat:archived");
        expect(rowIds()).not.toContain("chat:links");
        press("ArrowRight");
        expect(rowIds()).toContain("chat:links");
        expect(rowEl("chat:archived").getAttribute("aria-expanded")).toBe("true");
        expect(focusedRow()).toBe("chat:archived");
        press("ArrowRight");
        expect(focusedRow()).toBe("chat:links");
        focusRow("chat:archived");
        press("ArrowLeft");
        expect(rowIds()).not.toContain("chat:links");
        expect(rowEl("chat:archived").getAttribute("aria-expanded")).toBe("false");
    });

    it("→ ← 打在普通行上不办事，也不吃掉按键", () => {
        render();
        focusRow("chat:retry");
        expect(press("ArrowRight").defaultPrevented).toBe(false);
        expect(focusedRow()).toBe("chat:retry");
        expect(press("ArrowLeft").defaultPrevented).toBe(false);
    });

    it("窄档只剩树头时，键盘与 Tab 停靠点都不指向不存在的行", () => {
        render();
        Object.defineProperty(shell(), "clientWidth", {
            configurable: true,
            get: () => 200,
        });
        act(() => measure.forEach((cb) => cb()));
        expect(shell().dataset.tier).toBe("heads-only");
        expect(rowIds()).toHaveLength(0);
        for (const kind of ["chat", "worker", "task"] as TreeKind[]) {
            expect(stops(kind)).toEqual([]);
        }
        // 树头那几个钮照旧能 Tab 到，不至于整块界面键盘摸不着。
        expect(
            host.querySelectorAll<HTMLElement>(".gw-tree-head button[aria-label]"),
        ).toHaveLength(3);
    });
});

describe("右键浮层", () => {
    /** 带树头动作的一份快照：浮层条目 = 打开 + 行内 + 树头，三处都有来源才好断言。 */
    function renderWithTreeActions() {
        return render({
            snapshot: snap({
                treeActions: {
                    chat: [
                        { id: "goworker.refreshChats", glyph: "⟳", tooltip: "刷新会话列表" },
                    ],
                    task: [
                        { id: "goworker.refreshTasks", glyph: "⟳", tooltip: "刷新任务列表" },
                    ],
                },
            }),
        });
    }

    /** 真右键：走 .gw-node 那张 div，和鼠标落在行文字/行空白处一致。 */
    function rightClick(rowId: string, at = { x: 12, y: 40 }) {
        const row = host
            .querySelector<HTMLElement>(`[data-row-id="${rowId}"]`)
            ?.closest(".gw-node");
        if (!row) throw new Error(`行 ${rowId} 没画出来`);
        const event = new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
            clientX: at.x,
            clientY: at.y,
        });
        act(() => {
            row.dispatchEvent(event);
        });
        return event;
    }

    const labels = () =>
        [...host.querySelectorAll<HTMLElement>(".gw-menu-item")].map(
            (el) => el.textContent,
        );
    const items = () =>
        [...host.querySelectorAll<HTMLButtonElement>(".gw-menu .gw-menu-item")];

    it("右键一行弹出浮层，条目按 打开 → 行内 → 树头 排；原生菜单被拦下", () => {
        renderWithTreeActions();
        expect(rightClick("chat:retry").defaultPrevented).toBe(true);
        expect(labels()).toEqual(["打开", "改名", "刷新会话列表"]);
        // 无障碍口径：menu / menuitem，屏幕阅读器念得出这是一张菜单。
        expect(host.querySelector(".gw-menu")?.getAttribute("role")).toBe("menu");
        expect(items()[0].getAttribute("role")).toBe("menuitem");
        // 开出来焦点就在第一项，↑↓ 与 Enter 直接能用。
        expect(document.activeElement).toBe(items()[0]);
    });

    it("点「打开」回 onSelect(node, kind)，点动作项回 onAction(动作, 这一行)", () => {
        const props = renderWithTreeActions();
        rightClick("chat:retry");
        act(() => items()[0].click());
        expect(props.onSelect.mock.calls[0]?.[0]).toMatchObject({ id: "chat:retry" });
        expect(props.onSelect.mock.calls[0]?.[1]).toBe("chat");
        expect(props.onAction).not.toHaveBeenCalled();

        rightClick("chat:retry");
        act(() => items()[2].click());
        const [action, on] = props.onAction.mock
            .calls[0] as [{ id: string }, { id: string }];
        expect(action.id).toBe("goworker.refreshChats");
        // 带的是被右键那一行，不是树头那条 —— 树头动作从浮层走时也要有行上下文。
        expect(on.id).toBe("chat:retry");
        expect(host.querySelector(".gw-menu")).toBeNull();
        // 执行完焦点回到那一行（和 Esc 同一口径）—— 不然键盘选完一次就得重新定位。
        expect(focusedRow()).toBe("chat:retry");
    });

    it("Esc 关掉浮层，并把焦点还给原来那一行", () => {
        renderWithTreeActions();
        rightClick("task:t1");
        expect(labels()).toEqual(["打开", "刷新任务列表"]);
        const event = press("Escape");
        expect(event.defaultPrevented).toBe(true);
        expect(host.querySelector(".gw-menu")).toBeNull();
        expect(focusedRow()).toBe("task:t1");
    });

    it("浮层里 ↑↓ 走条目、到边不绕回；其余按键不会在背后挑行", () => {
        renderWithTreeActions();
        rightClick("chat:retry");
        const [first, second, third] = items();
        press("ArrowDown");
        expect(document.activeElement).toBe(second);
        press("ArrowDown");
        expect(document.activeElement).toBe(third);
        press("ArrowDown");
        expect(document.activeElement).toBe(third);
        press("ArrowUp");
        expect(document.activeElement).toBe(second);
        press("ArrowUp");
        expect(document.activeElement).toBe(first);
        // 焦点仍在浮层里，行一条都没被挑走。
        expect(focusedRow()).toBeNull();

        const typed = press("c");
        // 不拦默认动作：Enter / Space 靠它激活当前聚焦的菜单项。这里要挡住的是
        // "按键在背后挑行"，那一件靠 onMenuKey 提前 return 就已经做到了。
        expect(typed.defaultPrevented).toBe(false);
        expect(focusedRow()).toBeNull();
        expect(host.querySelector(".gw-menu")).not.toBeNull();
        expect(items()[0].hasAttribute("title")).toBe(true);
    });

    it("宿主推新快照不关掉浮层（一边弹着一边刷新是常态）", () => {
        renderWithTreeActions();
        rightClick("chat:retry");
        expect(items()).toHaveLength(3);
        render({
            snapshot: snap({
                chats: [node("chat:new", "刚建的会话"), ...CHATS],
                treeActions: {
                    chat: [
                        { id: "goworker.refreshChats", glyph: "⟳", tooltip: "刷新会话列表" },
                    ],
                },
            }),
        });
        expect(rowIds()).toContain("chat:new");
        expect(items()).toHaveLength(3);
        expect(labels()).toEqual(["打开", "改名", "刷新会话列表"]);
    });

    it("点浮层外面关掉，鼠标滚一下也关掉（行会滚、浮层不会）", () => {
        renderWithTreeActions();
        rightClick("chat:retry");
        const brand = host.querySelector<HTMLElement>(".gw-brand") as HTMLElement;
        act(() => {
            brand.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
        });
        expect(host.querySelector(".gw-menu")).toBeNull();

        rightClick("chat:retry");
        act(() => {
            host.querySelector<HTMLElement>(".gw-trees")?.dispatchEvent(
                new MouseEvent("wheel", { bubbles: true }),
            );
        });
        expect(host.querySelector(".gw-menu")).toBeNull();
    });

    it("菜单键给当前焦点行开同一张浮层", () => {
        renderWithTreeActions();
        focusRow("task:t1");
        const event = press("ContextMenu");
        expect(event.defaultPrevented).toBe(true);
        expect(labels()).toEqual(["打开", "刷新任务列表"]);
        // 键盘这条路也自动把焦点移进去，不用再来一发 Tab。
        expect(document.activeElement).toBe(items()[0]);
    });

    it("反向对照：一个动作都没有的行右键不弹（弹一张空的更糟）", () => {
        render();
        rightClick("worker:claude");
        expect(host.querySelector(".gw-menu")).toBeNull();
        // 同一行：给了树头动作之后就弹得出来 —— 证明上面那次不弹是因为没动作，不是右键没接上。
        const withWorkerAction = render({
            snapshot: snap({
                treeActions: {
                    worker: [
                        { id: "goworker.workerConfig", glyph: "⚙", tooltip: "打开 worker 配置" },
                    ],
                },
            }),
        });
        rightClick("worker:claude");
        expect(labels()).toEqual(["打开 worker 配置"]);
        expect(withWorkerAction.onAction).not.toHaveBeenCalled();
    });
});

describe("拖窄退让", () => {
    function metaOf(id: string): HTMLElement | null {
        return (
            host
                .querySelector<HTMLElement>(`[data-row-id="${id}"]`)
                ?.closest(".gw-node")
                ?.querySelector<HTMLElement>(".gw-node-meta") ?? null
        );
    }

    const heads = () =>
        [...host.querySelectorAll<HTMLElement>(".gw-tree")].map(
            (el) => el.dataset.kind,
        );

    /** 把这块壳的实宽钉成 `width`，再让组件按 ResizeObserver 那条路重量一次。 */
    function renderAt(width: number, over: Partial<Props> = {}) {
        panelWidth = width;
        const spies = render(over);
        Object.defineProperty(shell(), "clientWidth", {
            configurable: true,
            get: () => panelWidth,
        });
        resize();
        return spies;
    }

    function resize(): void {
        act(() => {
            for (const see of [...measure]) see();
        });
    }

    it("量到 0（宿主把 webview 藏起来了）不退让，行照画", () => {
        // 不钉宽度：jsdom 的 clientWidth 恒为 0，正是"没量到"那种读数。
        render();
        expect(shell().dataset.tier).toBe("full");
        expect(rowIds()).toEqual(VISIBLE);
        expect(metaOf("worker:claude")?.textContent).toBe("1 task · working");
    });

    it("界上侧 1px 不降档，界上就降（350 这条）", () => {
        renderAt(351);
        expect(shell().dataset.tier).toBe("full");
        panelWidth = 350;
        resize();
        expect(shell().dataset.tier).toBe("trim-meta");
    });

    it("第一档只省 meta 前缀，行一条不少，title 留着全文", () => {
        renderAt(340);
        expect(rowIds()).toEqual(VISIBLE);
        const meta = metaOf("worker:claude");
        expect(meta?.textContent).toBe("working");
        expect(meta?.getAttribute("title")).toBe("1 task · working");
        expect(metaOf("worker:claude-code")?.textContent).toBe("idle");
    });

    it("第二档把 Worker / Task 收成树头 + 计数，Chat 树保留行", () => {
        renderAt(280);
        expect(rowIds()).toEqual(["chat:retry", "chat:archived"]);
        expect(heads()).toEqual(["chat", "worker", "task"]);
        expect([...host.querySelectorAll<HTMLElement>(".gw-count")].map((el) => el.textContent)).toEqual(["2", "2", "1"]);
        // 面板没窄到只剩树：品牌头、connection、底部仍在。
        expect(host.querySelector(".gw-brand")).not.toBeNull();
        expect(host.querySelectorAll(".gw-conn-row")).toHaveLength(2);
        expect(host.querySelector(".gw-foot")).not.toBeNull();
    });

    it("第三档只剩三行树头", () => {
        renderAt(200);
        expect(rowIds()).toEqual([]);
        expect(heads()).toEqual(["chat", "worker", "task"]);
    });

    it("反向对照：省到最后一档也不把离线块省掉 —— 那是唯一的自救入口", () => {
        renderAt(200, {
            snapshot: snap({
                offline: {
                    title: "dispatcher 未连接",
                    detail: "/run/acp.sock",
                    actions: [
                        {
                            id: "goworker.reconnect",
                            glyph: "⟳",
                            label: "Reconnect",
                            tooltip: "重连 dispatcher",
                        },
                    ],
                },
            }),
        });
        const chat = host.querySelector<HTMLElement>('[data-kind="chat"]');
        expect(chat?.querySelector(".gw-offline")).not.toBeNull();
        // 而同一档下 Worker / Task 真的没行 —— 上面那次画出来的是 body，不是行。
        expect(
            host.querySelectorAll('[data-kind="worker"] [data-row-id]').length,
        ).toBe(0);
    });

    it("键盘的候选集跟着档位走：Worker 行没画出来，↓ 与 type-ahead 都不能落到上面", () => {
        renderAt(280);
        focusRow("chat:retry");
        press("ArrowDown");
        expect(focusedRow()).toBe("chat:archived");
        press("ArrowDown");
        expect(focusedRow()).toBe("chat:archived");
        // "claude" 那两行此时不存在：敲 c 只能留在原地。
        press("c");
        expect(focusedRow()).toBe("chat:archived");
        press("End");
        expect(focusedRow()).toBe("chat:archived");
    });

    it("拖窄一路降到只剩树头，拖回去原样复原", () => {
        renderAt(480);
        expect(rowIds()).toEqual(VISIBLE);
        panelWidth = 340;
        resize();
        expect(shell().dataset.tier).toBe("trim-meta");
        expect(rowIds()).toEqual(VISIBLE);
        panelWidth = 280;
        resize();
        expect(rowIds()).toEqual(["chat:retry", "chat:archived"]);
        panelWidth = 200;
        resize();
        expect(rowIds()).toEqual([]);
        panelWidth = 480;
        resize();
        expect(shell().dataset.tier).toBe("full");
        expect(rowIds()).toEqual(VISIBLE);
    });
});

describe("大列表重推快照（T055）", () => {
    type Marked = HTMLElement & { __t055?: boolean };

    function row(id: string): Marked {
        return host.querySelector<Marked>(`[data-row-id="${id}"]`) as Marked;
    }

    /**
     * 再推一份快照，返回这期间重渲染了几行。
     * 走 JSON 往返：宿主那边每推一份都是 postMessage 反序列化出来的全新对象，
     * 内容一样、身份全新，正是 memo 该挡住的场景。
     */
    function pushAgain(over: Partial<ControlPanelSnapshot> = {}): number {
        const before = rowRenders.n;
        render({
            snapshot: JSON.parse(JSON.stringify(snap(over))) as ControlPanelSnapshot,
        });
        return rowRenders.n - before;
    }

    it("内容一样、对象全新的快照推第二遍：一行都不重渲染", () => {
        const before = rowRenders.n;
        render();
        expect(rowRenders.n - before).toBe(4); // fixture 里带 meta 的是 4 行
        expect(pushAgain()).toBe(0);
    });

    it("改一行只重渲染那一行", () => {
        render();
        expect(
            pushAgain({
                workers: WORKERS.map((w) =>
                    w.id === "worker:claude-code"
                        ? { ...w, meta: "2 task · working" }
                        : w,
                ),
            }),
        ).toBe(1);
    });

    it("改过的行也只换文本：DOM 节点还在原处，滚动位置才保得住", () => {
        render();
        const changed = row("worker:claude-code");
        render({
            snapshot: snap({
                workers: WORKERS.map((w) =>
                    w.id === "worker:claude-code"
                        ? { ...w, label: "claude-code 改名了" }
                        : w,
                ),
            }),
        });
        expect(row("worker:claude-code")).toBe(changed);
        expect(changed.textContent).toContain("claude-code 改名了");
    });

    it("反向对照：id 变了就重挂（位置丢了是应该的，别指望 React 替我们兜住）", () => {
        render();
        row("worker:claude").__t055 = true;
        render({
            snapshot: snap({
                workers: WORKERS.map((w, i) => ({ ...w, id: `worker:renamed:${i}` })),
            }),
        });
        expect(row("worker:renamed:0")?.__t055).toBeUndefined();
    });

    it("反向对照：memo 保住的是回调袋里最新那一份闭包", () => {
        /**
         * 行的 memo 比对不看回调，所以回调必须以**身份稳定的袋子**往下传：
         * 哪天改成直接往下传新闭包，这用例会红（旧闭包接到新点击）。
         */
        const stale = render();
        const current = render();
        act(() => row("chat:retry").click());
        expect(current.onSelect).toHaveBeenCalledTimes(1);
        expect(stale.onSelect).not.toHaveBeenCalled();
    });
});
