import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtensionToWebviewMessage } from "../../protocol/extensionHostMessages";
import { SocketAcpAgentTransport } from "../infrastructure/socketAcpAgentTransport";
import { NullAcpRpcNdjsonSink } from "../ports/rpcNdjsonSink";
import {
    MockAcpNdjsonDaemon,
    type MockAcpNdjsonDaemonOptions,
} from "../testing/mockAcpNdjsonDaemon";
import { AcpSessionBridge } from "./acpSessionBridge";

const startedDaemons: MockAcpNdjsonDaemon[] = [];

afterEach(async () => {
    for (const daemon of startedDaemons.splice(0)) {
        await daemon.close();
    }
});

async function startDaemon(
    options: MockAcpNdjsonDaemonOptions = {},
): Promise<MockAcpNdjsonDaemon> {
    const daemon = await MockAcpNdjsonDaemon.start(options);
    startedDaemons.push(daemon);
    return daemon;
}

type AppendAgentTextMessage = Extract<
    ExtensionToWebviewMessage,
    { type: "appendAgentText" }
>;

function isAppendAgentText(
    message: ExtensionToWebviewMessage,
): message is AppendAgentTextMessage {
    return message.type === "appendAgentText";
}

function bridgeFor(
    daemon: MockAcpNdjsonDaemon,
    messages: ExtensionToWebviewMessage[],
): AcpSessionBridge {
    return new AcpSessionBridge(
        {
            name: "Mock Daemon",
            command: "unused",
            socketPath: daemon.socketPath,
        },
        (message) => {
            messages.push(message);
        },
        {
            hostFilesystem: {
                readTextFile: async () => "",
                writeTextFile: async () => {},
            },
            rpcNdjsonSink: new NullAcpRpcNdjsonSink(),
            getWorkspaceRoot: () => "/test/workspace",
            createAgentTransport: () =>
                new SocketAcpAgentTransport({
                    socketPath: daemon.socketPath,
                }),
        },
    );
}

describe("AcpSessionBridge over the socket transport", () => {
    it("connects, streams prompt updates to the UI, and cancels mid-turn", async () => {
        let finishPrompt: ((stopReason: string) => void) | undefined;
        const daemon = await startDaemon({
            onPrompt: (mock) => {
                mock.notifySessionUpdate("mock-session", {
                    sessionUpdate: "agent_message_chunk",
                    content: { type: "text", text: "Hello" },
                });
                mock.notifySessionUpdate("mock-session", {
                    sessionUpdate: "agent_message_chunk",
                    content: { type: "text", text: " from the daemon" },
                });
                return new Promise<string>((resolve) => {
                    finishPrompt = resolve;
                });
            },
            onCancel: () => finishPrompt?.("cancelled"),
        });

        const messages: ExtensionToWebviewMessage[] = [];
        const bridge = new AcpSessionBridge(
            {
                name: "Mock Daemon",
                command: "unused",
                socketPath: daemon.socketPath,
            },
            (message) => {
                messages.push(message);
            },
            {
                hostFilesystem: {
                    readTextFile: async () => "",
                    writeTextFile: async () => {},
                },
                rpcNdjsonSink: new NullAcpRpcNdjsonSink(),
                getWorkspaceRoot: () => "/test/workspace",
                createAgentTransport: () =>
                    new SocketAcpAgentTransport({
                        socketPath: daemon.socketPath,
                    }),
            },
        );
        try {
            await bridge.connect();
            expect(bridge.sessionId).toBe("mock-session");
            expect(daemon.recordedByMethod("initialize")).toHaveLength(1);
            expect(daemon.recordedByMethod("session/new")).toHaveLength(1);

            const promptPromise = bridge.prompt("hi");
            await vi.waitFor(() => {
                const streamed = messages
                    .filter(isAppendAgentText)
                    .map((message) => message.text)
                    .join("");
                expect(streamed).toBe("Hello from the daemon");
            });
            expect(bridge.isPrompting).toBe(true);

            await bridge.cancel();

            await vi.waitFor(() =>
                expect(daemon.recordedByMethod("session/cancel")).toHaveLength(
                    1,
                ),
            );
            expect(
                daemon.recordedByMethod("session/prompt")[0]?.params,
            ).toMatchObject({
                sessionId: "mock-session",
                prompt: [{ type: "text", text: "hi" }],
            });
            await promptPromise;

            const turnComplete = messages.find(
                (message) => message.type === "turnComplete",
            );
            expect(turnComplete).toMatchObject({
                type: "turnComplete",
                stopReason: "cancelled",
            });
        } finally {
            bridge.dispose();
        }
    });

    it("recreates the session and retries the prompt once after being superseded", async () => {
        let created = 0;
        let prompted = 0;
        const daemon = await startDaemon({
            sessionId: () => `session-${++created}`,
            onPrompt: () => {
                prompted += 1;
                return prompted === 1
                    ? {
                          error: {
                              code: -32000,
                              message: "session no longer active",
                          },
                      }
                    : "end_turn";
            },
        });
        const messages: ExtensionToWebviewMessage[] = [];
        const bridge = bridgeFor(daemon, messages);
        try {
            await bridge.connect();
            expect(bridge.sessionId).toBe("session-1");

            await bridge.prompt("hi");

            expect(daemon.recordedByMethod("session/new")).toHaveLength(2);
            expect(daemon.recordedByMethod("session/prompt")).toHaveLength(2);
            expect(bridge.sessionId).toBe("session-2");
            expect(messages.filter((m) => m.type === "error")).toHaveLength(0);
            expect(
                messages.find((m) => m.type === "turnComplete"),
            ).toMatchObject({ type: "turnComplete", stopReason: "end_turn" });
        } finally {
            bridge.dispose();
        }
    });

    it("surfaces a busy session error without retrying it as auth", async () => {
        const daemon = await startDaemon({
            onPrompt: () => ({
                error: {
                    code: -32000,
                    message: "session busy: a prompt is already in flight",
                },
            }),
        });
        const messages: ExtensionToWebviewMessage[] = [];
        const bridge = bridgeFor(daemon, messages);
        try {
            await bridge.connect();

            await bridge.prompt("hi");

            expect(daemon.recordedByMethod("session/new")).toHaveLength(1);
            expect(messages.find((m) => m.type === "error")).toMatchObject({
                type: "error",
                message: "session busy: a prompt is already in flight",
            });
        } finally {
            bridge.dispose();
        }
    });
});
