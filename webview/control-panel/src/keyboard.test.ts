import { describe, expect, it } from "vitest";
import { moveIndex, typeAheadIndex } from "./keyboard";

/** 可见行的 label，按 DOM 顺序。导航全程只认下标 —— id 会重复（见 ControlPanel.test.tsx 那条回归）。 */
const LABELS = [
    "dispatcher 超时重试策略",
    "archived",
    "acp-ui 本地链接改相对路径",
    "claude",
    "working",
    "查询桂东天气",
];

describe("↑↓/Home/End", () => {
    it("往下走一行，往上走一行", () => {
        expect(moveIndex(LABELS.length, 0, "down")).toBe(1);
        expect(moveIndex(LABELS.length, 1, "up")).toBe(0);
    });

    it("到边不绕回：首行往上还是首行", () => {
        expect(moveIndex(LABELS.length, 0, "up")).toBe(0);
        expect(moveIndex(LABELS.length, 5, "down")).toBe(5);
    });

    it("Home / End 落到首末", () => {
        expect(moveIndex(LABELS.length, 3, "home")).toBe(0);
        expect(moveIndex(LABELS.length, 3, "end")).toBe(5);
    });

    it("焦点不在可见行上（-1）：往下回第一行、往上回最后一行", () => {
        expect(moveIndex(LABELS.length, -1, "down")).toBe(0);
        expect(moveIndex(LABELS.length, -1, "home")).toBe(0);
        expect(moveIndex(LABELS.length, -1, "up")).toBe(5);
        expect(moveIndex(LABELS.length, -1, "end")).toBe(5);
    });

    it("一行都没有时不动作", () => {
        expect(moveIndex(0, -1, "down")).toBe(-1);
        expect(moveIndex(0, 0, "home")).toBe(-1);
    });
});

describe("type-ahead", () => {
    it("按前缀命中，大小写不敏感", () => {
        expect(typeAheadIndex(LABELS, -1, "cl")).toBe(3);
        expect(typeAheadIndex(LABELS, -1, "CLAUDE")).toBe(3);
    });

    it("中文标签一样能命中", () => {
        expect(typeAheadIndex(LABELS, -1, "查询")).toBe(5);
    });

    it("默认从当前行往后找；同一个前缀连按会绕回", () => {
        const a = ["alpha", "beta", "alps"];
        expect(typeAheadIndex(a, -1, "a")).toBe(0);
        expect(typeAheadIndex(a, 0, "a")).toBe(2);
        expect(typeAheadIndex(a, 2, "a")).toBe(0);
    });

    it("补第二个字符时从锚点那一行自己找起，不然会把刚定位到的行让出去", () => {
        const a = ["alpha", "beta", "alps"];
        // 先敲 a 停在 alpha，再敲 l（缓冲区成 al）：应仍认 alpha，而不是跳到 alps。
        expect(typeAheadIndex(a, 0, "al", { inclusive: true })).toBe(0);
        expect(typeAheadIndex(a, 0, "al")).toBe(2);
    });

    it("锚点那一行已经被折叠掉（indexOf 回 -1）就从头找，不抛", () => {
        expect(typeAheadIndex(LABELS, -1, "wo", { inclusive: true })).toBe(4);
    });

    it("无命中的前缀不猜，交回 -1 让调用方保持焦点不动", () => {
        expect(typeAheadIndex(LABELS, 0, "zz")).toBe(-1);
    });

    it("反向对照：空缓冲区不算命中（否则什么都会跳回第一行）", () => {
        expect(typeAheadIndex(LABELS, 3, "")).toBe(-1);
        expect(typeAheadIndex(LABELS, 3, "", { inclusive: true })).toBe(-1);
    });

    it("label 重复时命中第一条（这是按 label 找的定义如此，行区分靠下标）", () => {
        expect(typeAheadIndex(["ok", "ok"], -1, "o")).toBe(0);
        expect(typeAheadIndex(["ok", "ok"], 0, "o")).toBe(1);
    });
});
