import { describe, expect, it } from "vitest";
import {
    shouldCancelRunOnCtrlC,
    shouldConfirmOnEnter,
    shouldCycleSessionModeOnShiftTab,
    shouldOpenNewChatOnCtrlT,
} from "./composerKeybindings";

describe("shouldOpenNewChatOnCtrlT", () => {
    it("opens on ctrl+t or cmd+t without modifiers", () => {
        expect(
            shouldOpenNewChatOnCtrlT({
                key: "t",
                ctrlKey: true,
                metaKey: false,
                altKey: false,
                shiftKey: false,
            }),
        ).toBe(true);
        expect(
            shouldOpenNewChatOnCtrlT({
                key: "t",
                ctrlKey: false,
                metaKey: true,
                altKey: false,
                shiftKey: false,
            }),
        ).toBe(true);
    });

    it("ignores shift+t and plain t", () => {
        expect(
            shouldOpenNewChatOnCtrlT({
                key: "t",
                ctrlKey: true,
                metaKey: false,
                altKey: false,
                shiftKey: true,
            }),
        ).toBe(false);
        expect(
            shouldOpenNewChatOnCtrlT({
                key: "t",
                ctrlKey: false,
                metaKey: false,
                altKey: false,
                shiftKey: false,
            }),
        ).toBe(false);
    });
});

describe("shouldCycleSessionModeOnShiftTab", () => {
    it("matches shift+tab without other modifiers", () => {
        expect(
            shouldCycleSessionModeOnShiftTab({
                key: "Tab",
                shiftKey: true,
                ctrlKey: false,
                metaKey: false,
                altKey: false,
            }),
        ).toBe(true);
    });

    it("ignores plain tab and ctrl+shift+tab", () => {
        expect(
            shouldCycleSessionModeOnShiftTab({
                key: "Tab",
                shiftKey: false,
                ctrlKey: false,
                metaKey: false,
                altKey: false,
            }),
        ).toBe(false);
        expect(
            shouldCycleSessionModeOnShiftTab({
                key: "Tab",
                shiftKey: true,
                ctrlKey: true,
                metaKey: false,
                altKey: false,
            }),
        ).toBe(false);
    });
});

describe("shouldConfirmOnEnter", () => {
    it("confirms on plain Enter", () => {
        expect(
            shouldConfirmOnEnter({ key: "Enter", shiftKey: false, isComposing: false }),
        ).toBe(true);
    });

    it("does not confirm on shift+Enter (newline)", () => {
        expect(
            shouldConfirmOnEnter({ key: "Enter", shiftKey: true, isComposing: false }),
        ).toBe(false);
    });

    it("does not confirm while an IME composition is active", () => {
        // 中文输入法开着打英文时，Enter 是"确认候选词"，不能当成发送。
        expect(
            shouldConfirmOnEnter({ key: "Enter", shiftKey: false, isComposing: true }),
        ).toBe(false);
    });

    it("does not confirm on other keys", () => {
        expect(
            shouldConfirmOnEnter({ key: "a", shiftKey: false, isComposing: false }),
        ).toBe(false);
    });
});

describe("shouldCancelRunOnCtrlC", () => {
    it("cancels when in-flight and no selection", () => {
        expect(
            shouldCancelRunOnCtrlC({
                key: "c",
                ctrlKey: true,
                metaKey: false,
                altKey: false,
                shiftKey: false,
                hasSelection: false,
                promptInFlight: true,
            }),
        ).toBe(true);
    });

    it("does not cancel when text is selected", () => {
        expect(
            shouldCancelRunOnCtrlC({
                key: "c",
                ctrlKey: true,
                metaKey: false,
                altKey: false,
                shiftKey: false,
                hasSelection: true,
                promptInFlight: true,
            }),
        ).toBe(false);
    });
});
