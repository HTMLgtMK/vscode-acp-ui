import { type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import "./control-panel.css";
import { ControlPanel, type ControlPanelHandlers } from "./ControlPanel";
import type { ControlPanelSnapshot } from "./snapshot";

export type ControlPanelProps = {
    snapshot: ControlPanelSnapshot;
    selectedId: string | undefined;
} & ControlPanelHandlers;

const roots = new WeakMap<HTMLElement, Root>();

/** 幂等全量渲染：快照换一份就整份重画，节点靠 key 复用，不做增量合并。 */
export function renderControlPanel(
    container: HTMLElement,
    props: ControlPanelProps,
): void {
    let root = roots.get(container);
    if (!root) {
        root = createRoot(container);
        roots.set(container, root);
    }
    root.render(<ControlPanel {...props} /> as ReactElement);
}
