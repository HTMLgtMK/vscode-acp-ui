import { buildGoworkerSemanticTokenVariables } from "../../src/platform/goworkerSemanticTokens";
import {
    buildMarkdownThemeCssVariables,
    buildMarkdownTypographyCssVariables,
    buildSyntaxHighlightCssVariables,
    type ColorThemeJson,
} from "../../src/platform/markdownThemeResolver";
import {
    fillMissingVscodeColors,
    type WorkbenchThemeKind,
} from "../../src/platform/vscodeWorkbenchColorDefaults";
import darkModern from "../themes/dark-modern.json";
import lightModern from "../themes/light-modern.json";

type StandaloneThemeApiResponse = {
    variables: Record<string, string>;
    source?: string;
    colorTheme?: string;
};

const FALLBACK_THEMES: Record<WorkbenchThemeKind, ColorThemeJson> = {
    dark: darkModern as ColorThemeJson,
    light: lightModern as ColorThemeJson,
};

/**
 * `?theme=light|dark`：只在 /api/standalone-theme 没起来时管用 —— 决定退回仓内哪一份主题。
 * 接口正常时以它给的那一整套为准（服务端读的是真主题 JSON + 宿主缺省表，比这里全）。
 */
function fallbackThemeKind(): WorkbenchThemeKind {
    const raw = new URLSearchParams(location.search)
        .get("theme")
        ?.trim()
        .toLowerCase();
    return raw === "light" || raw === "dark" ? raw : "dark";
}

function fallbackThemeVariables(): Record<string, string> {
    const kind = fallbackThemeKind();
    const theme = FALLBACK_THEMES[kind];
    const colors = theme.colors ?? {};
    const variables: Record<string, string> = {};
    for (const [key, value] of Object.entries(colors)) {
        variables[`--vscode-${key.replace(/\./g, "-")}`] = value;
    }
    const foreground = colors.foreground ?? colors["editor.foreground"];
    if (foreground !== undefined) {
        variables["--vscode-foreground"] = foreground;
    }
    const widgetBorder =
        colors["widget.border"] ?? colors["editorWidget.border"];
    if (widgetBorder !== undefined) {
        variables["--vscode-widget-border"] = widgetBorder;
    }
    const base = {
        ...variables,
        ...buildMarkdownThemeCssVariables(theme),
        ...buildMarkdownTypographyCssVariables({
            fontSizePx: 14,
            lineHeight: 1.6,
        }),
        ...buildSyntaxHighlightCssVariables(theme),
    };
    // 与服务端同一张表、同一个顺序：先按方向补缺口，再算 --gw-*。
    const filled = fillMissingVscodeColors(base, kind);
    return {
        ...filled,
        ...buildGoworkerSemanticTokenVariables(filled),
    };
}

/**
 * --vscode-* 与 --gw-theme-* 仍按老写法写到根节点的 inline style 上。
 * 算好的 --gw-* 单独挂一条 :where(:root) 规则：特异度是 0，
 * 皮肤包里那些 [data-skin=…] 的 --gw-* 赋值照样盖得住 —— 写成 inline 就把皮肤废了。
 * tokens.css 的 :root 也优先于它，所以这一条不改观感，
 * 只是把"接口算出来的语义值"原样带进页面，供不加载 tokens.css 的场合直接用。
 */
function splitThemeVariables(variables: Record<string, string>): {
    inline: Record<string, string>;
    tokens: Record<string, string>;
} {
    const inline: Record<string, string> = {};
    const tokens: Record<string, string> = {};
    for (const [name, value] of Object.entries(variables)) {
        if (name.startsWith("--gw-") && !name.startsWith("--gw-theme-")) {
            tokens[name] = value;
        } else {
            inline[name] = value;
        }
    }
    return { inline, tokens };
}

function applyCssVariables(variables: Record<string, string>): void {
    const root = document.documentElement;
    for (const [name, value] of Object.entries(variables)) {
        root.style.setProperty(name, value);
    }
}

function applySemanticTokenRules(tokens: Record<string, string>): void {
    const names = Object.entries(tokens);
    const existing = document.getElementById("gw-theme-tokens");
    if (names.length === 0) {
        existing?.remove();
        return;
    }
    const style = existing ?? document.createElement("style");
    if (existing === null) {
        style.id = "gw-theme-tokens";
        document.head.append(style);
    }
    style.textContent = `:where(:root){${names
        .map(([name, value]) => `${name}: ${value};`)
        .join("")}}`;
}

function applyThemeVariables(variables: Record<string, string>): void {
    const { inline, tokens } = splitThemeVariables(variables);
    applyCssVariables(inline);
    applySemanticTokenRules(tokens);
}

async function fetchStandaloneThemeVariables(): Promise<
    Record<string, string>
> {
    try {
        const response = await fetch("/api/standalone-theme");
        if (!response.ok) {
            return fallbackThemeVariables();
        }
        const body = (await response.json()) as StandaloneThemeApiResponse;
        if (
            body.variables === null ||
            typeof body.variables !== "object" ||
            Object.keys(body.variables).length === 0
        ) {
            return fallbackThemeVariables();
        }
        return body.variables;
    } catch {
        return fallbackThemeVariables();
    }
}

export async function applyStandaloneVsCodeTheme(): Promise<void> {
    applyThemeVariables(await fetchStandaloneThemeVariables());
}
