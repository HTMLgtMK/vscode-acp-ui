import { tmpdir } from "node:os";
import { join } from "node:path";
import * as acp from "@agentclientprotocol/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
    AcpRpcNdjsonLineContext,
    AcpRpcNdjsonSink,
} from "../ports/rpcNdjsonSink";
import { NullAcpRpcNdjsonSink } from "../ports/rpcNdjsonSink";
import {
    MockAcpNdjsonDaemon,
    type MockAcpNdjsonDaemonOptions,
} from "../testing/mockAcpNdjsonDaemon";
import { AcpAgentProcess } from "./acpAgentProcess";
import { SocketAcpAgentTransport } from "./socketAcpAgentTransport";

const workspaceRoot = "/test/workspace";

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

function createProcess(
    daemon: MockAcpNdjsonDaemon,
    options: {
        onProcessExit?: () => void;
        rpcNdjsonSink?: AcpRpcNdjsonSink;
    } = {},
): AcpAgentProcess {
    return new AcpAgentProcess({
        config: {
            name: "Mock Daemon",
            command: "unused",
            socketPath: daemon.socketPath,
        },
        requestPermission: async () => ({ outcome: { outcome: "cancelled" } }),
        hostFilesystem: {
            readTextFile: async () => "",
            writeTextFile: async () => {},
        },
        rpcNdjsonSink: options.rpcNdjsonSink ?? new NullAcpRpcNdjsonSink(),
        getWorkspaceRoot: () => workspaceRoot,
        ...(options.onProcessExit !== undefined
            ? { onProcessExit: options.onProcessExit }
            : {}),
    });
}

function chunkText(notification: acp.SessionNotification): string {
    const update = notification.update;
    if (update.sessionUpdate !== "agent_message_chunk") {
        return "";
    }
    return update.content.type === "text" ? update.content.text : "";
}

describe("SocketAcpAgentTransport", () => {
    it("connects to the daemon socket and disposes the connection", async () => {
        const daemon = await startDaemon();
        const onDisconnected = vi.fn();
        const connection = await new SocketAcpAgentTransport({
            socketPath: daemon.socketPath,
        }).connect({ agentName: "Mock Daemon", onDisconnected });

        await daemon.waitForClientConnected();
        expect(daemon.clientConnectCount).toBe(1);
        expect(connection.fromAgent).toBeInstanceOf(ReadableStream);
        expect(connection.toAgent).toBeInstanceOf(WritableStream);

        connection.dispose();
        await vi.waitFor(() => expect(daemon.clientDisconnectCount).toBe(1));
        await vi.waitFor(() => expect(onDisconnected).toHaveBeenCalledTimes(1));
    });

    it("rejects with the socket path when no daemon is listening", async () => {
        const transport = new SocketAcpAgentTransport({
            socketPath: join(tmpdir(), "acp-ui-missing-daemon.sock"),
        });
        await expect(
            transport.connect({ agentName: "Mock Daemon" }),
        ).rejects.toThrow("acp-ui-missing-daemon.sock");
    });
});

describe("AcpAgentProcess over the socket transport", () => {
    it("initializes and creates a session through the daemon", async () => {
        const daemon = await startDaemon({
            agentCapabilities: { loadSession: true },
        });
        const onProcessExit = vi.fn();
        const agentProcess = createProcess(daemon, { onProcessExit });
        try {
            const init = await agentProcess.start();
            expect(init.protocolVersion).toBe(acp.PROTOCOL_VERSION);
            expect(init.agentCapabilities).toMatchObject({ loadSession: true });
            expect(agentProcess.supportsLoadSession()).toBe(true);
            expect(agentProcess.getInitializeResponse()).toMatchObject({
                protocolVersion: acp.PROTOCOL_VERSION,
            });
            expect(
                daemon.recordedByMethod("initialize")[0]?.params,
            ).toMatchObject({
                protocolVersion: acp.PROTOCOL_VERSION,
                clientInfo: { name: "ib-acp-ui" },
                clientCapabilities: {
                    fs: { readTextFile: true, writeTextFile: true },
                },
            });

            const session = await agentProcess.newSession();
            expect(session.sessionId).toBe("mock-session");
            expect(
                daemon.recordedByMethod("session/new")[0]?.params,
            ).toMatchObject({
                cwd: workspaceRoot,
            });
            expect(onProcessExit).not.toHaveBeenCalled();
        } finally {
            agentProcess.dispose();
        }
    });

    it("receives streamed session/update notifications during a prompt", async () => {
        const daemon = await startDaemon({
            onPrompt: (mock) => {
                mock.notifySessionUpdate("mock-session", {
                    sessionUpdate: "agent_message_chunk",
                    content: { type: "text", text: "Hel" },
                });
                mock.notifySessionUpdate("mock-session", {
                    sessionUpdate: "agent_message_chunk",
                    content: { type: "text", text: "lo" },
                });
                return "end_turn";
            },
        });
        const agentProcess = createProcess(daemon);
        const updates: acp.SessionNotification[] = [];
        try {
            await agentProcess.start();
            await agentProcess.newSession();
            agentProcess.onSessionUpdate((params) => updates.push(params));

            const result = await agentProcess.prompt("mock-session", "hi");

            expect(result.stopReason).toBe("end_turn");
            expect(
                daemon.recordedByMethod("session/prompt")[0]?.params,
            ).toMatchObject({
                sessionId: "mock-session",
                prompt: [{ type: "text", text: "hi" }],
            });
            expect(updates).toHaveLength(2);
            expect(updates.map(chunkText).join("")).toBe("Hello");
            expect(updates[0]?.sessionId).toBe("mock-session");
        } finally {
            agentProcess.dispose();
        }
    });

    it("delivers session/cancel to the daemon mid-prompt", async () => {
        let finishPrompt: ((stopReason: string) => void) | undefined;
        const daemon = await startDaemon({
            onPrompt: (mock) => {
                mock.notifySessionUpdate("mock-session", {
                    sessionUpdate: "agent_message_chunk",
                    content: { type: "text", text: "working" },
                });
                return new Promise<string>((resolve) => {
                    finishPrompt = resolve;
                });
            },
            onCancel: () => finishPrompt?.("cancelled"),
        });
        const agentProcess = createProcess(daemon);
        const updates: acp.SessionNotification[] = [];
        try {
            await agentProcess.start();
            await agentProcess.newSession();
            agentProcess.onSessionUpdate((params) => updates.push(params));

            const promptPromise = agentProcess.prompt("mock-session", "hi");
            await vi.waitFor(() => expect(updates).toHaveLength(1));

            await agentProcess.cancel("mock-session");

            await vi.waitFor(() =>
                expect(daemon.recordedByMethod("session/cancel")).toHaveLength(
                    1,
                ),
            );
            expect(
                daemon.recordedByMethod("session/cancel")[0]?.params,
            ).toEqual({
                sessionId: "mock-session",
            });
            expect((await promptPromise).stopReason).toBe("cancelled");
        } finally {
            agentProcess.dispose();
        }
    });

    it("reports disconnect when the daemon drops the connection", async () => {
        const daemon = await startDaemon();
        const onProcessExit = vi.fn();
        const agentProcess = createProcess(daemon, { onProcessExit });
        try {
            await agentProcess.start();
            daemon.terminateClientConnections();
            await vi.waitFor(() =>
                expect(onProcessExit).toHaveBeenCalledTimes(1),
            );
        } finally {
            agentProcess.dispose();
        }
    });

    it("logs raw NDJSON-RPC lines in both directions when logging is enabled", async () => {
        const daemon = await startDaemon();
        const entries: Array<{ line: string; direction?: string }> = [];
        const agentProcess = createProcess(daemon, {
            rpcNdjsonSink: {
                isLoggingEnabled: true,
                appendRawNdjsonLine: (
                    line: string,
                    context?: AcpRpcNdjsonLineContext,
                ) => {
                    entries.push({ line, direction: context?.direction });
                },
            },
        });
        try {
            await agentProcess.start();
            const towardAgent = entries
                .filter((entry) => entry.direction === "toAgent")
                .map((entry) => entry.line);
            const fromAgent = entries
                .filter((entry) => entry.direction === "fromAgent")
                .map((entry) => entry.line);
            expect(
                towardAgent.some((line) =>
                    line.includes('"method":"initialize"'),
                ),
            ).toBe(true);
            expect(
                fromAgent.some((line) => line.includes('"agentCapabilities"')),
            ).toBe(true);
            expect(
                towardAgent.some((line) =>
                    line.includes('"agentCapabilities"'),
                ),
            ).toBe(false);
            expect(
                fromAgent.some((line) =>
                    line.includes('"method":"initialize"'),
                ),
            ).toBe(false);
        } finally {
            agentProcess.dispose();
        }
    });
});
