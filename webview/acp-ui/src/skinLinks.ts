/**
 * 皮肤包 `<link>` 的运行时对账：宿主每次换档把「这一刻该挂着的那一份 href」发来，
 * 这里只管增删，不判哪一档合法（那是宿主 `resolveSkin` 的事）。
 *
 * 为什么要在运行时改：`<link>` 早先是建面板时一次写进 HTML 的，于是「装好皮肤包 →
 * 改设置项」这一发只能等重开窗口；反过来从皮肤包切回内置档，那份样式表还留在页面上，
 * 写了 `:root` 的皮肤包会一直盖住内置那一档。
 * 顺序就是优先级：产物自带的 main.css 永远在前（建 HTML 时就在），这几条追加在末尾，
 * 谁都不写 `!important`。
 */
export function applySkinLinks(uris: string[]): void {
    const wanted = new Set(uris.map((uri) => absolute(uri)));
    for (const link of mounted()) {
        if (!wanted.has(link.href)) {
            link.remove();
        }
    }
    const seen = new Set(mounted().map((link) => link.href));
    for (const uri of uris) {
        const href = absolute(uri);
        if (seen.has(href)) {
            continue;
        }
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.setAttribute("data-gw-skin", "");
        link.href = uri;
        seen.add(href);
        document.head.append(link);
    }
}

/** 只认带标记的那几条：产物自己的 main.css 与宿主别的样式表都不归这里管。 */
function mounted(): HTMLLinkElement[] {
    return [...document.head.querySelectorAll<HTMLLinkElement>("link[data-gw-skin]")];
}

/** `link.href` 读回来是绝对地址，比较前先把手上这份同样化一遍。 */
function absolute(uri: string): string {
    try {
        return new URL(uri, document.baseURI).href;
    } catch {
        return uri;
    }
}
