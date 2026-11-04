import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
    type ControlPanelSnapshot,
    type ControlPanelTreeKind,
    tryParseControlPanelUpMessage,
} from "../src/protocol/controlPanelMessages";
import { DEV_SNAPSHOTS } from "../webview/control-panel/src/devFixtures";

/**
 * 浏览器端控制面板走的这条 WebSocket 通道（T043 / T045）。
 * 桥本来就给 chat 用着，这里只补三件事：认出面板那条连接、按 `?fixture=` 出快照、
 * 把 connection 区那几行的 unix 套接字换成桥自己的地址 —— 浏览器里没有 daemon 套接字可显示。
 *
 * 为什么不写进 `server.ts`：那份一 import 就把服务起起来，纯函数抽在这儿才单测得动。
 */

const STANDALONE_DIR = dirname(fileURLToPath(import.meta.url));

/** 面板夹具目录：与 `standalone/fixtures/chats/` 同一层、同一套命名（一个名字一份 `.ndjson`）。 */
export const PANEL_FIXTURE_DIR = join(STANDALONE_DIR, "fixtures", "panels");
/** 不带 `?fixture=` 时回放这一份：空态 → 三棵树 → 断连 → 恢复，四帧、每帧一条完整快照。 */
export const DEFAULT_PANEL_FIXTURE = "progressive";
/** 回放两帧之间隔这么久：看得出"一页一页换"，又不至于等。 */
export const PANEL_REPLAY_DELAY_MS = 600;
/** 请求行里带这个 `channel` 的才算面板那条连接；chat 那条没有，照原路走。 */
export const PANEL_CHANNEL = "controlPanel";

const SOCKET_TOKEN = /[A-Za-z0-9_@./~-]*\.sock(?:et)?\b/g;
const DEV_ONLY_FAILURE = /\s*·?\s*connect ENOENT.*$/i;
const FIXTURE_NAME = /^[a-z0-9-]+$/;
const DEV_STATES = Object.keys(DEV_SNAPSHOTS);

export type PanelChannelParams = { fixture: string; replay: boolean };

/** 从 WS 请求行里认出面板那条连接；不是面板返回 null。 */
export function parsePanelChannel(
    requestUrl: string | undefined,
): PanelChannelParams | null {
    const query = new URLSearchParams((requestUrl ?? "").split("?")[1] ?? "");
    if (query.get("channel") !== PANEL_CHANNEL) {
        return null;
    }
    const wanted = (query.get("fixture") ?? "").trim();
    const replay = query.get("replay");
    return {
        fixture: wanted.length > 0 ? wanted : DEFAULT_PANEL_FIXTURE,
        replay: replay === "1" || replay === "true",
    };
}

/** 连的是哪条桥：传页面看到的那个 `host:port`，浏览器端 connection 区显示的就是它。 */
export function bridgeAddress(hostPort: string): string {
    return `ws://${hostPort}`;
}

/**
 * 一行 connection 的文本换成桥地址。三步都为的是"浏览器里不该出现 unix 套接字"：
 * ① 套接字（含全路径）整段换成桥地址；② 一行里出现两遍地址就只留前半句；
 * ③ `connect ENOENT …` 是 daemon 自己的失败文本，浏览器没这回事，剪掉。
 */
export function bridgeValue(value: string, address: string): string {
    const swapped = value.replace(SOCKET_TOKEN, address);
    const first = swapped.indexOf(address);
    const second =
        first < 0 ? -1 : swapped.indexOf(address, first + address.length);
    const head = second < 0 ? swapped : swapped.slice(0, second);
    const trimmed = head.replace(DEV_ONLY_FAILURE, "").replace(/\s+·\s*$/, "");
    return trimmed.trim().length > 0 ? trimmed.trim() : address;
}

/** 快照里 connection 那几行换成桥地址，别的一字不动。 */
export function withBridgeAddress(
    snapshot: ControlPanelSnapshot,
    address: string,
): ControlPanelSnapshot {
    return {
        ...snapshot,
        connection: snapshot.connection.map((row) => ({
            ...row,
            value: bridgeValue(row.value, address),
        })),
    };
}

/** 一份快照该有什么形状。缺哪格就说哪格 —— 夹具写错了要当场看得见，不该渲出半页。 */
export function snapshotIssue(raw: unknown): string | null {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        return "不是对象";
    }
    const record = raw as Record<string, unknown>;
    const brand = record.brand as { name?: unknown } | undefined;
    if (brand === undefined || typeof brand.name !== "string") {
        return "缺 brand.name";
    }
    for (const key of ["chats", "workers", "tasks", "connection"] as const) {
        if (!Array.isArray(record[key])) return `${key} 不是数组`;
    }
    const account = record.account as { placeholder?: unknown } | undefined;
    if (account?.placeholder !== true) return "account.placeholder 得是 true";
    const ui = record.ui as
        | { canCreateChat?: unknown; collapsed?: unknown }
        | undefined;
    if (ui === undefined || typeof ui.canCreateChat !== "boolean") {
        return "缺 ui.canCreateChat";
    }
    if (ui.collapsed !== undefined && typeof ui.collapsed !== "object") {
        return "ui.collapsed 不是对象";
    }
    return null;
}

/** 读文件：给路径回内容，没有这个文件回 null。测试用假的，实跑用 fs。 */
export type ReadFile = (path: string) => string | null;

const readIfExists: ReadFile = (path) => {
    try {
        return readFileSync(path, "utf8");
    } catch {
        return null;
    }
};

export type PanelSnapshotSource =
    | { ok: true; snapshots: ControlPanelSnapshot[]; source: string }
    | { ok: false; reason: string };

/**
 * 夹具名 → 一份份完整快照。两条来源：`fixtures/panels/<name>.ndjson`（一行一帧），
 * 以及 `devFixtures` 那三个内置档位（`ready` / `stale` / `empty`，一帧）。
 */
export function readPanelSnapshots(
    name: string,
    read: ReadFile = readIfExists,
    dir = PANEL_FIXTURE_DIR,
): PanelSnapshotSource {
    const states = DEV_SNAPSHOTS as Record<string, ControlPanelSnapshot>;
    if (DEV_STATES.includes(name)) {
        return {
            ok: true,
            snapshots: [states[name]],
            source: `devFixtures:${name}`,
        };
    }
    if (!FIXTURE_NAME.test(name)) {
        return { ok: false, reason: `夹具名不合法：${name}` };
    }
    const file = join(dir, `${name}.ndjson`);
    const text = read(file);
    if (text === null) {
        return {
            // 这句要塞进 WS 关闭帧（只装得下 123 字节），所以报相对路径：绝对路径那串
            // 光是仓库前缀就占掉大半，浏览器里看到的是一句被截断的废话。
            ok: false,
            reason: `fixtures/panels/${name}.ndjson 不存在（内置档位有 ${DEV_STATES.join(
                " / ",
            )}）`,
        };
    }
    const lines = text.split("\n").filter((line) => line.trim().length > 0);
    const snapshots: ControlPanelSnapshot[] = [];
    for (const [index, line] of lines.entries()) {
        let raw: unknown;
        try {
            raw = JSON.parse(line) as unknown;
        } catch (error) {
            return {
                ok: false,
                reason: `第 ${index + 1} 行不是合法 JSON：${
                    error instanceof Error ? error.message : String(error)
                }`,
            };
        }
        const issue = snapshotIssue(raw);
        if (issue !== null) {
            return {
                ok: false,
                reason: `第 ${index + 1} 行不像快照：${issue}`,
            };
        }
        snapshots.push(raw as ControlPanelSnapshot);
    }
    if (snapshots.length === 0) {
        return { ok: false, reason: `${file} 一份快照都没有` };
    }
    return { ok: true, snapshots, source: file };
}

export type PanelSocket = {
    send(text: string): void;
    close(reason: string): void;
    onMessage(handler: (text: string) => void): void;
};

/**
 * 把一条 WS 连接当成控制面板的宿主来跑。
 * 收到 `controlPanel.ready` 才推快照（与 VS Code 侧同一套时序）；`toggleTree` 就地翻
 * `ui.collapsed` 再推一份完整快照 —— 其余上行只记日志不动手：浏览器里没有命令面板，也没有编辑器可开。
 */
export function serveControlPanelSocket(
    socket: PanelSocket,
    params: {
        requestUrl: string | undefined;
        address: string;
        read?: ReadFile;
        sleep?: (ms: number) => Promise<void>;
        log?: (line: string) => void;
    },
): void {
    const channel = parsePanelChannel(params.requestUrl);
    if (channel === null) {
        socket.close("不是控制面板那条通道");
        return;
    }
    const log = params.log ?? ((line: string) => console.log(line));
    const sleep =
        params.sleep ??
        ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const loaded = readPanelSnapshots(channel.fixture, params.read);
    if (!loaded.ok) {
        log(`panel: 夹具读不出来 —— ${loaded.reason}`);
        socket.close(loaded.reason);
        return;
    }
    const frames = loaded.snapshots.map((frame) =>
        withBridgeAddress(frame, params.address),
    );
    log(
        `panel: ${loaded.source} 共 ${frames.length} 帧 · 桥 ${params.address} · ` +
            `${channel.replay ? "逐帧回放" : "只给最后一帧"}`,
    );
    let current = frames[frames.length - 1];
    let replaying = false;

    const push = (snapshot: ControlPanelSnapshot): void => {
        current = snapshot;
        socket.send(JSON.stringify({ type: "controlPanel", snapshot }));
    };

    socket.onMessage((text) => {
        const parsed = tryParseControlPanelUpMessage(safeParse(text));
        if (parsed === null) {
            log("panel: 上行不合法，丢掉");
            return;
        }
        log(`panel ↑ ${parsed.type}`);
        if (parsed.type === "controlPanel.ready") {
            if (!channel.replay || replaying) {
                push(current);
                return;
            }
            replaying = true;
            void (async () => {
                for (const [index, frame] of frames.entries()) {
                    if (index > 0) await sleep(PANEL_REPLAY_DELAY_MS);
                    push(frame);
                }
            })();
            return;
        }
        if (parsed.type === "controlPanel.toggleTree") {
            const collapsed = { ...current.ui.collapsed } as Partial<
                Record<ControlPanelTreeKind, boolean>
            >;
            collapsed[parsed.kind] = !collapsed[parsed.kind];
            push({ ...current, ui: { ...current.ui, collapsed } });
        }
    });
}

function safeParse(text: string): unknown {
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return null;
    }
}
