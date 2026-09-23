/**
 * 控制面板组件用的类型 —— 真正的定义在协议层 `src/protocol/controlPanelMessages.ts`，
 * 这里只做一份带短名字的转发，避免宿主与 webview 两边各写一份而漂移。
 */
export type {
    ControlPanelHint as Hint,
    ControlPanelLinkState as LinkState,
    ControlPanelNodeAction as NodeAction,
    ControlPanelNodeState as NodeState,
    ControlPanelSnapshot as ControlPanelSnapshot,
    ControlPanelTreeKind as TreeKind,
    ControlPanelTreeNode as TreeNode,
    ControlPanelUpMessage as ControlPanelUp,
} from "../../../src/protocol/controlPanelMessages";
