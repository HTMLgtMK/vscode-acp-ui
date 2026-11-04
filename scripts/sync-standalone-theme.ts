/**
 * 把 VS Code 自带的两套内置主题摊平，产出
 *   standalone/themes/dark-modern.json  （暗）
 *   standalone/themes/light-modern.json （亮）
 * 摊平 = 沿 include 链一层层合进来，产物里不留待解析的引用。
 * 需要本机装了 VS Code（只在开发期跑）。用法：npm run sync:standalone-theme
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mergeColorThemeJson } from "../src/platform/markdownThemeResolver";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** 一个方向：VS Code 里的源主题文件名 → 仓内产物路径。 */
const THEME_TARGETS: Array<{ out: string; source: string }> = [
    {
        out: "standalone/themes/dark-modern.json",
        source: "dark_modern.json",
    },
    {
        out: "standalone/themes/light-modern.json",
        source: "light_modern.json",
    },
];

function themeDirCandidates(): string[] {
    return [
        "/usr/share/code/resources/app/extensions/theme-defaults/themes",
        "/Applications/Visual Studio Code.app/Contents/Resources/app/extensions/theme-defaults/themes",
        join(
            process.env.LOCALAPPDATA ?? "",
            "Programs/Microsoft VS Code/resources/app/extensions/theme-defaults/themes",
        ),
    ];
}

function loadTheme(
    themePath: string,
    visited: Set<string> = new Set(),
): ReturnType<typeof mergeColorThemeJson> {
    const resolved = resolve(themePath);
    if (visited.has(resolved)) {
        return {};
    }
    visited.add(resolved);
    const parsed = JSON.parse(readFileSync(resolved, "utf-8")) as {
        include?: string;
        colors?: Record<string, string>;
        tokenColors?: unknown[];
        semanticTokenColors?: Record<string, string>;
    };
    if (parsed.include === undefined) {
        return parsed;
    }
    const included = loadTheme(
        join(dirname(resolved), parsed.include),
        visited,
    );
    const merged = mergeColorThemeJson(included, parsed);
    if (parsed.semanticTokenColors !== undefined) {
        return {
            ...merged,
            semanticTokenColors: {
                ...(
                    included as { semanticTokenColors?: Record<string, string> }
                ).semanticTokenColors,
                ...parsed.semanticTokenColors,
            },
        };
    }
    return merged;
}

function resolveSourceTheme(fileName: string): string {
    for (const dir of themeDirCandidates()) {
        const candidate = join(dir, fileName);
        if (candidate.length > 0 && existsSync(candidate)) {
            return candidate;
        }
    }
    throw new Error(
        `找不到 VS Code 的 ${fileName}：装一下 VS Code，或改 themeDirCandidates。`,
    );
}

function main(): void {
    for (const target of THEME_TARGETS) {
        const outPath = join(root, target.out);
        let themePath: string;
        try {
            themePath = resolveSourceTheme(target.source);
        } catch (err: unknown) {
            console.error(err instanceof Error ? err.message : String(err));
            process.exitCode = 1;
            continue;
        }
        const theme = loadTheme(themePath);
        mkdirSync(dirname(outPath), { recursive: true });
        writeFileSync(outPath, `${JSON.stringify(theme, null, 2)}\n`);
        console.log(`Wrote ${outPath} from ${themePath}`);
    }
}

main();
