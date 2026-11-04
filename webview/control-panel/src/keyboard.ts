/**
 * 三棵树的键盘导航（FR-005）—— 纯逻辑，DOM 只出现在 `rowElements` / `toLabels` /
 * `focusedRowIndex` 这三个取数函数里。
 *
 * 可见行的口径是**当前真画出来的那些行**，所以从 DOM 取而不是从快照推：
 * 折叠的树、收起的分组、离线块替掉的那一格，DOM 已经把它们算清楚了，
 * 在这儿再实现一份折叠规则迟早和组件漂移。
 */

export type RowMove = "up" | "down" | "home" | "end";

/** 方向键与 Home/End 的字面量 → 本模块的动作。 */
export const NAV_KEYS: Readonly<Record<string, RowMove>> = {
    ArrowUp: "up",
    ArrowDown: "down",
    Home: "home",
    End: "end",
};

/** 停止敲这几个字秒后，type-ahead 缓冲区作废。 */
export const TYPE_AHEAD_TIMEOUT_MS = 800;
/** 缓冲区长度上限：超了就当重新起一段，免得一直敲的人永远命中不了。 */
export const TYPE_AHEAD_MAX_LEN = 12;

const ROW_SELECTOR = "[data-row-id]";
/** 行的可打字部分：整行还带着行尾 meta 和状态字形，前缀匹配只认标题。 */
const LABEL_SELECTOR = ".gw-node-label";

/** 按 DOM 顺序取当前画出来的行容器（整行的 treeitem）。 */
export function rowElements(shell: HTMLElement): HTMLElement[] {
    return [...shell.querySelectorAll<HTMLElement>(ROW_SELECTOR)];
}

export function toLabels(els: HTMLElement[]): string[] {
    return els.map((el) => el.querySelector(LABEL_SELECTOR)?.textContent ?? "");
}

/** 焦点在不在行上、在第几行 —— 全按 DOM 下标算，不按 id 算。 */
export function focusedRowIndex(shell: HTMLElement, els: HTMLElement[]): number {
    const el = shell.ownerDocument.activeElement;
    if (!el) return -1;
    const row = el.closest?.(ROW_SELECTOR);
    // 焦点落在行的哪个部位都算这一行：行本身、以及那几个不吃 Tab 的按钮
    //（折叠三角、hover/聚焦才顶出来的动作钮）。
    return els.indexOf(row as HTMLElement);
}

/** 焦点现在落在哪一行。开发宿主用它把导航结果落成文本证据。 */
export function focusedRowId(shell: HTMLElement): string | undefined {
    const els = rowElements(shell);
    const index = focusedRowIndex(shell, els);
    return index >= 0 ? els[index].dataset.rowId : undefined;
}

/**
 * ↑↓/Home/End：到边不绕回。
 * `index < 0` 是焦点不在可见行上（刚被折叠掉、或还在 New chat / 树头上）：
 * 往下当从首行开始、往上从末行开始。
 *
 * 用下标而不是 id：Worker 树和 Task 树可以画出同一条任务的**同一个 id**
 * （宿主那边靠 `worker:<名>:task:<id>` 前缀分开，但协议不保证），
 * 按 id 找行会永远命中第一条，↓ 就在那两行之间打转。
 */
export function moveIndex(
    count: number,
    index: number,
    move: RowMove,
): number {
    if (count === 0) return -1;
    const last = count - 1;
    if (index < 0) return move === "up" || move === "end" ? last : 0;
    switch (move) {
        case "up":
            return Math.max(0, index - 1);
        case "down":
            return Math.min(last, index + 1);
        case "home":
            return 0;
        case "end":
            return last;
    }
}

/**
 * type-ahead：按 label 前缀（大小写不敏感）找一行，返回下标，无命中 -1。
 *
 * 默认从 `from` **之后**开始、绕一圈 —— 这是"连按同一个字母在同类行里轮转"的那条路。
 * `inclusive` 用于缓冲区变长的那一次细化：从锚点那一行自己找起，否则
 * 敲 `w` 停在 webview 那行后接着敲 `o`，会把已定位的行让给 working —— 细化不该甩掉它。
 */
export function typeAheadIndex(
    labels: string[],
    from: number,
    prefix: string,
    opts: { inclusive?: boolean } = {},
): number {
    const needle = prefix.toLowerCase();
    if (!needle || labels.length === 0) return -1;
    const start = from < 0 ? 0 : opts.inclusive ? from : from + 1;
    for (let step = 0; step < labels.length; step += 1) {
        const index = (start + step) % labels.length;
        if (labels[index].toLowerCase().startsWith(needle)) return index;
    }
    return -1;
}

/** 修饰键按下去就不是"在打字"了（⌘C / ⌥↑ 那些留给宿主）。 */
export function hasModifier(event: {
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
}): boolean {
    return event.altKey || event.ctrlKey || event.metaKey;
}

/** 能进 type-ahead 缓冲区的按键：单个可见字符，且空格留给选中。 */
export function isTypeAheadKey(event: {
    key: string;
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
}): boolean {
    if (hasModifier(event)) return false;
    return event.key.length === 1 && event.key !== " ";
}
