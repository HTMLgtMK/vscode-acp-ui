import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
    buildGoworkerSemanticTokenVariables,
    GOWORKER_SEMANTIC_TOKEN_SOURCES,
} from "../goworkerSemanticTokens";
import {
    fillMissingVscodeColors,
    inferWorkbenchThemeKind,
    VSCODE_WORKBENCH_COLOR_DEFAULTS,
} from "../vscodeWorkbenchColorDefaults";
import {
    buildStandaloneThemeCssVariables,
    parseVscodeUserSettings,
    themeKindFromEnv,
} from "./resolveStandaloneThemeCssVariables";

/** 读 tokens.css（运行时唯一 token 源），用来校验两张表没跟它漂移。 */
function tokensCssSource(): string {
    return readFileSync(
        new URL("../../../webview/acp-ui/src/tokens.css", import.meta.url),
        "utf-8",
    );
}

/** 取 :root 块里的每一条 --gw-* 声明（去注释、保留多行 var() 的整体）。 */
function rootTokenDeclarations(
    css: string,
): Array<{ name: string; value: string }> {
    const marker = ":root {";
    const start = css.indexOf(marker);
    if (start < 0) {
        throw new Error("tokens.css 里找不到 :root 块");
    }
    let body = "";
    let depth = 1;
    for (let i = start + marker.length; i < css.length; i++) {
        const ch = css[i];
        if (ch === "{") depth++;
        if (ch === "}") {
            depth--;
            if (depth === 0) break;
        }
        body += ch;
    }
    const out: Array<{ name: string; value: string }> = [];
    let buffer = "";
    let parens = 0;
    for (const ch of body) {
        if (ch === "(") parens++;
        if (ch === ")") parens--;
        if (ch === ";" && parens === 0) {
            out.push(buffer);
            buffer = "";
        } else {
            buffer += ch;
        }
    }
    if (buffer.trim().length > 0) out.push(buffer);
    return out
        .map((raw) => raw.replace(/\/\*[\s\S]*?\*\//g, ""))
        .filter((raw) => raw.trim().startsWith("--gw-"))
        .map((raw) => {
            const cut = raw.indexOf(":");
            return {
                name: raw.slice(0, cut).trim(),
                value: raw.slice(cut + 1).trim(),
            };
        });
}

/** 这一格是不是"纯 var(--vscode-*) 间接"（不含 color-mix / calc / 别的 --gw-*）。 */
function pureVscodeChain(value: string): string[] | undefined {
    const stripped = value.replace(/\s+/g, " ");
    if (/color-mix|calc\(/.test(stripped) || stripped.includes("--gw-")) {
        return undefined;
    }
    const chain: string[] = [];
    for (const match of stripped.matchAll(/--vscode-[A-Za-z0-9-]+/g)) {
        if (!chain.includes(match[0])) chain.push(match[0]);
    }
    return chain.length > 0 ? chain : undefined;
}

describe("parseVscodeUserSettings", () => {
    it("reads color customizations, token rules, and markdown inline editor colors", () => {
        const settings = parseVscodeUserSettings(`{
            "workbench.colorTheme": "Empty Dark Theme",
            "workbench.colorCustomizations": {
                "editor.background": "#282c34",
                "editor.foreground": "#abb2bf"
            },
            "editor.tokenColorCustomizations": {
                "textMateRules": [
                    {
                        "scope": "heading.1.markdown entity.name.section.markdown",
                        "settings": { "foreground": "#D19A66" }
                    }
                ]
            },
            "markdownInlineEditor.colors.heading1": "#D19A66",
            "markdownInlineEditor.colors.heading2": "#E06C75",
            "markdownInlineEditor.colors.inlineCode": "#C678DD",
            "editor.fontFamily": "Cascadia Code",
            "editor.fontSize": 12
        }`);

        expect(settings.colorTheme).toBe("Empty Dark Theme");
        expect(settings.colorCustomizations["editor.background"]).toBe(
            "#282c34",
        );
        expect(settings.tokenColorCustomizations?.textMateRules).toHaveLength(
            1,
        );
        expect(settings.markdownInlineEditorColors.heading2).toBe("#E06C75");
        expect(settings.markdownInlineEditorColors.inlineCode).toBe("#C678DD");
        expect(settings.editorFontFamily).toBe("Cascadia Code");
        expect(settings.editorFontSize).toBe(12);
    });
});

describe("buildStandaloneThemeCssVariables", () => {
    it("prefers markdownInlineEditor heading colors over token rules", () => {
        const settings = parseVscodeUserSettings(`{
            "workbench.colorCustomizations": {
                "editor.foreground": "#abb2bf",
                "markdown.extension.editor.codeSpan.border": "#636d8344"
            },
            "editor.tokenColorCustomizations": {
                "textMateRules": [
                    {
                        "scope": "heading.1.markdown entity.name.section.markdown",
                        "settings": { "foreground": "#000000" }
                    }
                ]
            },
            "markdownInlineEditor.colors.heading1": "#D19A66",
            "markdownInlineEditor.colors.heading2": "#E06C75",
            "markdownInlineEditor.colors.heading3": "#61AFEF",
            "markdownInlineEditor.colors.heading4": "#C678DD",
            "markdownInlineEditor.colors.inlineCode": "#C678DD"
        }`);

        const vars = buildStandaloneThemeCssVariables(settings, []).variables;
        expect(vars["--gw-theme-md-h1-fg"]).toBe("#D19A66");
        expect(vars["--gw-theme-md-h2-fg"]).toBe("#E06C75");
        expect(vars["--gw-theme-md-h3-fg"]).toBe("#61AFEF");
        expect(vars["--gw-theme-md-h4-fg"]).toBe("#C678DD");
        expect(vars["--gw-theme-inline-code-fg"]).toBe("#C678DD");
        expect(vars["--vscode-editor-foreground"]).toBe("#abb2bf");
    });

    it("prefers markdownInlineEditor inlineCode over markup.inline.raw token rules", () => {
        const settings = parseVscodeUserSettings(`{
            "workbench.colorCustomizations": {
                "editor.foreground": "#abb2bf"
            },
            "editor.tokenColorCustomizations": {
                "textMateRules": [
                    {
                        "scope": "markup.inline.raw.markdown",
                        "settings": { "foreground": "#98C379" }
                    }
                ]
            },
            "markdownInlineEditor.colors.inlineCode": "#C678DD"
        }`);

        const vars = buildStandaloneThemeCssVariables(settings, []).variables;
        expect(vars["--gw-theme-inline-code-fg"]).toBe("#C678DD");
    });
});

describe("VSCODE_WORKBENCH_COLOR_DEFAULTS 宿主缺省表", () => {
    const rows = Object.entries(VSCODE_WORKBENCH_COLOR_DEFAULTS);

    it("每格都有明暗两栏，值都是十六进制色", () => {
        expect(rows.length).toBeGreaterThan(30);
        for (const [name, pair] of rows) {
            expect(name.startsWith("--vscode-"), name).toBe(true);
            for (const value of [pair.dark, pair.light]) {
                expect(value, `${name} 的取值 ${value}`).toMatch(
                    /^#[0-9a-f]{6}([0-9a-f]{2})?$/i,
                );
            }
        }
    });

    it("明暗两套确实不同（不是把暗色抄一遍）", () => {
        const differs = rows.filter(
            ([, pair]) => pair.dark.toLowerCase() !== pair.light.toLowerCase(),
        );
        expect(differs.length).toBeGreaterThan(rows.length / 2);
    });

    it("表里每一格都被 tokens.css 读到（badge 那一对例外，留着对照宿主算出来的值）", () => {
        const referenced = new Set(
            tokensCssSource()
                .match(/--vscode-[A-Za-z0-9-]+/g)
                ?.filter((name) => name.length > "--vscode-".length) ?? [],
        );
        const notRead = rows
            .map(([name]) => name)
            .filter((name) => !referenced.has(name));
        expect(notRead).toEqual([
            "--vscode-badge-background",
            "--vscode-badge-foreground",
        ]);
    });
});

describe("fillMissingVscodeColors", () => {
    it("只补缺口：主题给过的键一个字都不改", () => {
        const themed = {
            "--vscode-editor-background": "#123456",
            "--vscode-list-hoverBackground": "#abcdef",
            "--vscode-not-in-the-table": "#010203",
        };
        const filled = fillMissingVscodeColors(themed, "dark");

        expect(filled["--vscode-editor-background"]).toBe("#123456");
        expect(filled["--vscode-list-hoverBackground"]).toBe("#abcdef");
        expect(filled["--vscode-not-in-the-table"]).toBe("#010203");
        // 输入没被就地改
        expect(Object.keys(themed)).toHaveLength(3);
        // 缺口按暗色那栏补上
        expect(filled["--vscode-scrollbarSlider-background"]).toBe(
            VSCODE_WORKBENCH_COLOR_DEFAULTS[
                "--vscode-scrollbarSlider-background"
            ].dark,
        );
    });

    it("同一份输入按明暗各出一套", () => {
        const dark = fillMissingVscodeColors({}, "dark");
        const light = fillMissingVscodeColors({}, "light");
        expect(dark["--vscode-editor-background"]).toBe("#1F1F1F");
        expect(light["--vscode-editor-background"]).toBe("#FFFFFF");
        expect(dark["--vscode-descriptionForeground"]).not.toBe(
            light["--vscode-descriptionForeground"],
        );
        expect(Object.keys(dark)).toEqual(Object.keys(light));
    });

    it("空串当成没给，也会被补", () => {
        const filled = fillMissingVscodeColors(
            { "--vscode-focusBorder": "" },
            "dark",
        );
        expect(filled["--vscode-focusBorder"]).toBe(
            VSCODE_WORKBENCH_COLOR_DEFAULTS["--vscode-focusBorder"].dark,
        );
    });
});

describe("buildGoworkerSemanticTokenVariables", () => {
    it("候选链上取第一个有值的", () => {
        const tokens = buildGoworkerSemanticTokenVariables({
            "--vscode-input-background": "#313131",
        });
        expect(tokens["--gw-surface-dropdown"]).toBe("#313131");
    });

    it("整条链都没值就不产出这一格，让 CSS 里的手写缺省值生效", () => {
        const tokens = buildGoworkerSemanticTokenVariables({});
        expect(tokens["--gw-surface-dropdown"]).toBeUndefined();
        expect(tokens["--gw-text"]).toBeUndefined();
    });

    it("先命中的候选优先于后面的候选", () => {
        const tokens = buildGoworkerSemanticTokenVariables({
            "--vscode-dropdown-background": "#111111",
            "--vscode-input-background": "#222222",
        });
        expect(tokens["--gw-surface-dropdown"]).toBe("#111111");
    });
});

describe("--gw-* 映射表与 tokens.css 对齐", () => {
    it("tokens.css 里每一格纯 var(--vscode-*) 间接的 --gw-* 都在表里，候选顺序一致", () => {
        const fromCss = new Map<string, string[]>();
        for (const decl of rootTokenDeclarations(tokensCssSource())) {
            const chain = pureVscodeChain(decl.value);
            if (chain !== undefined) {
                fromCss.set(decl.name, chain);
            }
        }

        expect(Object.keys(GOWORKER_SEMANTIC_TOKEN_SOURCES).sort()).toEqual(
            [...fromCss.keys()].sort(),
        );
        for (const [name, chain] of fromCss) {
            expect(
                [...(GOWORKER_SEMANTIC_TOKEN_SOURCES[name] ?? [])],
                name,
            ).toEqual(chain);
        }
    });
});

describe("buildStandaloneThemeCssVariables 补缺口与 --gw-*", () => {
    it("没有主题可找时仍给出一整套，并带上算好的 --gw-*", () => {
        const settings = parseVscodeUserSettings("{}");
        const built = buildStandaloneThemeCssVariables(settings, []);
        const vars = built.variables;

        expect(built.themeKind).toBe("dark");
        expect(
            Object.keys(vars).filter((k) => k.startsWith("--gw-")).length,
        ).toBeGreaterThan(40);
        expect(vars["--vscode-editor-background"]).toBe("#1F1F1F");
        expect(vars["--gw-surface-base"]).toBe(
            vars["--vscode-editor-background"],
        );
        expect(vars["--gw-scrollbar"]).toBe(
            VSCODE_WORKBENCH_COLOR_DEFAULTS[
                "--vscode-scrollbarSlider-background"
            ].dark,
        );
    });

    it("themeKind=light 时亮色那套生效", () => {
        const settings = parseVscodeUserSettings("{}");
        const built = buildStandaloneThemeCssVariables(settings, [], {
            themeKind: "light",
        });
        expect(built.themeKind).toBe("light");
        expect(built.variables["--vscode-editor-background"]).toBe("#FFFFFF");
        expect(built.variables["--gw-surface-base"]).toBe("#FFFFFF");
        expect(built.variables["--vscode-descriptionForeground"]).toBe(
            VSCODE_WORKBENCH_COLOR_DEFAULTS["--vscode-descriptionForeground"]
                .light,
        );
    });

    it("主题自定义过的值不被缺省表盖掉", () => {
        const settings = parseVscodeUserSettings(`{
            "workbench.colorCustomizations": {
                "list.hoverBackground": "#ff00ff",
                "scrollbarSlider.background": "#00ff00"
            }
        }`);
        const vars = buildStandaloneThemeCssVariables(settings, []).variables;
        expect(vars["--vscode-list-hoverBackground"]).toBe("#ff00ff");
        expect(vars["--vscode-scrollbarSlider-background"]).toBe("#00ff00");
        // --gw-* 跟着走主题的值，不是表里的缺省值
        expect(vars["--gw-surface-hover"]).toBe("#ff00ff");
        expect(vars["--gw-scrollbar"]).toBe("#00ff00");
    });

    it("editor.fontSize 设置项投到 --vscode-editor-font-size", () => {
        const settings = parseVscodeUserSettings(`{ "editor.fontSize": 13 }`);
        const vars = buildStandaloneThemeCssVariables(settings, []).variables;
        expect(vars["--vscode-editor-font-size"]).toBe("13px");
    });
});

describe("明暗方向判定", () => {
    it("底色亮判 light、底色暗判 dark、判不出来按 dark", () => {
        expect(
            inferWorkbenchThemeKind({
                "--vscode-editor-background": "#FFFFFF",
            }),
        ).toBe("light");
        expect(
            inferWorkbenchThemeKind({
                "--vscode-editor-background": "#1F1F1F",
            }),
        ).toBe("dark");
        expect(inferWorkbenchThemeKind({})).toBe("dark");
        expect(
            inferWorkbenchThemeKind({
                "--vscode-editor-background": "var(--whatever)",
            }),
        ).toBe("dark");
    });

    it("ACP_UI_THEME 只认 light / dark", () => {
        expect(themeKindFromEnv({ ACP_UI_THEME: "light" })).toBe("light");
        expect(themeKindFromEnv({ ACP_UI_THEME: " DARK " })).toBe("dark");
        expect(themeKindFromEnv({ ACP_UI_THEME: "hc-black" })).toBeUndefined();
        expect(themeKindFromEnv({})).toBeUndefined();
    });
});
