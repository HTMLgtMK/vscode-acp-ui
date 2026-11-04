import "./control-panel.css";
import { bindControlPanelHost } from "./bindHost";
import { createVsCodeControlPanelHost } from "./host";
import { focusedRowId } from "./keyboard";

const mount = document.getElementById("root");
if (!mount) {
    throw new Error("Missing #root");
}
/** 显式标型：hoisted 的 function 声明里 TS 不保留上面的收窄。 */
const root: HTMLElement = mount;

const host = createVsCodeControlPanelHost();

// 快照 → 组件那一段与浏览器端 WS 桥共用一份，见 ./bindHost.ts。
bindControlPanelHost(host, root);

/**
 * 开发宿主的按键注入（真宿主里驱动键盘导航的唯一入口 —— 用坐标点 VS Code 是被禁止的验证方式）。
 * 事件从当前聚焦元素发、冒泡到 document，走的是真按键同一条处理器；
 * 但它是不可信事件，浏览器不替它跑激活行为，所以 Enter / Space 点不动按钮 ——
 * "执行聚焦的那一项"另开一条 `activate`，直接 click 当前聚焦元素。
 * 这两样都证不了"物理按键能穿过 VS Code 的键位层"，那一句得人手按。
 */
window.addEventListener("message", (event: MessageEvent) => {
    const data = event.data as
        | { type?: unknown; key?: unknown; activate?: unknown; probeId?: unknown }
        | undefined;
    if (data?.type === "devProbe" && typeof data.probeId === "string") {
        // 回读报告原样交给宿主落盘；宿主那边只登记、不执行。
        host.post({
            type: "controlPanel.devProbe",
            probeId: data.probeId,
            facts: probeFacts(),
        });
        return;
    }
    if (data?.type !== "devKey") {
        return;
    }
    if (data.activate === true) {
        // 注入的 keydown 是不可信事件，浏览器不会为它跑激活行为 → Enter 点不动按钮。
        // 这一发直接点当前聚焦的元素，等价于"回车执行聚焦的那一项"。
        (document.activeElement as HTMLElement | null)?.click();
        setTimeout(postFocus, 30);
        return;
    }
    if (typeof data.key !== "string") {
        return;
    }
    const keydown = new KeyboardEvent("keydown", {
        key: data.key,
        bubbles: true,
        cancelable: true,
    });
    // 从聚焦元素发而不是从 document 发：真按键的 target 永远是聚焦的那个东西。
    (document.activeElement ?? document).dispatchEvent(keydown);
    // React 的 setState 是异步的：浮层开没开、焦点进没进去，要等这一轮渲染落定才看得见。
    // 用定时器而不是 rAF —— 侧栏被藏起来的时候 VS Code 会冻住帧回调，回传就永远不来了。
    setTimeout(postFocus, 30);
});

/** 把"焦点现在落在哪一行"回传给宿主，落成 /tmp/gw-dev-received.jsonl 的一行。 */
function postFocus(): void {
    const shell = root.querySelector<HTMLElement>(".gw-shell");
    host.post({
        type: "controlPanel.devFocus",
        id: shell ? focusedRowId(shell) : undefined,
        focused: document.hasFocus(),
    });
}

/**
 * 开发宿主的探针读数（`devProbe` 那一发）：侧栏此刻渲成了什么样。
 * 快照落盘证的是宿主推了什么，这一份证的是页面真长成了什么 —— 皮肤两回事都得看：
 * `ui.skin` 与 `<link>` 都到位了，那份样式表仍可能没抢过产物默认值（顺序记错、URI 404）。
 */
function probeFacts(): Record<string, unknown> {
    const styles = [
        ...document.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
    ];
    const computed = getComputedStyle(document.documentElement);
    const badge = document.querySelector<HTMLElement>(".gw-brand-mark");
    const badgeStyle = badge === null ? null : getComputedStyle(badge);
    const shell = root.querySelector<HTMLElement>(".gw-shell");
    return {
        dataSkin: document.documentElement.dataset.skin ?? null,
        // 顺序就是优先级：带标记的那几条必须排在产物样式之后。
        styleOrder: styles.map((link) => ({
            skin: link.hasAttribute("data-gw-skin"),
            file: leaf(link.href),
        })),
        tokens: Object.fromEntries(
            SKIN_TOKENS.map((token) => [
                token,
                computed.getPropertyValue(token).trim(),
            ]),
        ),
        // token 的计算值还只是"级联选中了谁"，这两样是真落到像素上的取色。
        painted: {
            badgeBackground: badgeStyle?.backgroundColor ?? null,
            badgeRadius: badgeStyle?.borderRadius ?? null,
        },
        rows: document.querySelectorAll('.gw-shell [role="treeitem"]').length,
        // 档位与实宽：行数为 0 时得能一眼分清是"没数据"还是"这一档本来就不画行"（tiers.ts）。
        tier: shell?.dataset.tier ?? null,
        shellWidth: shell === null ? -1 : Math.round(shell.getBoundingClientRect().width),
        // 行序与焦点落点：换皮肤「不用重开窗口」只能靠焦点接着往下走来看 ——
        // 文档被重建过，焦点就回到首行，那一段走位会整个丢掉。
        rowIds: [...document.querySelectorAll<HTMLElement>(".gw-shell [data-row-id]")].map(
            (row) => row.dataset.rowId ?? "",
        ),
        focusedRow:
            document
                .activeElement?.closest?.("[data-row-id]")
                ?.getAttribute("data-row-id") ?? null,
    };
}

/** 与 trace 那块同一组 token，另加侧栏唯一一直可见的实心元素用到的那一格。 */
const SKIN_TOKENS = [
    "--gw-surface-base",
    "--gw-code-bg",
    "--gw-code-fg",
    "--gw-syntax-key",
    "--gw-radius",
    "--gw-accent",
];

/** 只留末两段：`<皮肤目录名>/skin.css` 一眼认得出，产物那份是 `webview/main.css`。 */
function leaf(url: string): string {
    let decoded = url;
    try {
        decoded = decodeURIComponent(url);
    } catch {
        /* 不是合法转义串，按原样截 */
    }
    return decoded.split("/").slice(-2).join("/");
}
