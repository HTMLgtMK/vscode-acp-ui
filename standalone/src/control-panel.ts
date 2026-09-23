import {
    CONTROL_PANEL_SKINS,
    isControlPanelSkin,
} from "../../src/protocol/controlPanelMessages";
import {
    DEV_SELECTED,
    DEV_SNAPSHOTS,
} from "../../webview/control-panel/src/devFixtures";
import type {
    ControlPanelSnapshot,
    NodeAction,
    TreeKind,
    TreeNode,
} from "../../webview/control-panel/src/snapshot";
import { renderControlPanel } from "../../webview/control-panel/src/ui";

const SKINS = CONTROL_PANEL_SKINS;
const STATES = ["ready", "stale", "empty"] as const;
type Skin = (typeof SKINS)[number];
type StateKey = (typeof STATES)[number];

/**
 * 浏览器端控制面板：不连 VS Code，直接吃 devFixtures 的回放快照，
 * 并就地画一条上行动作日志 —— 宿主侧接线（T005/T008）之前的验证面。
 */
export function mountStandaloneControlPanel(): void {
    const sideEl = document.getElementById("gw-side-panel");
    if (!(sideEl instanceof HTMLElement)) {
        return;
    }
    /** 显式标型：hoisted 的 function 声明里 TS 不保留上面的收窄。 */
    const side: HTMLElement = sideEl;

    const params = new URLSearchParams(location.search);
    const skinParam = params.get("skin");
    const stateParam = params.get("state");
    let skin: Skin = isControlPanelSkin(skinParam) ? skinParam : "terminal";
    let stateKey: StateKey = (STATES as readonly string[]).includes(
        stateParam ?? "",
    )
        ? (stateParam as StateKey)
        : "ready";
    let collapsed: Partial<Record<TreeKind, boolean>> = {};
    let selectedId = DEV_SELECTED[stateKey];

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
        return {
            ...base,
            ui: { ...base.ui, collapsed },
        };
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
        strip.replaceChildren(...buttons, out);
    }

    document.body.prepend(strip);
    rebuildStrip();
    draw();
}
