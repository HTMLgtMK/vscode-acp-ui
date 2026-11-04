/* ============================================================
 * tokens.css 那张映射表的机器可读版：--gw-<语义> ← 一串 --vscode-<键>。
 *
 * 只收 tokens.css 里**纯 var(--vscode-*) 间接**的那些格（49 格，含多级候选链）。
 * 不收的三类都留在 CSS 里算，服务端一份值替不了：
 *   1. calc() / color-mix() 派生格 —— --gw-text-dim、--gw-text-faint、--gw-syntax-com；
 *   2. 引用了别的 --gw-* 的格 —— --gw-role-user-fg、--gw-text-xs 等。
 *      这类若在这里算死，皮肤改了 --gw-text 就只改一半，两边反而更不一致；
 *   3. 先吃 --gw-theme-* 的格 —— --gw-inline-code-fg、--gw-md-h1-fg、--gw-role-plan-fg
 *      （宿主算好的那一路已由 markdownThemeResolver 经 --gw-theme-* 投递）。
 *
 * 顺序与候选项必须与 webview/acp-ui/src/tokens.css 逐字对齐：
 * 这里是"CSS 里 var(A, var(B, 字面量)) 去掉字面量"的那一份 A、B。
 * 全链都缺值时这一格不产出，让 CSS 里的手写缺省值生效。
 * ============================================================ */

/** 键 = --gw-*；值 = 按优先级排列的 --vscode-* 候选，取第一个有值的。 */
export const GOWORKER_SEMANTIC_TOKEN_SOURCES: Readonly<
    Record<string, readonly string[]>
> = {
    /* —— 字体 —— */
    "--gw-font-ui": ["--vscode-font-family"],
    "--gw-font-mono": ["--vscode-editor-font-family"],

    /* —— 表面 —— */
    "--gw-surface-base": ["--vscode-editor-background"],
    "--gw-surface-raised": ["--vscode-sideBar-background"],
    "--gw-surface-sunken": ["--vscode-editor-inactiveSelectionBackground"],
    "--gw-surface-overlay": ["--vscode-editorWidget-background"],
    "--gw-surface-hover": ["--vscode-list-hoverBackground"],
    "--gw-surface-input": ["--vscode-input-background"],
    "--gw-surface-dropdown": [
        "--vscode-dropdown-background",
        "--vscode-input-background",
    ],
    "--gw-text-placeholder": [
        "--vscode-input-placeholderForeground",
        "--vscode-descriptionForeground",
    ],

    /* —— 描边 —— */
    "--gw-border": ["--vscode-panel-border"],
    "--gw-border-strong": ["--vscode-widget-border"],
    "--gw-divider": ["--vscode-descriptionForeground"],

    /* —— 文本 —— */
    "--gw-text": ["--vscode-foreground"],
    "--gw-text-invert": ["--vscode-button-foreground"],
    "--gw-text-link": ["--vscode-textLink-foreground"],

    /* —— 强调色 —— */
    "--gw-accent": ["--vscode-button-background"],
    "--gw-accent-hover": ["--vscode-button-hoverBackground"],
    "--gw-on-accent": ["--vscode-button-foreground"],
    "--gw-secondary": ["--vscode-button-secondaryBackground"],
    "--gw-secondary-hover": ["--vscode-button-secondaryHoverBackground"],
    "--gw-on-secondary": ["--vscode-button-secondaryForeground"],
    "--gw-selected": ["--vscode-list-activeSelectionBackground"],
    "--gw-on-selected": ["--vscode-list-activeSelectionForeground"],
    "--gw-focus": ["--vscode-focusBorder"],
    "--gw-progress": ["--vscode-progressBar-background"],

    /* —— 任务生命周期状态 —— */
    "--gw-state-running": ["--vscode-charts-blue"],
    "--gw-state-queued": ["--vscode-descriptionForeground"],
    "--gw-state-review": ["--vscode-editorWarning-foreground"],
    "--gw-state-done": ["--vscode-charts-green"],
    "--gw-state-failed": ["--vscode-errorForeground"],
    "--gw-state-failed-bg": ["--vscode-inputValidation-errorBackground"],
    "--gw-danger-border": [
        "--vscode-inputValidation-errorBorder",
        "--vscode-errorForeground",
    ],

    /* —— diff —— */
    "--gw-diff-add-fg": [
        "--vscode-diffEditor-insertedTextForeground",
        "--vscode-foreground",
    ],
    "--gw-diff-add-bg": ["--vscode-diffEditor-insertedTextBackground"],
    "--gw-diff-remove-fg": [
        "--vscode-diffEditor-removedTextForeground",
        "--vscode-foreground",
    ],
    "--gw-diff-remove-bg": ["--vscode-diffEditor-removedTextBackground"],

    /* —— trace 角色与代码块 —— */
    "--gw-role-thought-bg": ["--vscode-textBlockQuote-background"],
    "--gw-role-thought-border": [
        "--vscode-textBlockQuote-border",
        "--vscode-widget-border",
    ],
    "--gw-code-bg": ["--vscode-textCodeBlock-background"],
    "--gw-code-fg": ["--vscode-editor-foreground"],
    "--gw-syntax-key": [
        "--vscode-symbolIcon-keywordForeground",
        "--vscode-terminal-ansiMagenta",
    ],
    "--gw-syntax-str": [
        "--vscode-stringForeground",
        "--vscode-terminal-ansiGreen",
    ],
    "--gw-syntax-num": [
        "--vscode-numberLiteralForeground",
        "--vscode-terminal-ansiRed",
    ],
    "--gw-syntax-warn": ["--vscode-terminal-ansiYellow"],

    /* —— 其他 —— */
    "--gw-shadow-key": ["--vscode-widget-shadow"],
    "--gw-scrollbar": ["--vscode-scrollbarSlider-background"],
    "--gw-scrollbar-hover": ["--vscode-scrollbarSlider-hoverBackground"],
    "--gw-scrollbar-active": ["--vscode-scrollbarSlider-activeBackground"],
};

/**
 * 按映射表把一组 --vscode-* 摊成算好的 --gw-*。
 * 只吃传进来的这张映射：调用方换了映射（例如改了 tokens.css）就换参数，
 * 单测据此校验两边格数一致。
 */
export function buildGoworkerSemanticTokenVariables(
    variables: Readonly<Record<string, string>>,
    sources: Readonly<
        Record<string, readonly string[]>
    > = GOWORKER_SEMANTIC_TOKEN_SOURCES,
): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [token, chain] of Object.entries(sources)) {
        for (const candidate of chain) {
            const value = variables[candidate];
            if (value !== undefined && value.length > 0) {
                out[token] = value;
                break;
            }
        }
    }
    return out;
}
