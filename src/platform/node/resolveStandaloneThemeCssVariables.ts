import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseJsonc } from "jsonc-parser";
import { buildGoworkerSemanticTokenVariables } from "../goworkerSemanticTokens";
import {
    applyMarkdownInlineEditorColors,
    buildMarkdownThemeCssVariables,
    buildMarkdownTypographyCssVariables,
    buildSyntaxHighlightCssVariables,
    type ColorThemeJson,
    mergeColorThemeJson,
    type TokenColorCustomizations,
    tokenColorRulesFromCustomizations,
} from "../markdownThemeResolver";
import {
    fillMissingVscodeColors,
    inferWorkbenchThemeKind,
    type WorkbenchThemeKind,
} from "../vscodeWorkbenchColorDefaults";

export type VscodeSettingsSnapshot = {
    colorTheme: string | undefined;
    colorCustomizations: Record<string, string>;
    tokenColorCustomizations: TokenColorCustomizations | undefined;
    markdownInlineEditorColors: Record<string, string>;
    editorFontFamily: string | undefined;
    editorFontSize: number | undefined;
    markdownPreviewFontSize: number | undefined;
    markdownPreviewLineHeight: number | undefined;
};

export type StandaloneThemeResolution = {
    variables: Record<string, string>;
    source: string;
    colorTheme: string | undefined;
    /** 这一份给的是亮色还是暗色：决定缺省表取哪一栏。 */
    themeKind: WorkbenchThemeKind;
};

const MARKDOWN_INLINE_EDITOR_PREFIX = "markdownInlineEditor.colors.";

/** 仓内自带的两份摊平主题：宿主里找不到主题时的缺省来源。 */
function bundledThemePath(kind: WorkbenchThemeKind): string {
    const here = dirname(fileURLToPath(import.meta.url));
    return join(
        here,
        "..",
        "..",
        "..",
        "standalone",
        "themes",
        `${kind}-modern.json`,
    );
}

function readBundledTheme(
    kind: WorkbenchThemeKind,
): ColorThemeJson | undefined {
    const path = bundledThemePath(kind);
    if (!existsSync(path)) {
        return undefined;
    }
    try {
        return JSON.parse(readFileSync(path, "utf-8")) as ColorThemeJson;
    } catch {
        return undefined;
    }
}

/**
 * `ACP_UI_THEME=light|dark`：把 demo 固定到某个明暗方向，不依赖本机装了哪套主题。
 * 不设就是跟随用户设置里的 workbench.colorTheme。
 */
export function themeKindFromEnv(
    env: NodeJS.ProcessEnv = process.env,
): WorkbenchThemeKind | undefined {
    const raw = env.ACP_UI_THEME?.trim().toLowerCase();
    if (raw === "light" || raw === "dark") {
        return raw;
    }
    return undefined;
}

/**
 * VS Code 用户设置的位置按平台不同：原来只写了 Linux 那一条，
 * macOS / Windows 上 /api/standalone-theme 会直接报"settings not found"。
 * `ACP_UI_VSCODE_SETTINGS` 仍然最优先。
 */
export function vscodeUserSettingsCandidates(
    env: NodeJS.ProcessEnv = process.env,
): string[] {
    const fromEnv = env.ACP_UI_VSCODE_SETTINGS?.trim();
    if (fromEnv !== undefined && fromEnv.length > 0) {
        return [fromEnv];
    }
    const home = homedir();
    if (process.platform === "darwin") {
        return [
            join(
                home,
                "Library",
                "Application Support",
                "Code",
                "User",
                "settings.json",
            ),
            join(
                home,
                "Library",
                "Application Support",
                "Code - Insiders",
                "User",
                "settings.json",
            ),
        ];
    }
    if (process.platform === "win32") {
        const appData = env.APPDATA?.trim();
        return appData !== undefined && appData.length > 0
            ? [join(appData, "Code", "User", "settings.json")]
            : [];
    }
    return [
        join(home, ".config", "Code", "User", "settings.json"),
        join(home, ".config", "Code - Insiders", "User", "settings.json"),
    ];
}

function firstExistingVscodeUserSettingsPath(): string {
    return (
        vscodeUserSettingsCandidates().find((candidate) =>
            existsSync(candidate),
        ) ?? ""
    );
}

export function parseVscodeUserSettings(text: string): VscodeSettingsSnapshot {
    const parsed = parseJsonc(text) as Record<string, unknown> | undefined;
    const record = parsed ?? {};

    const colorCustomizations = readStringRecord(
        record["workbench.colorCustomizations"],
    );
    const tokenColorCustomizations = readTokenColorCustomizations(
        record["editor.tokenColorCustomizations"],
    );

    const markdownInlineEditorColors: Record<string, string> = {};
    for (const [key, value] of Object.entries(record)) {
        if (
            key.startsWith(MARKDOWN_INLINE_EDITOR_PREFIX) &&
            typeof value === "string" &&
            value.length > 0
        ) {
            markdownInlineEditorColors[
                key.slice(MARKDOWN_INLINE_EDITOR_PREFIX.length)
            ] = value;
        }
    }

    return {
        colorTheme: readString(record["workbench.colorTheme"]),
        colorCustomizations,
        tokenColorCustomizations,
        markdownInlineEditorColors,
        editorFontFamily: readString(record["editor.fontFamily"]),
        editorFontSize: readPositiveNumber(record["editor.fontSize"]),
        markdownPreviewFontSize: readPositiveNumber(
            record["markdown.preview.fontSize"],
        ),
        markdownPreviewLineHeight: readPositiveNumber(
            record["markdown.preview.lineHeight"],
        ),
    };
}

function readString(value: unknown): string | undefined {
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readPositiveNumber(value: unknown): number | undefined {
    return typeof value === "number" && value > 0 ? value : undefined;
}

function readStringRecord(value: unknown): Record<string, string> {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return {};
    }
    const out: Record<string, string> = {};
    for (const [key, entry] of Object.entries(value)) {
        if (typeof entry === "string" && entry.length > 0) {
            out[key] = entry;
        }
    }
    return out;
}

function readTokenColorCustomizations(
    value: unknown,
): TokenColorCustomizations | undefined {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return undefined;
    }
    return value as TokenColorCustomizations;
}

/**
 * 主题候选目录：先用户装的扩展，再 IDE 自带的那批内置扩展。
 * 内置扩展在 macOS / Windows 上不叫 /usr/share/code —— 不搜它，
 * "Light Modern" 这类自带主题就找不到 JSON，整张色表都会塌进缺省值。
 */
function builtinAppExtensionRoots(): string[] {
    if (process.platform === "darwin") {
        return [
            "/Applications/Visual Studio Code.app/Contents/Resources/app/extensions",
            "/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/extensions",
            "/Applications/Cursor.app/Contents/Resources/app/extensions",
        ];
    }
    if (process.platform === "win32") {
        const programFiles =
            process.env.ProgramFiles?.trim() || "C:\\Program Files";
        return [
            join(
                programFiles,
                "Microsoft VS Code",
                "resources",
                "app",
                "extensions",
            ),
        ];
    }
    return [
        "/usr/share/code/resources/app/extensions",
        "/usr/share/cursor/resources/app/extensions",
    ];
}

function vscodeExtensionSearchRoots(): string[] {
    const roots = [
        join(homedir(), ".vscode", "extensions"),
        ...builtinAppExtensionRoots(),
    ];
    const fromEnv = process.env.VSCODE_EXTENSIONS?.trim();
    if (fromEnv !== undefined && fromEnv.length > 0) {
        roots.unshift(fromEnv);
    }
    return roots.filter((root) => existsSync(root));
}

/** 主题贡献里带的 uiTheme（light / dark / hc…）—— 判明暗方向时优先用它。 */
type ContributedTheme = {
    path: string;
    kind: WorkbenchThemeKind | undefined;
};

function findContributedTheme(
    themeLabel: string,
    extensionRoots: readonly string[] = vscodeExtensionSearchRoots(),
): ContributedTheme | undefined {
    for (const root of extensionRoots) {
        let entries: string[] = [];
        try {
            entries = readdirSync(root);
        } catch {
            continue;
        }
        for (const entry of entries) {
            const packagePath = join(root, entry, "package.json");
            if (!existsSync(packagePath)) {
                continue;
            }
            try {
                const pkg = JSON.parse(readFileSync(packagePath, "utf-8")) as {
                    contributes?: {
                        themes?: Array<{
                            label?: string;
                            id?: string;
                            path: string;
                            uiTheme?: string;
                        }>;
                    };
                };
                const themes = pkg.contributes?.themes;
                if (!Array.isArray(themes)) {
                    continue;
                }
                for (const theme of themes) {
                    if (theme.label === themeLabel || theme.id === themeLabel) {
                        const uiTheme = theme.uiTheme ?? "";
                        return {
                            path: join(root, entry, theme.path),
                            kind: uiTheme.includes("light")
                                ? "light"
                                : uiTheme.includes("dark")
                                  ? "dark"
                                  : undefined,
                        };
                    }
                }
            } catch {}
        }
    }
    return undefined;
}

/**
 * 单独留给 demo 与单测用：给定主题名在本机能查到哪份 JSON（查不到返回 undefined）。
 * 内部取主题走 findContributedTheme（它还要带上的明暗方向）。
 */
export function findContributedThemePath(
    themeLabel: string,
    extensionRoots: readonly string[] = vscodeExtensionSearchRoots(),
): string | undefined {
    return findContributedTheme(themeLabel, extensionRoots)?.path;
}

function readColorThemeJsonSync(
    themePath: string,
    visited: Set<string> = new Set(),
): ColorThemeJson {
    const resolved = resolve(themePath);
    if (visited.has(resolved)) {
        return {};
    }
    visited.add(resolved);
    const parsed = JSON.parse(
        readFileSync(resolved, "utf-8"),
    ) as ColorThemeJson;
    if (parsed.include === undefined) {
        return parsed;
    }
    const included = readColorThemeJsonSync(
        join(dirname(resolved), parsed.include),
        visited,
    );
    return mergeColorThemeJson(included, parsed);
}

function workbenchColorCssVariables(
    colors: Record<string, string>,
): Record<string, string> {
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

    const descriptionForeground = colors.descriptionForeground;
    if (descriptionForeground !== undefined) {
        variables["--vscode-descriptionForeground"] = descriptionForeground;
    }

    const inactiveSelection =
        colors["editor.inactiveSelectionBackground"] ??
        colors["list.inactiveSelectionBackground"];
    if (inactiveSelection !== undefined) {
        variables["--vscode-editor-inactiveSelectionBackground"] =
            inactiveSelection;
    }

    const dropdownBorder =
        colors["dropdown.border"] ?? colors["input.border"] ?? widgetBorder;
    if (dropdownBorder !== undefined) {
        variables["--vscode-dropdown-border"] = dropdownBorder;
    }

    const codeSpanBorder = colors["markdown.extension.editor.codeSpan.border"];
    if (codeSpanBorder !== undefined) {
        variables["--vscode-markdown-extension-editor-codeSpan-border"] =
            codeSpanBorder;
    }

    const textPreformatBorder = colors["textPreformat.border"];
    if (textPreformatBorder !== undefined) {
        variables["--vscode-textPreformat-border"] = textPreformatBorder;
    }

    const textPreformatForeground = colors["textPreformat.foreground"];
    if (textPreformatForeground !== undefined) {
        variables["--vscode-textPreformat-foreground"] =
            textPreformatForeground;
    }

    return variables;
}

function chartAliasesFromColors(
    colors: Record<string, string>,
): Record<string, string> {
    const aliases: Record<string, string> = {};
    const green = colors["terminal.ansiGreen"];
    if (green !== undefined) {
        aliases["--vscode-charts-green"] = green;
    }
    const yellow = colors["terminal.ansiYellow"];
    if (yellow !== undefined) {
        aliases["--vscode-charts-yellow"] = yellow;
        aliases["--vscode-charts-orange"] = yellow;
        aliases["--vscode-editorWarning-foreground"] = yellow;
    }
    const red = colors["terminal.ansiRed"] ?? colors.errorForeground;
    if (red !== undefined) {
        aliases["--vscode-charts-red"] = red;
        aliases["--vscode-errorForeground"] = red;
    }
    return aliases;
}

export type StandaloneThemeBuildOptions = {
    /** `ACP_UI_THEME` 那条开关：设了就用仓内那份对应方向的内置主题打底。 */
    themeKind?: WorkbenchThemeKind;
};

export type StandaloneThemeBuildResult = {
    variables: Record<string, string>;
    themeKind: WorkbenchThemeKind;
};

/**
 * 摊平一份主题 → 一整套 CSS 变量：先是 --vscode-*（缺的格按方向补宿主缺省值），
 * 再按 tokens.css 那张映射表算出 --gw-*。
 * 明暗两套缺省值都在 --gw-* 里体现出来，浏览器端与 webview 端才是同一张页面。
 */
export function buildStandaloneThemeCssVariables(
    settings: VscodeSettingsSnapshot,
    extensionRoots: readonly string[] = vscodeExtensionSearchRoots(),
    options: StandaloneThemeBuildOptions = {},
): StandaloneThemeBuildResult {
    const forced = options.themeKind;
    const themeLabel = settings.colorTheme;
    const contributed =
        forced === undefined && themeLabel !== undefined
            ? findContributedTheme(themeLabel, extensionRoots)
            : undefined;
    const bundledKind: WorkbenchThemeKind = forced ?? "dark";
    const baseTheme: ColorThemeJson =
        forced !== undefined
            ? (readBundledTheme(forced) ?? {})
            : contributed !== undefined
              ? readColorThemeJsonSync(contributed.path)
              : // 宿主里找不到这份主题（没装 VS Code、或主题名对不上）：
                // 退回仓内那两份，保证 demo 仍有完整一套色。
                (readBundledTheme(bundledKind) ?? {});
    const theme = mergeColorThemeJson(baseTheme, {
        colors: settings.colorCustomizations,
    });
    const customRules = tokenColorRulesFromCustomizations(
        settings.tokenColorCustomizations,
        themeLabel ?? "",
    );

    const fontSizePx =
        settings.markdownPreviewFontSize ?? settings.editorFontSize ?? 14;
    const lineHeight = settings.markdownPreviewLineHeight ?? 1.6;

    let variables: Record<string, string> = {
        ...workbenchColorCssVariables(theme.colors ?? {}),
        ...chartAliasesFromColors(theme.colors ?? {}),
        ...buildMarkdownThemeCssVariables(theme, customRules),
        ...buildMarkdownTypographyCssVariables({
            fontSizePx,
            lineHeight,
        }),
        ...buildSyntaxHighlightCssVariables(theme, customRules),
    };

    if (settings.editorFontFamily !== undefined) {
        variables["--vscode-editor-font-family"] = settings.editorFontFamily;
    }
    if (settings.editorFontSize !== undefined) {
        variables["--vscode-editor-font-size"] = `${settings.editorFontSize}px`;
    }

    applyMarkdownInlineEditorColors(
        variables,
        settings.markdownInlineEditorColors,
    );

    const themeKind =
        forced ?? contributed?.kind ?? inferWorkbenchThemeKind(variables);
    // 先补缺口、再算 --gw-*：顺序换过来的话 --gw-* 会算出缺了一格的那一份。
    variables = fillMissingVscodeColors(variables, themeKind);
    return {
        variables: {
            ...variables,
            ...buildGoworkerSemanticTokenVariables(variables),
        },
        themeKind,
    };
}

export function resolveStandaloneThemeCssVariables(options?: {
    settingsPath?: string;
    extensionRoots?: string[];
    themeKind?: WorkbenchThemeKind;
}): StandaloneThemeResolution {
    const forced = options?.themeKind ?? themeKindFromEnv();
    const settingsPath =
        options?.settingsPath ?? firstExistingVscodeUserSettingsPath();
    const settingsText =
        settingsPath.length > 0 && existsSync(settingsPath)
            ? readFileSync(settingsPath, "utf-8")
            : undefined;
    if (settingsText === undefined && forced === undefined) {
        // 固定了明暗方向时不必强求用户设置 —— 仓内那份主题就够出一整套。
        throw new Error(
            `VS Code settings not found: ${settingsPath || "(no candidate path)"}`,
        );
    }
    const settings =
        settingsText === undefined
            ? parseVscodeUserSettings("{}")
            : parseVscodeUserSettings(settingsText);
    const built = buildStandaloneThemeCssVariables(
        settings,
        options?.extensionRoots,
        { themeKind: forced },
    );
    return {
        variables: built.variables,
        source: settingsText === undefined ? "bundled" : settingsPath,
        colorTheme: settings.colorTheme,
        themeKind: built.themeKind,
    };
}
