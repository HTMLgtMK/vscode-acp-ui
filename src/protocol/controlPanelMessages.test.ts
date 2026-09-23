import { describe, expect, it } from "vitest";
import {
    isControlPanelTreeKind,
    tryParseControlPanelUpMessage,
} from "./controlPanelMessages";
import { tryParseWebviewMessage } from "./extensionHostMessages";

describe("tryParseControlPanelUpMessage", () => {
    it("accepts each whitelisted uplink", () => {
        expect(
            tryParseControlPanelUpMessage({ type: "controlPanel.ready" }),
        ).toEqual({
            type: "controlPanel.ready",
        });
        expect(
            tryParseControlPanelUpMessage({ type: "controlPanel.newChat" }),
        ).toEqual({
            type: "controlPanel.newChat",
        });
        expect(
            tryParseControlPanelUpMessage({
                type: "controlPanel.openSettings",
            }),
        ).toEqual({ type: "controlPanel.openSettings" });
        // Reconnect / daemon 日志走 controlPanel.action（命令 id 在组件里），不是独立上行类型。
        expect(
            tryParseControlPanelUpMessage({ type: "controlPanel.reconnect" }),
        ).toBeNull();
        expect(
            tryParseControlPanelUpMessage({
                type: "controlPanel.toggleTree",
                kind: "worker",
            }),
        ).toEqual({ type: "controlPanel.toggleTree", kind: "worker" });
        expect(
            tryParseControlPanelUpMessage({
                type: "controlPanel.select",
                id: "task:attach-diagram",
                kind: "task",
            }),
        ).toEqual({
            type: "controlPanel.select",
            id: "task:attach-diagram",
            kind: "task",
        });
        expect(
            tryParseControlPanelUpMessage({
                type: "controlPanel.action",
                actionId: "goworker.refreshTasks",
                id: "task:retry",
            }),
        ).toEqual({
            type: "controlPanel.action",
            actionId: "goworker.refreshTasks",
            id: "task:retry",
        });
    });

    it("trims ids", () => {
        expect(
            tryParseControlPanelUpMessage({
                type: "controlPanel.select",
                id: "  chat:one  ",
                kind: "chat",
            }),
        ).toEqual({
            type: "controlPanel.select",
            id: "chat:one",
            kind: "chat",
        });
    });

    it("rejects unknown types and non-objects", () => {
        expect(
            tryParseControlPanelUpMessage({ type: "controlPanel.sudo" }),
        ).toBeNull();
        expect(
            tryParseControlPanelUpMessage({ type: "send", body: "hi" }),
        ).toBeNull();
        expect(tryParseControlPanelUpMessage(null)).toBeNull();
        expect(
            tryParseControlPanelUpMessage("controlPanel.newChat"),
        ).toBeNull();
    });

    it("rejects a tree kind outside the three trees", () => {
        expect(
            tryParseControlPanelUpMessage({
                type: "controlPanel.toggleTree",
                kind: "sidebar",
            }),
        ).toBeNull();
        expect(
            tryParseControlPanelUpMessage({
                type: "controlPanel.select",
                id: "task:one",
                kind: 42,
            }),
        ).toBeNull();
    });

    it("rejects empty or oversized string fields", () => {
        expect(
            tryParseControlPanelUpMessage({
                type: "controlPanel.select",
                id: "   ",
                kind: "task",
            }),
        ).toBeNull();
        expect(
            tryParseControlPanelUpMessage({
                type: "controlPanel.action",
                actionId: "x".repeat(300),
                id: "task:one",
            }),
        ).toBeNull();
        expect(
            tryParseControlPanelUpMessage({
                type: "controlPanel.action",
                id: "task:one",
            }),
        ).toBeNull();
    });
});

describe("isControlPanelTreeKind", () => {
    it("narrows the three kinds only", () => {
        expect(isControlPanelTreeKind("chat")).toBe(true);
        expect(isControlPanelTreeKind("worker")).toBe(true);
        expect(isControlPanelTreeKind("task")).toBe(true);
        expect(isControlPanelTreeKind("chats")).toBe(false);
        expect(isControlPanelTreeKind(undefined)).toBe(false);
    });
});

describe("tryParseWebviewMessage with the merged control panel types", () => {
    it("routes controlPanel.* to the panel parser", () => {
        expect(
            tryParseWebviewMessage({
                type: "controlPanel.select",
                id: "worker:claude",
                kind: "worker",
            }),
        ).toEqual({
            type: "controlPanel.select",
            id: "worker:claude",
            kind: "worker",
        });
    });

    it("drops a controlPanel.* message that fails the panel whitelist", () => {
        expect(
            tryParseWebviewMessage({
                type: "controlPanel.select",
                kind: "task",
            }),
        ).toBeNull();
    });

    // 反向对照：合并不能把聊天面板原有的上行消息吃掉。
    it("still parses the chat panel uplinks", () => {
        expect(tryParseWebviewMessage({ type: "send", body: "hello" })).toEqual(
            {
                type: "send",
                body: "hello",
            },
        );
        expect(
            tryParseWebviewMessage({
                type: "permissionResponse",
                requestId: "r1",
                cancelled: true,
            }),
        ).toEqual({
            type: "permissionResponse",
            requestId: "r1",
            cancelled: true,
        });
        expect(tryParseWebviewMessage({ type: "openNewChat" })).toEqual({
            type: "openNewChat",
        });
        expect(tryParseWebviewMessage({ type: "controlPanel" })).toBeNull();
    });
});
