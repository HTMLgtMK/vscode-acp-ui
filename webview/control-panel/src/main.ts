import "./control-panel.css";
import { createVsCodeControlPanelHost } from "./host";
import type { ControlPanelSnapshot } from "./snapshot";
import { renderControlPanel, type ControlPanelProps } from "./ui";

const mount = document.getElementById("root");
if (!mount) {
    throw new Error("Missing #root");
}
/** 显式标型：hoisted 的 function 声明里 TS 不保留上面的收窄。 */
const root: HTMLElement = mount;

const host = createVsCodeControlPanelHost();

let snapshot: ControlPanelSnapshot | null = null;
let selectedId: string | undefined;

function draw(): void {
    if (snapshot === null) {
        return;
    }
    const props: ControlPanelProps = {
        snapshot,
        selectedId,
        onSelect: (node, kind) => {
            selectedId = node.id;
            host.post({ type: "controlPanel.select", id: node.id, kind });
            draw();
        },
        // 折叠状态由宿主落盘后回推快照，这里不自己翻，避免两份真相。
        onToggleTree: (kind) => {
            host.post({ type: "controlPanel.toggleTree", kind });
        },
        onAction: (action, node) => {
            host.post({
                type: "controlPanel.action",
                actionId: action.id,
                id: node.id,
            });
        },
        onNewChat: () => {
            host.post({ type: "controlPanel.newChat" });
        },
        onOpenSettings: () => {
            host.post({ type: "controlPanel.openSettings" });
        },
    };
    renderControlPanel(root, props);
}

/** 字号与皮肤都由宿主设置项给：CSSOM 写根节点，绕开 style-src 对 inline 样式的限制。 */
function applyUi(next: ControlPanelSnapshot): void {
    const base = next.ui.fontSize;
    if (typeof base === "number") {
        document.documentElement.style.setProperty("--gw-text-base", `${base}px`);
    }
    if (next.ui.skin !== undefined) {
        document.documentElement.dataset.skin = next.ui.skin;
    }
}

host.onSnapshot((next) => {
    snapshot = next;
    applyUi(next);
    draw();
});

host.post({ type: "controlPanel.ready" });
