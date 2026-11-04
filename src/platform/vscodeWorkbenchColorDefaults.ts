/* ============================================================
 * VS Code 宿主算出来、主题 JSON 里常常没有的那批 --vscode-* 缺省值。
 *
 * 为什么要有这张表：一份主题 JSON 只写它想改的那些键，VS Code 运行时自己
 * 还有一整套算出来的缺省值（descriptionForeground、badge.background、
 * scrollbarSlider.*、list.hoverBackground 这类）。浏览器端
 * （standalone 的 /api/standalone-theme）只摊平了主题 JSON，缺的那几格
 * 就掉进 tokens.css 里手写的缺省字面量 —— 与 VS Code webview 里宿主算出来的
 * 值不是同一个，同一个页面两边长得不一样。
 *
 * 用法：先按主题摊 --vscode-*，再拿这张表**只补缺口**。
 *   主题给了 → 以主题为准（fillMissingVscodeColors 不覆盖已有键）；
 *   主题没给 → 按明暗方向补这一张表的值。
 *
 * 值从哪来：全部读自本机安装的 VS Code 内置主题，逐格标了来源
 * （Dark Modern / Light Modern / 2026 Dark / 2026 Light / Dark+ / Light+）。
 * 六份内置主题里查不到、只能靠 VS Code 运行时算的那几格**不进这张表**
 * （editorWarning.foreground、terminal.ansi*、stringForeground、
 * numberLiteralForeground、symbolIcon.keywordForeground、textPreformat.border、
 * markdown.extension.editor.codeSpan.border、diffEditor.*TextForeground、
 * widget-shadow）—— 没有实测值就不写，这些格继续走 tokens.css 自己的 var 链，
 * 观感与改动前一致。
 *
 * 字体三格（font-family、editor-font-family、editor-font-size）也不进表：
 * 宿主是按设置项算的，不属主题色；editor-font-family / editor-font-size
 * 已由 resolveStandaloneThemeCssVariables 从用户设置里读。
 * ============================================================ */

/** 明暗方向。表里每格都要有这两栏，缺一栏就不进表。 */
export type WorkbenchThemeKind = "light" | "dark";

export type VscodeColorDefault = {
    dark: string;
    light: string;
};

/** 键是 CSS 变量名（与 tokens.css 里 `var(--vscode-…)` 一一对得上，便于逐格核对）。 */
export const VSCODE_WORKBENCH_COLOR_DEFAULTS: Readonly<
    Record<string, VscodeColorDefault>
> = {
    /* —— 表面 —— */
    "--vscode-editor-background": { dark: "#1F1F1F", light: "#FFFFFF" }, // Dark Modern / Light Modern
    "--vscode-sideBar-background": { dark: "#181818", light: "#F8F8F8" }, // 同上
    "--vscode-editor-inactiveSelectionBackground": {
        dark: "#3A3D41",
        light: "#E5EBF1",
    }, // 同上
    "--vscode-editorWidget-background": { dark: "#202020", light: "#F8F8F8" }, // 同上
    "--vscode-list-hoverBackground": { dark: "#FFFFFF14", light: "#F2F2F2" }, // 2026 Dark / Light Modern
    "--vscode-input-background": { dark: "#313131", light: "#FFFFFF" }, // Dark Modern / Light Modern
    "--vscode-dropdown-background": { dark: "#313131", light: "#FFFFFF" }, // 同上
    "--vscode-textBlockQuote-background": {
        dark: "#2B2B2B",
        light: "#F8F8F8",
    }, // 同上
    "--vscode-textCodeBlock-background": {
        dark: "#2B2B2B",
        light: "#F8F8F8",
    }, // 同上

    /* —— 描边 —— */
    "--vscode-panel-border": { dark: "#2B2B2B", light: "#E5E5E5" }, // Dark Modern / Light Modern
    "--vscode-widget-border": { dark: "#313131", light: "#E5E5E5" }, // 同上
    "--vscode-textBlockQuote-border": {
        dark: "#616161",
        light: "#E5E5E5",
    }, // 同上

    /* —— 文本 —— */
    "--vscode-foreground": { dark: "#CCCCCC", light: "#3B3B3B" }, // Dark Modern / Light Modern
    "--vscode-editor-foreground": { dark: "#CCCCCC", light: "#3B3B3B" }, // 同上
    "--vscode-descriptionForeground": {
        dark: "#9D9D9D",
        light: "#3B3B3B",
    }, // 同上
    "--vscode-input-placeholderForeground": {
        dark: "#989898",
        light: "#767676",
    }, // 同上
    "--vscode-disabledForeground": { dark: "#555555", light: "#BBBBBB" }, // 2026 Dark / 2026 Light
    "--vscode-textLink-foreground": {
        dark: "#4DAAFC",
        light: "#005FB8",
    }, // Dark Modern / Light Modern
    "--vscode-textPreformat-foreground": {
        dark: "#D0D0D0",
        light: "#3B3B3B",
    }, // Dark Modern / Light Modern

    /* —— 强调色与按钮 —— */
    "--vscode-button-background": { dark: "#0078D4", light: "#005FB8" }, // Dark Modern / Light Modern
    "--vscode-button-hoverBackground": {
        dark: "#026EC1",
        light: "#0258A8",
    }, // 同上
    "--vscode-button-foreground": { dark: "#FFFFFF", light: "#FFFFFF" }, // 同上（明暗同值）
    "--vscode-button-secondaryBackground": {
        dark: "#00000000",
        light: "#E5E5E5",
    }, // 同上
    "--vscode-button-secondaryHoverBackground": {
        dark: "#2B2B2B",
        light: "#CCCCCC",
    }, // 同上
    "--vscode-button-secondaryForeground": {
        dark: "#CCCCCC",
        light: "#3B3B3B",
    }, // 同上
    "--vscode-list-activeSelectionBackground": {
        dark: "#FFFFFF22",
        light: "#E8E8E8",
    }, // 2026 Dark / Light Modern
    "--vscode-list-activeSelectionForeground": {
        dark: "#EDEDED",
        light: "#000000",
    }, // 同上
    "--vscode-focusBorder": { dark: "#0078D4", light: "#005FB8" }, // Dark Modern / Light Modern
    "--vscode-progressBar-background": {
        dark: "#0078D4",
        light: "#005FB8",
    }, // 同上

    /* —— 状态色 —— */
    "--vscode-charts-blue": { dark: "#57A3F8", light: "#1A5CFF" }, // 2026 Dark / 2026 Light
    "--vscode-charts-green": { dark: "#86CF86", light: "#388A34" }, // 2026 Dark / 2026 Light
    "--vscode-errorForeground": { dark: "#F85149", light: "#F85149" }, // Dark Modern / Light Modern（明暗同值）
    "--vscode-inputValidation-errorBackground": {
        dark: "#3A1D1D",
        light: "#FDEDED",
    }, // 2026 Dark / 2026 Light
    "--vscode-inputValidation-errorBorder": {
        dark: "#BE1100",
        light: "#AD0707",
    }, // 同上

    /* —— badge：面板暂未引用，但宿主确实会算这一档，列出来供对照 —— */
    "--vscode-badge-background": { dark: "#616161", light: "#CCCCCC" }, // Dark Modern / Light Modern
    "--vscode-badge-foreground": { dark: "#F8F8F8", light: "#3B3B3B" }, // 同上

    /* —— diff —— */
    "--vscode-diffEditor-insertedTextBackground": {
        dark: "#57AB5A4D",
        light: "#587C0C26",
    }, // 2026 Dark / 2026 Light
    "--vscode-diffEditor-removedTextBackground": {
        dark: "#F470674D",
        light: "#AD070726",
    }, // 同上

    /* —— 滚动条 —— */
    "--vscode-scrollbarSlider-background": {
        dark: "#A8A9AA85",
        light: "#646464C0",
    }, // 2026 Dark / 2026 Light
    "--vscode-scrollbarSlider-hoverBackground": {
        dark: "#A8A9AA90",
        light: "#646464D0",
    }, // 同上
    "--vscode-scrollbarSlider-activeBackground": {
        dark: "#A8A9AA9C",
        light: "#646464E0",
    }, // 同上
};

/**
 * 只补缺口：`variables` 里已有的键一律不动。
 * 返回一个新对象，便于单测直接比对输入没被改。
 */
export function fillMissingVscodeColors(
    variables: Readonly<Record<string, string>>,
    kind: WorkbenchThemeKind,
): Record<string, string> {
    const out: Record<string, string> = { ...variables };
    for (const [name, pair] of Object.entries(
        VSCODE_WORKBENCH_COLOR_DEFAULTS,
    )) {
        if (out[name] === undefined || out[name].length === 0) {
            out[name] = kind === "light" ? pair.light : pair.dark;
        }
    }
    return out;
}

/** 十六进制色（3/4/6/8 位）→ [r,g,b]；其它写法返回 undefined。 */
function parseHexColor(value: string): [number, number, number] | undefined {
    const hex = value.trim().replace(/^#/, "");
    const full =
        hex.length === 3 || hex.length === 4
            ? hex
                  .slice(0, 3)
                  .split("")
                  .map((c) => c + c)
                  .join("")
            : hex.length >= 6
              ? hex.slice(0, 6)
              : "";
    if (full.length !== 6) {
        return undefined;
    }
    return [
        Number.parseInt(full.slice(0, 2), 16),
        Number.parseInt(full.slice(2, 4), 16),
        Number.parseInt(full.slice(4, 6), 16),
    ];
}

/** WCAG 相对亮度（0 黑 ~ 1 白）。 */
export function relativeLuminance(value: string): number | undefined {
    const rgb = parseHexColor(value);
    if (rgb === undefined) {
        return undefined;
    }
    const [r, g, b] = rgb.map((channel) => {
        const s = channel / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * 从摊平出来的 --vscode-* 里判明暗方向。
 * 依据是 editor.background（没有就退回 surface 类底色）：亮度 > 0.5 记亮色。
 * 判不出来（底色缺失或非十六进制）时返回 dark —— 与改动前的行为一致。
 */
export function inferWorkbenchThemeKind(
    variables: Readonly<Record<string, string>>,
): WorkbenchThemeKind {
    for (const name of [
        "--vscode-editor-background",
        "--vscode-sideBar-background",
        "--vscode-editorWidget-background",
        "--vscode-foreground",
    ]) {
        const value = variables[name];
        if (value === undefined) {
            continue;
        }
        const lum = relativeLuminance(value);
        if (lum !== undefined) {
            return lum > 0.5 ? "light" : "dark";
        }
    }
    return "dark";
}
