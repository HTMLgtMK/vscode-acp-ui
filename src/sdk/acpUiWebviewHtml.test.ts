import { describe, expect, it } from "vitest";
import { buildAcpUiWebviewHtml } from "./acpUiWebviewHtml";

const base = {
    scriptUri: "vscode-webview://abc/main.js",
    styleUri: "vscode-webview://abc/main.css",
    cspSource: "vscode-webview://abc",
};

describe("皮肤注入（T039）", () => {
    it("不给皮肤参数时，产物还是原来那一层：没有 data-skin、没有多余 <link>", () => {
        const html = buildAcpUiWebviewHtml(base);
        expect(html).toContain(
            '<link rel="stylesheet" href="vscode-webview://abc/main.css" />',
        );
        expect(html).not.toContain("data-skin");
        expect(html.match(/<link /g)).toHaveLength(1);
    });

    it("皮肤包那几条带 data-gw-skin，产物自己的 main.css 不带", () => {
        // 换皮肤时页面按这个标记增删 `<link>`（见 webview/acp-ui/src/skinLinks.ts）：
        // 标记漏了，首帧注入的那一条就再也摘不掉；标错了，main.css 会被当成皮肤包删掉。
        const html = buildAcpUiWebviewHtml({
            ...base,
            extraStyleUris: ["vscode-webview://abc/skin-a.css"],
        });
        const links = html.match(/<link [^>]*>/g) ?? [];
        expect(links).toEqual([
            '<link rel="stylesheet" href="vscode-webview://abc/main.css" />',
            '<link rel="stylesheet" data-gw-skin href="vscode-webview://abc/skin-a.css" />',
        ]);
    });

    it("皮肤包那份 <link> 排在产物样式之后 —— 层叠顺序就是它的优先级", () => {
        const html = buildAcpUiWebviewHtml({
            ...base,
            extraStyleUris: [
                "vscode-webview://abc/skin-a.css",
                "vscode-webview://abc/skin-b.css",
            ],
        });
        const order = ["main.css", "skin-a.css", "skin-b.css"].map((name) =>
            html.indexOf(name),
        );
        expect(order.every((at) => at >= 0)).toBe(true);
        expect([...order].sort((a, b) => a - b)).toEqual(order);
    });

    it("skin 写进 <html data-skin>，空串等于不写", () => {
        expect(buildAcpUiWebviewHtml({ ...base, skin: "terminal" })).toContain(
            '<html lang="en" data-skin="terminal">',
        );
        expect(buildAcpUiWebviewHtml({ ...base, skin: "" })).not.toContain(
            "data-skin",
        );
    });

    it("皮肤名与 href 里的引号被转义：不能提前闭合属性塞一条 <script> 进来", () => {
        const html = buildAcpUiWebviewHtml({
            ...base,
            skin: 'x" onload="alert(1)',
            extraStyleUris: ['y" onerror="alert(2)'],
        });
        expect(html).toContain("&quot;");
        // 转义后仍是一条属性：注入要生效就得能提前把引号闭合，所以数引号个数。
        const htmlTag = html.match(/<html[^>]*>/)?.[0];
        expect(htmlTag).toBe(
            '<html lang="en" data-skin="x&quot; onload=&quot;alert(1)">',
        );
        expect((htmlTag?.match(/"/g) ?? []).length).toBe(4);
        const linkTag = html.match(
            /<link rel="stylesheet" data-gw-skin href="y[^>]*>/,
        )?.[0];
        expect(linkTag).toBe(
            '<link rel="stylesheet" data-gw-skin href="y&quot; onerror=&quot;alert(2)" />',
        );
        expect((linkTag?.match(/"/g) ?? []).length).toBe(4);
    });
});
