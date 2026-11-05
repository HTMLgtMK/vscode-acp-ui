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
        // devFocus 是开发宿主的证据通道：焦点不在行上时 id 缺省，这条不能被丢掉。
        expect(
            tryParseControlPanelUpMessage({
                type: "controlPanel.devFocus",
                id: "worker:claude",
            }),
        ).toEqual({ type: "controlPanel.devFocus", id: "worker:claude" });
        expect(
            tryParseControlPanelUpMessage({ type: "controlPanel.devFocus" }),
        ).toEqual({ type: "controlPanel.devFocus" });
        expect(
            tryParseControlPanelUpMessage({
                type: "controlPanel.devFocus",
                id: "",
            }),
        ).toEqual({ type: "controlPanel.devFocus" });
        // devProbe 的报告原样落盘、宿主不执行：结构不猜，只挡两样 ——
        // 对不上是哪一发的（没有 probeId），和能灌爆日志的（超大 / 不是对象）。
        expect(
            tryParseControlPanelUpMessage({
                type: "controlPanel.devProbe",
                probeId: "p-skin",
                facts: { dataSkin: "midnight", rows: 12 },
            }),
        ).toEqual({
            type: "controlPanel.devProbe",
            probeId: "p-skin",
            facts: { dataSkin: "midnight", rows: 12 },
        });
        expect(
            tryParseControlPanelUpMessage({
                type: "controlPanel.devProbe",
                facts: { a: 1 },
            }),
        ).toBeNull();
        for (const junk of [
            "不是对象",
            ["数组不是报告"],
            { blob: "x".repeat(40_000) },
        ]) {
            expect(
                tryParseControlPanelUpMessage({
                    type: "controlPanel.devProbe",
                    probeId: "p-skin",
                    facts: junk,
                }),
            ).toEqual({ type: "controlPanel.devProbe", probeId: "p-skin" });
        }
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

    it("rejects a tree kind outside the four trees", () => {
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

    it("keeps every declared tree kind, project included", () => {
        // project 曾只写在类型里、没写进守卫：PROJECTS 的 toggleTree/select 上行
        // 整条被丢（树头成死按钮），而宿主与 webview 两侧编译都照过。
        for (const kind of ["chat", "project", "worker", "task"] as const) {
            expect(
                tryParseControlPanelUpMessage({
                    type: "controlPanel.toggleTree",
                    kind,
                }),
            ).toEqual({ type: "controlPanel.toggleTree", kind });
        }
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
    it("narrows the four kinds only", () => {
        expect(isControlPanelTreeKind("chat")).toBe(true);
        expect(isControlPanelTreeKind("project")).toBe(true);
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
