import { describe, expect, it } from "vitest";
import type { ControlPanelSnapshot } from "../src/protocol/controlPanelMessages";
import {
    bridgeAddress,
    bridgeValue,
    DEFAULT_PANEL_FIXTURE,
    type PanelSocket,
    parsePanelChannel,
    readPanelSnapshots,
    serveControlPanelSocket,
    snapshotIssue,
    withBridgeAddress,
} from "./panelBridge";

/**
 * 浏览器端控制面板那条 WS 通道（T043 / T045）的判据。
 * 全部不碰网络：`PanelSocket` 是三个回调，夹具读取也能换假的 —— 真文件那一条单独验形状。
 */

const ADDRESS = "ws://127.0.0.1:5241";

function fakeSocket(): {
    socket: PanelSocket;
    sent: Record<string, unknown>[];
    closed: string[];
    feed: (text: string) => void;
} {
    const sent: Record<string, unknown>[] = [];
    const closed: string[] = [];
    let handler: ((text: string) => void) | null = null;
    return {
        sent,
        closed,
        socket: {
            send: (text) => {
                sent.push(JSON.parse(text) as Record<string, unknown>);
            },
            close: (reason) => {
                closed.push(reason);
            },
            onMessage: (next) => {
                handler = next;
            },
        },
        feed: (text) => {
            handler?.(text);
        },
    };
}

/** 等一个宏任务：微任务队列（含异步回放循环）全跑完。 */
function flush(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

function frame(
    overrides: Partial<ControlPanelSnapshot> = {},
): ControlPanelSnapshot {
    return {
        brand: { name: "goworker", version: "0.1.0" },
        chats: [],
        workers: [],
        tasks: [],
        connection: [
            { label: "dispatcher", value: "acp.sock · 2 workers", state: "up" },
        ],
        account: { placeholder: true },
        ui: { collapsed: {}, canCreateChat: true },
        ...overrides,
    };
}

/** 拿一份假夹具喂 serve：不读磁盘，专测时序与折叠回推。 */
function serveWith(
    socket: PanelSocket,
    snapshots: ControlPanelSnapshot[],
    extra: { replay?: boolean; feedDelay?: boolean } = {},
): void {
    const text = snapshots
        .map((snapshot) => JSON.stringify(snapshot))
        .join("\n");
    serveControlPanelSocket(socket, {
        requestUrl: `/?channel=controlPanel&fixture=unit${extra.replay ? "&replay=1" : ""}`,
        address: ADDRESS,
        read: (path) => (path.endsWith("unit.ndjson") ? text : null),
        sleep: () => Promise.resolve(),
        log: () => {},
    });
}

describe("认出面板那条连接", () => {
    it("没有 channel 参数就不是面板（chat 那条照原路走）", () => {
        expect(parsePanelChannel("/")).toBeNull();
        expect(parsePanelChannel(undefined)).toBeNull();
        expect(parsePanelChannel("/?channel=acpUi")).toBeNull();
    });

    it("是面板时补上默认夹具名", () => {
        expect(parsePanelChannel("/?channel=controlPanel")).toEqual({
            fixture: DEFAULT_PANEL_FIXTURE,
            replay: false,
        });
    });

    it("replay 只认 1 / true，别的一律当关", () => {
        expect(
            parsePanelChannel("/?channel=controlPanel&fixture=stale&replay=1")
                ?.replay,
        ).toBe(true);
        expect(
            parsePanelChannel("/?channel=controlPanel&replay=true")?.replay,
        ).toBe(true);
        expect(
            parsePanelChannel("/?channel=controlPanel&replay=0")?.replay,
        ).toBe(false);
        expect(
            parsePanelChannel("/?channel=controlPanel&fixture=progressive")
                ?.fixture,
        ).toBe("progressive");
    });
});

describe("connection 区换成桥地址（T045）", () => {
    it("套接字换成桥地址，后面那句说明留着", () => {
        expect(bridgeValue("acp.sock · 2 workers", ADDRESS)).toBe(
            `${ADDRESS} · 2 workers`,
        );
    });

    it("整行只有一个套接字时就是桥地址", () => {
        expect(bridgeValue("vscode.sock", ADDRESS)).toBe(ADDRESS);
    });

    it("daemon 那句失败文本不留：一行里不该出现两个桥地址、也不该出现 unix 路径", () => {
        const value = bridgeValue(
            "acp.sock · connect ENOENT /Users/me/.config/goworker/dispatch/acp.sock",
            ADDRESS,
        );
        expect(value).toBe(ADDRESS);
        expect(value).not.toContain(".sock");
        expect(value).not.toContain("/Users/");
        expect(value.match(/ws:\/\//g) ?? []).toHaveLength(1);
    });

    it("只动 connection 那几行，别的一字不变", () => {
        const base = frame({
            chats: [{ id: "chat:a", label: "一条会话" }],
            offline: { title: "t", detail: "d" },
        });
        const next = withBridgeAddress(base, ADDRESS);
        expect(next.connection[0]?.value).toBe(`${ADDRESS} · 2 workers`);
        expect({ ...next, connection: base.connection }).toEqual(base);
    });

    it("非套接字的那些行原样留着（dispatch dir 是目录，不是连接）", () => {
        const next = withBridgeAddress(
            frame({
                connection: [
                    { label: "dispatcher", value: "acp.sock", state: "up" },
                    {
                        label: "dispatch dir",
                        value: "~/…/goworker",
                        state: "unknown",
                    },
                ],
            }),
            ADDRESS,
        );
        expect(next.connection[1]?.value).toBe("~/…/goworker");
    });
});

describe("夹具读出来得是完整快照", () => {
    it("仓库里那份 progressive 真读得出来，四帧、形状都过", () => {
        const loaded = readPanelSnapshots(DEFAULT_PANEL_FIXTURE);
        expect(loaded.ok).toBe(true);
        if (!loaded.ok) return;
        expect(loaded.snapshots).toHaveLength(4);
        for (const snapshot of loaded.snapshots) {
            expect(snapshotIssue(snapshot)).toBeNull();
        }
        // 四帧是"空态 → 有数据 → 断连 → 恢复"，各帧之间该看得出差别
        const counts = loaded.snapshots.map((s) => s.tasks.length);
        expect(counts[0]).toBe(0);
        expect(counts[1]).toBeGreaterThan(0);
        expect(loaded.snapshots[2]?.offline?.title).toBeTruthy();
        expect(loaded.snapshots[3]?.offline ?? null).toBeNull();
    });

    it("内置档位那三个名字直接给一份", () => {
        for (const state of ["ready", "stale", "empty"]) {
            const loaded = readPanelSnapshots(state);
            expect(loaded.ok).toBe(true);
            if (!loaded.ok) return;
            expect(loaded.snapshots).toHaveLength(1);
            expect(loaded.source).toBe(`devFixtures:${state}`);
        }
    });

    it("夹具名带斜杠或大写就不合法，不去拼路径", () => {
        expect(readPanelSnapshots("../etc/passwd", () => "{}").ok).toBe(false);
        expect(readPanelSnapshots("Bad_Name", () => "{}")).toEqual({
            ok: false,
            reason: "夹具名不合法：Bad_Name",
        });
    });

    it("文件不存在时说清找的是哪份", () => {
        const loaded = readPanelSnapshots("nope", () => null);
        expect(loaded.ok).toBe(false);
        if (loaded.ok) return;
        expect(loaded.reason).toContain("nope.ndjson 不存在");
    });

    it("某一行坏了就指出是哪一行、坏在哪", () => {
        const good = JSON.stringify(frame());
        const loaded = readPanelSnapshots("broken", (path) =>
            path.endsWith("broken.ndjson") ? `${good}\n{不是 JSON\n` : null,
        );
        expect(loaded.ok).toBe(false);
        if (loaded.ok) return;
        expect(loaded.reason).toContain("第 2 行");
    });

    it("形状不对的那一行也说得出缺哪格", () => {
        const raw = JSON.stringify({ ...frame(), connection: undefined });
        const loaded = readPanelSnapshots("shape", (path) =>
            path.endsWith("shape.ndjson") ? raw : null,
        );
        expect(loaded.ok).toBe(false);
        if (loaded.ok) return;
        expect(loaded.reason).toContain("connection 不是数组");
    });
});

describe("面板那条连接的时序", () => {
    it("收到 ready 才推，且只推最后一帧", () => {
        const { socket, sent, feed } = fakeSocket();
        serveWith(socket, [
            frame({ brand: { name: "一", version: "0.1.0" } }),
            frame({ brand: { name: "二", version: "0.1.0" } }),
        ]);
        expect(sent).toHaveLength(0);
        feed(JSON.stringify({ type: "controlPanel.ready" }));
        expect(sent).toHaveLength(1);
        expect((sent[0]?.snapshot as ControlPanelSnapshot).brand.name).toBe(
            "二",
        );
        expect(sent[0]?.type).toBe("controlPanel");
    });

    it("replay=1 时每帧都推一遍", async () => {
        const { socket, sent, feed } = fakeSocket();
        serveWith(socket, [frame(), frame(), frame()], { replay: true });
        feed(JSON.stringify({ type: "controlPanel.ready" }));
        // 回放是异步的（每帧之间要等），让微任务与定时器跑完再数。
        await flush();
        expect(sent).toHaveLength(3);
    });

    it("推出去的每一帧，connection 那行都是桥地址", () => {
        const { socket, sent, feed } = fakeSocket();
        serveWith(socket, [frame(), frame()]);
        feed(JSON.stringify({ type: "controlPanel.ready" }));
        for (const message of sent) {
            const snapshot = message.snapshot as ControlPanelSnapshot;
            expect(snapshot.connection[0]?.value).toBe(
                `${ADDRESS} · 2 workers`,
            );
        }
    });

    it("折叠上行：翻那一格再推一份完整快照", () => {
        const { socket, sent, feed } = fakeSocket();
        serveWith(socket, [frame()]);
        feed(JSON.stringify({ type: "controlPanel.ready" }));
        feed(
            JSON.stringify({ type: "controlPanel.toggleTree", kind: "worker" }),
        );
        expect(sent).toHaveLength(2);
        const after = sent[1]?.snapshot as ControlPanelSnapshot;
        expect(after.ui.collapsed?.worker).toBe(true);
        feed(
            JSON.stringify({ type: "controlPanel.toggleTree", kind: "worker" }),
        );
        const back = (sent[2]?.snapshot as ControlPanelSnapshot).ui.collapsed;
        expect(back?.worker).toBe(false);
        // 全量快照：折叠之外的那些字段一份不少
        expect((sent[2]?.snapshot as ControlPanelSnapshot).brand.name).toBe(
            "goworker",
        );
    });

    it("浏览器里没有的行为只记不动：点行 / 新建 / 开设置都不会多推一份", () => {
        const { socket, sent, feed } = fakeSocket();
        serveWith(socket, [frame()]);
        feed(JSON.stringify({ type: "controlPanel.ready" }));
        const before = sent.length;
        feed(
            JSON.stringify({
                type: "controlPanel.select",
                id: "task:x",
                kind: "task",
            }),
        );
        feed(JSON.stringify({ type: "controlPanel.newChat" }));
        feed(JSON.stringify({ type: "controlPanel.openSettings" }));
        expect(sent).toHaveLength(before);
    });

    it("ready 之后上行不合法就丢掉整条，不补推快照也不崩", async () => {
        const { socket, sent, feed } = fakeSocket();
        serveWith(socket, [frame()]);
        feed(JSON.stringify({ type: "controlPanel.ready" }));
        sent.length = 0; // 只关心坏上行有没有多出东西
        feed("{{{ 不是 JSON");
        feed(
            JSON.stringify({
                type: "controlPanel.select",
                id: 42,
                kind: "task",
            }),
        );
        feed(JSON.stringify({ nope: true }));
        feed("[]");
        await flush();
        expect(sent).toHaveLength(0);
    });

    it("没连上 ready 之前断开：close 带原因，不发半帧", () => {
        const { socket, sent, closed } = fakeSocket();
        serveControlPanelSocket(socket, {
            requestUrl: "/?channel=controlPanel&fixture=missing-here",
            address: ADDRESS,
            read: () => null,
            log: () => {},
        });
        expect(sent).toHaveLength(0);
        expect(closed).toHaveLength(1);
        expect(closed[0]).toContain("missing-here.ndjson 不存在");
    });

    it("不是面板那条连接就当场关，别占着 chat 的桥", () => {
        const { socket, closed } = fakeSocket();
        serveControlPanelSocket(socket, {
            requestUrl: "/",
            address: ADDRESS,
            read: () => null,
            log: () => {},
        });
        expect(closed).toEqual(["不是控制面板那条通道"]);
    });

    it("桥地址就是页面连上的那个 host:port", () => {
        expect(bridgeAddress("127.0.0.1:5241")).toBe("ws://127.0.0.1:5241");
    });
});
