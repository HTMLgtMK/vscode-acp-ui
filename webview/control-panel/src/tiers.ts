/**
 * 拖窄退让（T054）：480px 是设计宽度、不是下限 —— VS Code 不让我们锁死侧栏。
 * 按稿 02② 的顺序分四档（默认 + 三档退让）：先省 meta 前缀，再把 Worker / Task
 * 收成"标题 + 计数"，最后只剩三棵树头。
 *
 * 阈值是量出来的（`tmp/t054-measure.mjs`，浏览器 fixture 数据）：面板 348 px 起第一处
 * 行标被省略号截断，288 px 起 meta 开始截，234 px 起 connection 的值开始截。
 * 每一档定在"这一档省掉的东西刚好开始被截"之前一点，所以降级永远发生在裁字之前。
 */
import type { TreeKind } from "./snapshot";

export type PanelTier = "full" | "trim-meta" | "chat-rows" | "heads-only";

/** 面板实宽 ≤ max 就降到这一档；由宽到窄排，最后命中的那条生效。 */
export const TIERS: ReadonlyArray<{ max: number; tier: PanelTier }> = [
    { max: 350, tier: "trim-meta" },
    { max: 290, tier: "chat-rows" },
    { max: 235, tier: "heads-only" },
];

export function tierFor(width: number): PanelTier {
    let tier: PanelTier = "full";
    for (const step of TIERS) {
        if (width <= step.max) tier = step.tier;
    }
    return tier;
}

/**
 * 这一档里这棵树还画不画行。Chat 树留到最后一档 —— 稿 02② 写的是"Worker / Task 先收，
 * Chat 树保留"：会话行是用户要找的东西，另两棵是索引。
 */
export function rowsVisible(tier: PanelTier, kind: TreeKind): boolean {
    if (tier === "heads-only") return false;
    if (tier === "chat-rows") return kind === "chat";
    return true;
}

/**
 * 行尾 meta 的退让单位：`claude · feat/retry` 里前缀（worker 名）先让位，末段留着。
 * 没有分隔符就整条都是末段，省无可省。
 */
export function splitMeta(meta: string): { lead: string; tail: string } {
    const at = meta.lastIndexOf(" · ");
    return at < 0
        ? { lead: "", tail: meta }
        : { lead: meta.slice(0, at), tail: meta.slice(at + 3) };
}
