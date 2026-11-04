import { CONTROL_PANEL_SKINS } from "../../src/protocol/controlPanelMessages";
import { bindControlPanelHost } from "../../webview/control-panel/src/bindHost";
import {
    DEV_SELECTED,
    DEV_SNAPSHOTS,
} from "../../webview/control-panel/src/devFixtures";
import type {
    ControlPanelHost,
    ControlPanelTransport,
} from "../../webview/control-panel/src/host";
import { createControlPanelHost } from "../../webview/control-panel/src/host";
import type {
    ControlPanelSnapshot,
    NodeAction,
    TreeKind,
    TreeNode,
} from "../../webview/control-panel/src/snapshot";
import { renderControlPanel } from "../../webview/control-panel/src/ui";

const SKINS = CONTROL_PANEL_SKINS;
const STATES = ["ready", "stale", "empty"] as const;
type StateKey = (typeof STATES)[number];

/**
 * 桥模式那条 WS：与 chat 同一条端口，靠 `channel=controlPanel` 认人（见 standalone/panelBridge.ts）。
 * 页面参数用 `panelFixture` / `panelReplay` 前缀 —— chat 那边已经在用裸的 `?fixture=&replay=`，
 * 同一页要同时看两块面板时这两个名字不能撞（撞了就只能配好一边）。桥的请求行仍是短名。
 */
const PANEL_WS_URL = (fixture: string, replay: boolean): string => {
    const query = new URLSearchParams({ channel: "controlPanel" });
    if (fixture.length > 0) {
        query.set("fixture", fixture);
    }
    if (replay) {
        query.set("replay", "1");
    }
    return `ws://${location.host}/__acp_ui_ws?${query.toString()}`;
};

/**
 * 浏览器端控制面板：两种数据源，界面代码是同一份。
 * - 默认（本地回放）：直接吃 devFixtures 的快照，就地画一条上行动作日志 —— T054 / T055 那批量宽度的脚本走这条。
 * - `?panel=ws`（桥）：连 `standalone/server.ts` 那条桥，快照由服务端按 `?panelFixture=<名>` 推、
 *   `?panelReplay=1` 就逐帧推。这一条才是 US5 要的东西：浏览器里跑的是一整套宿主时序（上行 → 宿主 → 再推全量）。
 */
export function mountStandaloneControlPanel(): void {
    const sideEl = document.getElementById("gw-side-panel");
    if (!(sideEl instanceof HTMLElement)) {
        return;
    }
    /** 显式标型：hoisted 的 function 声明里 TS 不保留上面的收窄。 */
    const side: HTMLElement = sideEl;

    const params = new URLSearchParams(location.search);
    if (params.get("panel") === "ws") {
        mountBridgedControlPanel(
            side,
            params.get("panelFixture") ?? "",
            params.get("panelReplay") === "1",
        );
        return;
    }
    const skinParam = params.get("skin");
    const stateParam = params.get("state");
    /**
     * `?skin=` 给的是皮肤包 id（不在内置三档里）时照着它设 data-skin，不回落：宿主那边皮肤包
     * 就是拿 id 当属性值、内置三档的规则一条都不套。这里若换成 terminal，终端档的字体与配色会
     * 跟皮肤包混在一起，浏览器里看到的就不是宿主里看到的（那三个内置按钮仍能当场切回去）。
     */
    let skin: string = skinParam ?? "terminal";
    let stateKey: StateKey = (STATES as readonly string[]).includes(
        stateParam ?? "",
    )
        ? (stateParam as StateKey)
        : "ready";
    let collapsed: Partial<Record<TreeKind, boolean>> = {};
    let selectedId = DEV_SELECTED[stateKey];
    /** `?rows=240` 把三棵树各灌到 240 行（T055 大列表用；不传就是 fixture 原样）。 */
    const rowsParam = Number(params.get("rows"));
    let pushTick = 0;

    /** 开发条走文档流（body 是 flex 列），不盖住面板第一行的品牌头。 */
    const strip = document.createElement("div");
    strip.setAttribute("data-dev", "control-panel-strip");
    strip.style.cssText =
        "flex:none;display:flex;align-items:center;gap:4px;height:26px;padding:0 6px;font:600 11px ui-monospace,monospace;background:#111;border-bottom:1px solid #3a3f4b;";

    const out = document.createElement("span");
    out.setAttribute("data-dev", "control-panel-out");
    out.style.cssText =
        "margin-left:12px;font-weight:400;color:#8a8a8a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60ch;";

    function snapshot(): ControlPanelSnapshot {
        const base = DEV_SNAPSHOTS[stateKey];
        if (!(rowsParam > 0)) {
            return { ...base, ui: { ...base.ui, collapsed } };
        }
        return {
            ...base,
            chats: expand(base.chats, rowsParam, pushTick),
            workers: expand(base.workers, rowsParam, pushTick),
            tasks: expand(base.tasks, rowsParam, pushTick),
            ui: { ...base.ui, collapsed },
        };
    }

    /**
     * 大列表回放：拿 fixture 里的节点当模板凑够 n 行，id 保证唯一（key 复用要看这个），
     * 每次 push 只改第一行的文案 —— 这就是"你滚到中间时 daemon 推了一份新快照"。
     */
    function expand(nodes: TreeNode[], n: number, tick: number): TreeNode[] {
        const out: TreeNode[] = [];
        for (let i = 0; i < n && nodes.length > 0; i += 1) {
            const src = nodes[i % nodes.length];
            const label = src.label.replace(/ · push \d+$/, "");
            out.push({
                ...src,
                group: undefined,
                children: undefined,
                id: `${src.id.split("#")[0]}#${i}`,
                label: i === 0 ? `${label} · push ${tick}` : `${label} #${i}`,
            });
        }
        return out;
    }

    function post(message: Record<string, unknown>): void {
        out.textContent = `↑ ${JSON.stringify(message)}`;
    }

    function draw(): void {
        document.documentElement.setAttribute("data-skin", skin);
        renderControlPanel(side, {
            snapshot: snapshot(),
            selectedId,
            onSelect: (node: TreeNode, kind: TreeKind) => {
                selectedId = node.id;
                post({ type: "controlPanel.select", id: node.id, kind });
                draw();
            },
            onToggleTree: (kind: TreeKind) => {
                const next = !collapsed[kind];
                collapsed = { ...collapsed, [kind]: next };
                post({
                    type: "controlPanel.toggleTree",
                    kind,
                    collapsed: next,
                });
                draw();
            },
            onAction: (action: NodeAction, node: TreeNode) => {
                post({
                    type: "controlPanel.action",
                    actionId: action.id,
                    id: node.id,
                });
            },
            onNewChat: () => {
                post({ type: "controlPanel.newChat" });
            },
            onOpenSettings: () => {
                post({ type: "controlPanel.openSettings" });
            },
        });
    }

    function button(
        label: string,
        active: boolean,
        onClick: () => void,
    ): HTMLButtonElement {
        const el = document.createElement("button");
        el.type = "button";
        el.textContent = label;
        el.style.cssText = `padding:1px 6px;border-radius:3px;border:1px solid #3a3f4b;cursor:pointer;font:inherit;${
            active
                ? "background:#35a854;color:#0c0c0c;"
                : "background:#1f1f1f;color:#8a8a8a;"
        }`;
        el.addEventListener("click", onClick);
        return el;
    }

    function rebuildStrip(): void {
        const buttons = SKINS.map((option) =>
            button(option, skin === option, () => {
                skin = option;
                rebuildStrip();
                draw();
            }),
        );
        for (const option of STATES) {
            buttons.push(
                button(option, stateKey === option, () => {
                    stateKey = option;
                    collapsed = {};
                    selectedId = DEV_SELECTED[option];
                    rebuildStrip();
                    draw();
                }),
            );
        }
        buttons.push(
            button(`push ${pushTick}`, false, () => {
                pushTick += 1;
                rebuildStrip();
                draw();
            }),
        );
        strip.replaceChildren(...buttons, out);
    }

    document.body.prepend(strip);
    rebuildStrip();
    draw();
}

/**
 * 桥模式：这条 WS 就是浏览器端的"宿主"。快照、折叠、皮肤全由它推，页面这边只留两行状态 ——
 * 连没连上、最后一条上行是什么。数据形状与 VS Code 侧一模一样，所以本地那三个档位按钮在这里没有位置：
 * 换档得由"宿主"推，不是页面自己翻。
 */
function mountBridgedControlPanel(
    side: HTMLElement,
    fixture: string,
    replay: boolean,
): void {
    const strip = document.createElement("div");
    strip.setAttribute("data-dev", "control-panel-strip");
    strip.style.cssText =
        "flex:none;display:flex;align-items:center;gap:8px;height:26px;padding:0 6px;font:600 11px ui-monospace,monospace;background:#111;border-bottom:1px solid #3a3f4b;";
    const link = document.createElement("span");
    link.setAttribute("data-dev", "control-panel-link");
    const out = document.createElement("span");
    out.setAttribute("data-dev", "control-panel-out");
    out.style.cssText =
        "margin-left:12px;font-weight:400;color:#8a8a8a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60ch;";
    strip.replaceChildren(link, out);

    const ws = new WebSocket(PANEL_WS_URL(fixture, replay));
    /** 建连之前组件就会 post `controlPanel.ready`，先攒着，open 之后补发（与 chat 那条同一做法）。 */
    const pending: string[] = [];
    let frames = 0;
    link.textContent = `桥 连接中 ${PANEL_WS_URL(fixture, replay)}`;

    ws.addEventListener("open", () => {
        for (const message of pending) {
            ws.send(message);
        }
        pending.length = 0;
        link.textContent = `桥 已连 · 夹具 ${fixture || "progressive"}${replay ? " · 逐帧回放" : ""}`;
    });
    ws.addEventListener("close", () => {
        link.textContent = "桥 已断开（夹具读不出来时服务端会说明原因）";
    });

    const transport: ControlPanelTransport = {
        post: (message) => {
            const text = JSON.stringify(message);
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(text);
            } else {
                pending.push(text);
            }
            out.textContent = `↑ ${message.type}`;
        },
        onMessage: (handler) => {
            ws.addEventListener("message", (event: MessageEvent<string>) => {
                frames += 1;
                link.textContent = `${link.textContent?.replace(/ · 收到 \d+ 帧$/, "") ?? ""} · 收到 ${frames} 帧`;
                handler(JSON.parse(event.data) as unknown);
            });
        },
    };
    const host: ControlPanelHost = createControlPanelHost(transport);

    document.body.prepend(strip);
    bindControlPanelHost(host, side);
}
