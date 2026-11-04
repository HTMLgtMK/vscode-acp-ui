// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { applySkinLinks } from "./skinLinks";

/** 当前挂着的那几根：只看标记，顺序按页面里的先后。 */
function mounted(): string[] {
    return [
        ...document.head.querySelectorAll<HTMLLinkElement>("link[data-gw-skin]"),
    ].map((link) => link.href);
}

const cssA = "https://cdn.example/skins/midnight/skin.css";
const cssB = "https://cdn.example/skins/paper/skin.css";

beforeEach(() => {
    document.head.innerHTML = `<link rel="stylesheet" href="https://cdn.example/main.css" />`;
});

describe("皮肤包 <link> 的运行时对账（T039）", () => {
    it("挂上宿主发来的那一份，产物自己的 main.css 不算在内", () => {
        applySkinLinks([cssA]);
        expect(mounted()).toEqual([cssA]);
        expect(
            [...document.head.querySelectorAll("link")].map((link) => link.href),
        ).toEqual(["https://cdn.example/main.css", cssA]);
    });

    it("建面板时写进 HTML 的那一条也认：标记一样，不换档时不重复挂", () => {
        document.head.innerHTML += `<link rel="stylesheet" data-gw-skin href="${cssA}" />`;
        const first = document.head.querySelector("link[data-gw-skin]");
        expect(mounted()).toEqual([cssA]);
        applySkinLinks([cssA]);
        expect(mounted()).toEqual([cssA]);
        // 比 href 不够：删掉重建也长得一样，但样式表会重新拉一次、页面闪一下。
        expect(first?.isConnected).toBe(true);
    });

    it("换皮肤包：旧的离开页面，新的挂上", () => {
        applySkinLinks([cssA]);
        const first = document.head.querySelector(`link[href="${cssA}"]`);
        applySkinLinks([cssB]);
        expect(mounted()).toEqual([cssB]);
        expect(first?.isConnected).toBe(false);
    });

    it("重复推同一份清单不重挂 —— 侧栏每次数据变化都会带着它再走一遍", () => {
        applySkinLinks([cssA]);
        const first = document.head.querySelector(`link[href="${cssA}"]`);
        applySkinLinks([cssA]);
        applySkinLinks([cssA]);
        expect(mounted()).toEqual([cssA]);
        expect(first?.isConnected).toBe(true);
    });

    it("切回内置档（空清单）：一份皮肤包都不留，否则写了 :root 的还在盖着", () => {
        applySkinLinks([cssA, cssB]);
        applySkinLinks([]);
        expect(mounted()).toEqual([]);
    });

    it("同一个地址在清单里出现两次只挂一根", () => {
        applySkinLinks([cssA, cssA]);
        expect(mounted()).toEqual([cssA]);
    });
});
