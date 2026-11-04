import { applySkinLinks } from "../../acp-ui/src/skinLinks";
import type { ControlPanelHost } from "./host";
import type { ControlPanelSnapshot } from "./snapshot";
import { renderControlPanel, type ControlPanelProps } from "./ui";

/**
 * 把宿主那条桥接到组件上：收到一份快照就整页重画，字号与皮肤按快照落根节点。
 * VS Code 的 webview 入口（`main.ts`）与浏览器端那条 WS 桥都调这一份 —— 两条路必须走同一套代码，
 * 不然"浏览器里验过"就替不了"宿主里验过"说话。
 */
export function bindControlPanelHost(
    host: ControlPanelHost,
    root: HTMLElement,
): void {
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
            document.documentElement.style.setProperty(
                "--gw-text-base",
                `${base}px`,
            );
        }
        if (next.ui.skin !== undefined) {
            document.documentElement.dataset.skin = next.ui.skin;
        }
        // 快照是全量的，皮肤包那份 href 也跟着每份快照走：换档不用重开侧栏。
        applySkinLinks(next.ui.skinStyleUris ?? []);
    }

    host.onSnapshot((next) => {
        snapshot = next;
        applyUi(next);
        draw();
    });

    host.post({ type: "controlPanel.ready" });
}
