import { describe, expect, it } from "vitest";
import { rowsVisible, splitMeta, TIERS, tierFor } from "./tiers";

/**
 * 阈值来自量测（`tmp/t054-measure.mjs`），不是凑的整数：348 px 起第一处行标被截、
 * 288 px 起 meta 被截、234 px 起 connection 的值被截。档位钉在被截之前。
 */
describe("拖窄退让的档位", () => {
    it("设计宽度 480 是默认档，什么都不省", () => {
        expect(tierFor(480)).toBe("full");
    });

    it("每一档在自己的宽度上生效，且只在生效之后才降", () => {
        for (const { max, tier } of TIERS) {
            expect(tierFor(max)).toBe(tier);
            expect(tierFor(max + 1)).not.toBe(tier);
        }
    });

    it("比所有阈值都窄 → 最后一档", () => {
        expect(tierFor(120)).toBe("heads-only");
    });

    it("三棵树里 Chat 留到最后一档，Worker / Task 先收", () => {
        expect(rowsVisible("full", "worker")).toBe(true);
        expect(rowsVisible("trim-meta", "task")).toBe(true);
        expect(rowsVisible("chat-rows", "chat")).toBe(true);
        expect(rowsVisible("chat-rows", "worker")).toBe(false);
        expect(rowsVisible("chat-rows", "task")).toBe(false);
        expect(rowsVisible("heads-only", "chat")).toBe(false);
    });

    it("反向对照：档位不认人 —— 同一档里三棵树的规则只有一条", () => {
        // 想让 Chat 也提前收，这一条就会红。
        expect(rowsVisible("chat-rows", "chat")).not.toBe(
            rowsVisible("chat-rows", "worker"),
        );
    });
});

describe("行尾 meta 的退让单位", () => {
    it("有分隔符就只让前缀先走", () => {
        expect(splitMeta("claude · feat/retry")).toEqual({
            lead: "claude",
            tail: "feat/retry",
        });
    });

    it("多段前缀一起走，末段留下", () => {
        expect(splitMeta("a · b · working")).toEqual({ lead: "a · b", tail: "working" });
    });

    it("没有分隔符 → 省无可省，整条都是末段", () => {
        expect(splitMeta("claude")).toEqual({ lead: "", tail: "claude" });
    });
});
