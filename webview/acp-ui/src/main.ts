import type {
    AcpUiHistoryReplayEvent,
    ExtensionToWebviewMessage,
} from "../../../src/protocol/extensionHostMessages";
import "./global.css";
import "./boot.css";
import "./tokens.css";
// 内置三套皮肤必须在 tokens 之后：`:root` 与 `[data-skin=…]` 特异度相同，后加载的赢。
import "./skins/terminal.css";
import "./skins/vscode.css";
import "./skins/light-paper.css";
import { replayChatState, createChatStateFromInit, type ChatState } from "./chatReducer";
import { createVsCodeAcpUiHost } from "./host";
import { setCompactToolPathHome } from "./toolCallCompactText";
import { applySkinLinks } from "./skinLinks";
import { type ChatView, type InitPayload, mountChatView } from "./ui";

function isInitPayload(
    message: ExtensionToWebviewMessage,
): message is InitPayload {
    return message.type === "init";
}

const found = document.getElementById("root");
if (!found) {
    throw new Error("Missing #root");
}
/** 显式标型：hoisted 的 function 声明里 TS 不保留上面的收窄。 */
const mount: HTMLElement = found;

mount.className = "root agent-root";
mount.replaceChildren();
const bootLine = document.createElement("div");
bootLine.className = "acp-ui-boot";
const bootSpinner = document.createElement("div");
bootSpinner.className = "acp-ui-boot__spinner";
bootSpinner.setAttribute("aria-hidden", "true");
const bootText = document.createElement("span");
bootText.textContent = "Connecting...";
bootLine.append(bootSpinner, bootText);
mount.appendChild(bootLine);

const host = createVsCodeAcpUiHost();
let view: ChatView | null = null;
let initReceived = false;
let pendingInit: InitPayload | null = null;
let pendingHistory: AcpUiHistoryReplayEvent[] | undefined;
let pendingSessionHistoryLoading = false;

function applyPendingSessionHistoryLoading(state: ChatState): ChatState {
    if (!pendingSessionHistoryLoading) {
        return state;
    }
    return { ...state, sessionHistoryLoading: true };
}

function tryMountView(): void {
    if (view !== null || pendingInit === null) {
        return;
    }
    initReceived = true;
    clearTimeout(initRetryTimer);
    if (pendingInit.homeDir !== undefined && pendingInit.homeDir.length > 0) {
        setCompactToolPathHome(pendingInit.homeDir);
    }
    const initialChatState =
        pendingHistory !== undefined && pendingHistory.length > 0
            ? applyPendingSessionHistoryLoading(
                  replayChatState(pendingInit, pendingHistory),
              )
            : applyPendingSessionHistoryLoading(
                  createChatStateFromInit(pendingInit),
              );
    view = mountChatView(
        mount,
        pendingInit,
        (body) => {
            host.post({ type: "send", body });
        },
        () => {
            host.post({ type: "cancel" });
        },
        (title) => {
            host.post({ type: "renameSession", title });
        },
        () => {
            host.post({ type: "resetSession" });
        },
        (modelId) => {
            host.post({ type: "setSessionModel", modelId });
        },
        (configId, value) => {
            host.post({ type: "setSessionConfigOption", configId, value });
        },
        (entries) => {
            host.post({ type: "saveHistory", entries });
        },
        (payload) => {
            host.post({ type: "permissionResponse", ...payload });
        },
        initialChatState,
        () => {
            host.post({ type: "openNewChat" });
        },
        (path, options) => {
            host.post({
                type: "openWorkspacePath",
                path,
                ...(options?.target === "auto" ? { target: "auto" } : {}),
            });
        },
        (provider, model) => {
            host.post({ type: "setSessionModelSelection", provider, model });
        },
        () => {
            host.post({ type: "openProviderConfig" });
        },
        (id) => {
            host.post({ type: "providerDetailRequest", id });
        },
        (req) => {
            host.post({ type: "providerUpsert", ...req });
        },
        (id) => {
            host.post({ type: "providerRemove", id });
        },
    );
}

host.onExtensionMessage((message: ExtensionToWebviewMessage) => {
    if (message.type === "sessionHistoryLoading") {
        if (view !== null) {
            view.handleMessage(message);
            return;
        }
        pendingSessionHistoryLoading = message.loading;
        if (message.loading) {
            bootText.textContent = "Loading conversation...";
        }
        return;
    }
    if (isInitPayload(message)) {
        if (view !== null) {
            return;
        }
        pendingInit = message;
        tryMountView();
        return;
    }
    if (message.type === "historyReplay") {
        if (view !== null) {
            return;
        }
        pendingHistory = message.events;
        tryMountView();
        return;
    }
    if (message.type === "setSkin") {
        // 皮肤是文档级的事，不进 chat state：内置三档的色都在产物里，换档只改这一个属性；
        // 皮肤包那一份样式表由 applySkinLinks 当场增删（不然改了设置还得重开面板）。
        // 初值由宿主建 HTML 时写在 `<html data-skin>` 与带 data-gw-skin 的 <link> 上。
        if (message.skin === undefined || message.skin.length === 0) {
            delete document.documentElement.dataset.skin;
        } else {
            document.documentElement.dataset.skin = message.skin;
        }
        applySkinLinks(message.styleUris ?? []);
        return;
    }
    view?.handleMessage(message);
});

host.post({ type: "ready" });
const initRetryTimer = window.setTimeout(() => {
    if (!initReceived) {
        host.post({ type: "ready" });
    }
}, 750);

/**
 * 开发宿主的 DOM 探针：真宿主里从外面看不见 webview，"这一份产物真的渲染出了 trace"
 * "composer 是不是只读"只能由页面自己回读成文本。用坐标点界面是被禁止的验证方式。
 * 宿主只在 Development 模式下发这一发；报告原样回传，不进协议联合类型。
 *
 * `poke: true` 是反向对照那一发：绕开"控件是禁用的"这一层，直接在页面上打字、
 * 按回车、点 Send，再看轨迹有没有多出一行用户消息。只读门禁塌了就只能这样暴露。
 */
window.addEventListener("message", (event: MessageEvent) => {
    const data = event.data as
        | { type?: unknown; probeId?: unknown; poke?: unknown; act?: unknown }
        | undefined;
    if (data?.type !== "devProbe" || typeof data.probeId !== "string") {
        return;
    }
    if (data.poke === true) {
        pokeComposer();
        // React 的 setState 是异步的，等这一轮渲染落定再读 DOM。
        // 用定时器而不是 rAF：面板被藏起来时 VS Code 会冻住帧回调。
        setTimeout(() => {
            postProbe(data.probeId as string, { poke: true });
        }, 80);
        return;
    }
    if (typeof data.act === "string") {
        const acted = devAct(data.act);
        setTimeout(() => {
            postProbe(data.probeId as string, { act: data.act, acted });
        }, 80);
        return;
    }
    postProbe(data.probeId, {});
});

function postProbe(probeId: string, extra: Record<string, unknown>): void {
    host.postDev({ type: "acpUi.devProbe", probeId, ...extra, facts: devFacts() });
}

/** 滚动区现在到底了没有 —— 跟底那颗按钮的判据用的就是这个数。 */
function traceScroll(): { top: number; height: number; client: number } | null {
    const el = mount.querySelector<HTMLElement>(".agent-trace");
    if (!el) {
        return null;
    }
    return { top: el.scrollTop, height: el.scrollHeight, client: el.clientHeight };
}

/**
 * 开发钩子里的"点一下"。不模拟坐标，直接对元素下手：
 * `scroll-up` / `to-bottom` 动滚动区，`chip:全部|消息|思考|工具|未知` 点筛选，
 * `resume` 点 live/paused 那颗。认不出来就回 false，让脚本红得明白。
 *
 * T032/T033 那几条是审批卡的：`perm-option:<n>` 点第 n 枚 daemon 选项（按到达次序数，
 * 不认标签），`perm-dismiss` 点本地 Dismiss，`perm-esc` 发一发真 Esc，
 * `draft:<文本>` 往输入框塞字（`|` 是光标位标记，塞完即去掉），
 * `spam` 是反向对照：审批期间往页面狂敲键盘 + 粘一整段，看有没有什么东西接住它。
 */
function devAct(act: string): boolean {
    const el = mount.querySelector<HTMLElement>(".agent-trace");
    if (act === "scroll-up" || act === "to-bottom") {
        if (!el) {
            return false;
        }
        el.scrollTop =
            act === "to-bottom"
                ? el.scrollHeight
                : Math.max(0, el.scrollHeight - el.clientHeight * 2);
        el.dispatchEvent(new Event("scroll", { bubbles: true }));
        return true;
    }
    if (act === "resume") {
        const live = mount.querySelector<HTMLButtonElement>(".trace-live");
        live?.click();
        return live !== null;
    }
    if (act.startsWith("chip:")) {
        const label = act.slice("chip:".length);
        const chip = [...mount.querySelectorAll<HTMLButtonElement>(".trace-chip")].find(
            (button) => (button.textContent ?? "").trim().startsWith(label),
        );
        chip?.click();
        return chip !== undefined;
    }
    if (act.startsWith("perm-option:")) {
        const position = Number(act.slice("perm-option:".length));
        const buttons = [...mount.querySelectorAll<HTMLButtonElement>(".approval-option")];
        const button = buttons[position];
        button?.click();
        return button !== undefined;
    }
    if (act === "perm-dismiss") {
        const button = mount.querySelector<HTMLButtonElement>(".approval-dismiss");
        button?.click();
        return button !== null;
    }
    if (act === "perm-esc") {
        // 真发一发 Esc：验的是卡片的 keydown 处理，不是去点 Dismiss。
        return pressEscape();
    }
    if (act.startsWith("draft:")) {
        return setDraftWithCaret(act.slice("draft:".length));
    }
    if (act === "spam") {
        return spamKeyboard();
    }
    return false;
}

/** 焦点在卡外也要收得到 Esc —— 直接朝文档派一发。 */
function pressEscape(): boolean {
    document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    return true;
}

/**
 * 往 composer 里塞一行草稿。`|` 是光标位标记：塞进去的文本不含它，
 * 光标停在它原来那个位置 —— 这样裁决完就能比出"内容与光标都回来了"。
 */
function setDraftWithCaret(withMarker: string): boolean {
    const textarea = mount.querySelector<HTMLTextAreaElement>(".composer-input");
    if (!textarea) {
        return false;
    }
    const marker = withMarker.indexOf("|");
    const value = marker >= 0 ? withMarker.replace("|", "") : withMarker;
    // 受控组件：改 .value 不惊动 React，走原生 setter + input 事件（与 poke 同一招）。
    const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
    )?.set;
    setter?.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.focus();
    const caret = marker >= 0 ? marker : value.length;
    textarea.setSelectionRange(caret, caret);
    // 光标是"移动之后"才记的：AcpUiApp 那份抄光标靠 keyup / click / input 这些事件，
    // 真用户按一下方向键就是这个形状。少了这一发，抄下来的还是塞字那一刻的位置。
    textarea.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowLeft", bubbles: true }));
    return true;
}

/**
 * 反向对照那一发：审批期间往页面上砸键盘与粘贴。textarea 已经不渲了，
 * 所以判据是"什么都没接住"—— 事件照发，回读 DOM 时轨迹没多行、卡上文字没变。
 */
function spamKeyboard(): boolean {
    const target: EventTarget = document.activeElement ?? document.body;
    for (const key of ["h", "Enter", "a", "Backspace"]) {
        target.dispatchEvent(
            new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
        );
        target.dispatchEvent(
            new KeyboardEvent("keypress", { key, bubbles: true, cancelable: true }),
        );
    }
    // 粘的得是真有字的一串：空的 DataTransfer 谁都接不住，那条反向对照就成了走过场。
    const transfer = new DataTransfer();
    transfer.setData("text/plain", "SPAM-FROM-DEV-PROBE");
    target.dispatchEvent(
        new ClipboardEvent("paste", {
            bubbles: true,
            cancelable: true,
            clipboardData: transfer,
        }),
    );
    return true;
}

/** 往输入框里塞一行字、按回车、再点一次 Send。返回操作前的轨迹行数（回传时对照）。 */
function pokeComposer(): void {
    const textarea = mount.querySelector<HTMLTextAreaElement>(".composer-input");
    if (!textarea) {
        return;
    }
    // 受控组件：直接改 .value 不会惊动 React，得走原生 setter + input 事件这条路。
    const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
    )?.set;
    setter?.call(textarea, "POKE-FROM-DEV-PROBE");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    mount.querySelector<HTMLButtonElement>(".composer-send")?.click();
}

const textOf = (selector: string): string | null =>
    mount.querySelector(selector)?.textContent?.trim() ?? null;

/**
 * T028 的 header 读数：徽标那档颜色看 `data-state`（宿主给的是 daemon 原始状态，
 * 折档是渲出来的），meta 逐项拆 label/value。整块不存在就回 null —— 聊天面板就该是 null。
 */
function taskHeaderFacts(): Record<string, unknown> | null {
    const el = mount.querySelector<HTMLElement>(".task-header");
    if (!el) {
        return null;
    }
    const badge = el.querySelector<HTMLElement>(".task-header-badge");
    return {
        title: textOf(".task-header-name"),
        badge: badge?.textContent?.trim() ?? null,
        state: badge?.dataset.state ?? null,
        meta: [...el.querySelectorAll<HTMLElement>(".task-header-kv")].map((kv) => ({
            label: (kv.firstChild?.textContent ?? "").trim(),
            value: kv.querySelector("b")?.textContent?.trim() ?? "",
        })),
        taskId: textOf(".task-header-id"),
    };
}

/** 页面里现在有什么：全部从真 DOM 读，不看 React state —— 探针要证的就是渲染结果。 */
function devFacts(): Record<string, unknown> {
    const textarea = mount.querySelector<HTMLTextAreaElement>(".composer-input");
    const send = mount.querySelector<HTMLButtonElement>(".composer-send");
    // 资源地址：script 上是 .src，link 上是 .href —— 读错属性不会报错，只会得到
    // undefined，然后整条"用的是哪份产物"的判据悄悄变成空串。
    const hrefs = (selector: string, prop: "src" | "href"): string[] =>
        [...document.querySelectorAll(selector)].map((el) => {
            const url = (el as unknown as Record<string, unknown>)[prop];
            return typeof url === "string" ? url : "";
        });
    // 路径只留认得出来的那一段：SDK 那份从包名起，其余留末两段。
    const short = (url: string): string => {
        // 先解码：webview 的资源 URI 把 `@` 编码成了 `%40`，不解码就认不出包名。
        let decoded = url;
        try {
            decoded = decodeURIComponent(url);
        } catch {
            /* 不是合法转义串，按原样截 */
        }
        const pkg = decoded.indexOf("@htmlgtmk/");
        return pkg >= 0 ? decoded.slice(pkg) : decoded.split("/").slice(-2).join("/");
    };
    return {
        bundleScript: hrefs("script[src]", "src").map(short),
        bundleStyle: hrefs('link[rel="stylesheet"]', "href").map(short),
        booted: mount.querySelector(".agent-trace") !== null,
        skin: document.documentElement.dataset.skin ?? null,
        // 这一块的 cspSource 只有自己认得，皮肤包那条 URI 只能在这里读得到。
        skinLinks: hrefs('link[data-gw-skin]', "href").map(short),
        // 皮肤是不是真落到了像素上：光看 data-skin 只证明属性写上了，证明不了那份
        // `<link>` 抢赢了产物自带的默认值。这里读 token 的计算值 + 第一块代码块的实际取色。
        skinTokens: skinTokenFacts(),
        traceRows: mount.querySelectorAll(".agent-trace .acp-ui-content-column > *")
            .length,
        userRows: mount.querySelectorAll(".user-prompt-bar").length,
        agentRows: mount.querySelectorAll(".agent-response-stream").length,
        toolRows: mount.querySelectorAll('[class*="tool-call"]').length,
        thoughtRows: mount.querySelectorAll('[class*="agent-thought"]').length,
        unknownRows: mount.querySelectorAll('[class*="unknown-update"]').length,
        // T024a / T024b / T024c 的读数，全从真 DOM 取。
        filterChips: [
            ...mount.querySelectorAll<HTMLButtonElement>(".trace-chip"),
        ].map((button) => ({
            label: (button.textContent ?? "").trim(),
            on: button.hasAttribute("data-on"),
        })),
        live: textOf(".trace-live"),
        jump: textOf(".trace-jump"),
        completedLine: textOf(".trace-completed"),
        taskHeader: taskHeaderFacts(),
        scroll: traceScroll(),
        composer: {
            readOnlyBadge: textOf(".composer-readonly-hint"),
            slashHint: textOf(".composer-top-bar-hint"),
            // 审批期间 composer 整块不渲：这里就是 null / false，不是 disabled。
            present: textarea !== null,
            textareaDisabled: textarea?.disabled ?? null,
            textareaValue: textarea?.value ?? null,
            textareaCaret: textarea?.selectionStart ?? null,
            placeholder: textarea?.placeholder ?? null,
            sendDisabled: send?.disabled ?? null,
            // "审批期间没有隐藏输入框接住键盘"这一条的硬判据：整页可编辑元素的个数。
            // 只看 textarea 在不在，会漏掉换成 <input> 或 contenteditable 的写法。
            editableCount: mount.querySelectorAll(
                'textarea, input:not([type="hidden"]), [contenteditable="true"]',
            ).length,
        },
        permissionCard: permissionCardFacts(),
    };
}

/**
 * 皮肤落色的硬判据：token 的计算值 + trace 里第一块代码块的真实取色。
 * 只看 `<html data-skin>` 会放过一种错法：属性写上了、那份 `<link>` 却没抢过产物默认值
 * （层叠顺序记错、`localResourceRoots` 漏登记 → 404 → 页面照样是内置档的样子）。
 */
function skinTokenFacts(): Record<string, string> {
    const root = getComputedStyle(document.documentElement);
    const out: Record<string, string> = {};
    for (const token of [
        "--gw-surface-base",
        "--gw-code-bg",
        "--gw-code-fg",
        "--gw-syntax-key",
        "--gw-radius",
    ]) {
        out[token] = root.getPropertyValue(token).trim();
    }
    const paint = (selector: string, prop: "backgroundColor" | "color"): void => {
        const el = mount.querySelector<HTMLElement>(selector);
        if (el === null) {
            return;
        }
        const style = getComputedStyle(el) as unknown as Record<string, string>;
        out[`${selector}:${prop}`] = style[prop] ?? "";
    };
    paint(".agent-markdown-code-block > pre", "backgroundColor");
    paint(".agent-markdown pre code", "color");
    paint(".agent-markdown .code-token-keyword", "color");
    return out;
}

/**
 * 审批卡（T032）的读数：整块在不在、排队位次、按钮集合是不是完全来自 daemon 的
 * options（多一项就多一枚，UI 不编造）。卡不在就回 null。
 */
function permissionCardFacts(): Record<string, unknown> | null {
    const card = mount.querySelector<HTMLElement>(".approval-card");
    if (card === null) {
        return null;
    }
    return {
        present: true,
        // 队列里第二条只该出现在角标上，不该在页面上叠出第二张卡。
        cards: mount.querySelectorAll(".approval-card").length,
        queue: textOf(".approval-queue"),
        note: textOf(".approval-note"),
        tool: textOf(".approval-tool"),
        options: [...card.querySelectorAll<HTMLElement>(".approval-option")].map(
            (button) => button.textContent?.trim() ?? "",
        ),
        dismiss: textOf(".approval-dismiss"),
    };
}
