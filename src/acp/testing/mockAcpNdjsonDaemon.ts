import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as acp from "@agentclientprotocol/sdk";

/** One JSON-RPC message received by the mock daemon. */
export type RecordedAcpDaemonMessage = {
    method: string;
    params: unknown;
    /** Present for requests; undefined for notifications. */
    id?: number | string;
};

export type MockAcpNdjsonDaemonOptions = {
    /** `agentCapabilities` returned from `initialize`. */
    agentCapabilities?: acp.AgentCapabilities;
    /** `sessionId` returned from `session/new`. */
    sessionId?: string;
    /**
     * Invoked on `session/prompt`. May stream `session/update` notifications before
     * returning the `stopReason` for the prompt response.
     */
    onPrompt?: (
        daemon: MockAcpNdjsonDaemon,
        params: { sessionId: string },
    ) => string | Promise<string>;
    /** Invoked on the `session/cancel` notification. */
    onCancel?: (
        daemon: MockAcpNdjsonDaemon,
        params: { sessionId: string },
    ) => void;
};

const defaultSessionId = "mock-session";

/**
 * In-process ACP daemon mock for tests: a real unix socket server speaking the minimal
 * ACP NDJSON JSON-RPC surface (`initialize` / `session/new` / `session/prompt` with
 * streaming `session/update` / `session/cancel`). No external process or network is involved.
 */
export class MockAcpNdjsonDaemon {
    readonly socketPath: string;
    /** Client socket connections accepted so far. */
    clientConnectCount = 0;
    /** Client socket connections closed so far. */
    clientDisconnectCount = 0;

    private readonly options: MockAcpNdjsonDaemonOptions;
    private readonly dir: string;
    private readonly server: Server;
    private readonly clientSockets = new Set<Socket>();
    private readonly messages: RecordedAcpDaemonMessage[] = [];
    private readonly connectWaiters: Array<() => void> = [];
    private readonly disconnectWaiters: Array<() => void> = [];

    private constructor(options: MockAcpNdjsonDaemonOptions, dir: string) {
        this.options = options;
        this.dir = dir;
        this.socketPath = join(dir, "agent.sock");
        this.server = createServer((socket) => this.handleConnection(socket));
    }

    /** Starts the daemon on a fresh temporary unix socket. */
    static async start(
        options: MockAcpNdjsonDaemonOptions = {},
    ): Promise<MockAcpNdjsonDaemon> {
        const daemon = new MockAcpNdjsonDaemon(
            options,
            mkdtempSync(join(tmpdir(), "acp-daemon-")),
        );
        await new Promise<void>((resolve, reject) => {
            daemon.server.once("error", reject);
            daemon.server.listen(daemon.socketPath, () => {
                daemon.server.removeListener("error", reject);
                resolve();
            });
        });
        return daemon;
    }

    /** Resolves on the next accepted client connection. */
    waitForClientConnected(): Promise<void> {
        if (this.clientSockets.size > 0) {
            return Promise.resolve();
        }
        return new Promise<void>((resolve) => {
            this.connectWaiters.push(resolve);
        });
    }

    /** Resolves on the next closed client connection. */
    waitForClientDisconnected(): Promise<void> {
        return new Promise<void>((resolve) => {
            this.disconnectWaiters.push(resolve);
        });
    }

    /** Every message received, in order. */
    recordedMessages(): RecordedAcpDaemonMessage[] {
        return [...this.messages];
    }

    /** Messages received for one JSON-RPC method, in order. */
    recordedByMethod(method: string): RecordedAcpDaemonMessage[] {
        return this.messages.filter((message) => message.method === method);
    }

    /** Streams one `session/update` notification to every connected client. */
    notifySessionUpdate(sessionId: string, update: acp.SessionUpdate): void {
        for (const socket of this.clientSockets) {
            this.send(socket, {
                jsonrpc: "2.0",
                method: acp.CLIENT_METHODS.session_update,
                params: { sessionId, update },
            });
        }
    }

    /** Drops every client connection (simulates a daemon crash). */
    terminateClientConnections(): void {
        for (const socket of this.clientSockets) {
            socket.destroy();
        }
    }

    /** Stops listening, drops clients, and removes the temporary socket directory. */
    async close(): Promise<void> {
        this.terminateClientConnections();
        await new Promise<void>((resolve) => {
            this.server.close(() => resolve());
        });
        rmSync(this.dir, { recursive: true, force: true });
    }

    private handleConnection(socket: Socket): void {
        this.clientConnectCount += 1;
        this.clientSockets.add(socket);
        for (const waiter of this.connectWaiters.splice(0)) {
            waiter();
        }
        let buffer = "";
        socket.on("data", (chunk: Buffer) => {
            buffer += chunk.toString("utf8");
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.length > 0) {
                    this.handleLine(socket, trimmed);
                }
            }
        });
        socket.on("error", () => {});
        socket.on("close", () => {
            this.clientSockets.delete(socket);
            this.clientDisconnectCount += 1;
            for (const waiter of this.disconnectWaiters.splice(0)) {
                waiter();
            }
        });
    }

    private handleLine(socket: Socket, line: string): void {
        let message: {
            id?: unknown;
            method?: unknown;
            params?: unknown;
        };
        try {
            message = JSON.parse(line) as typeof message;
        } catch {
            return;
        }
        if (typeof message.method !== "string") {
            return;
        }
        const id =
            typeof message.id === "number" || typeof message.id === "string"
                ? message.id
                : undefined;
        this.messages.push({
            method: message.method,
            params: message.params,
            ...(id !== undefined ? { id } : {}),
        });
        if (id !== undefined) {
            void this.handleRequest(socket, id, message.method, message.params);
            return;
        }
        this.handleNotification(message.method, message.params);
    }

    private async handleRequest(
        socket: Socket,
        id: number | string,
        method: string,
        params: unknown,
    ): Promise<void> {
        if (method === acp.AGENT_METHODS.initialize) {
            this.send(socket, {
                jsonrpc: "2.0",
                id,
                result: {
                    protocolVersion: acp.PROTOCOL_VERSION,
                    agentCapabilities: this.options.agentCapabilities ?? {},
                    authMethods: [],
                },
            });
            return;
        }
        if (method === acp.AGENT_METHODS.session_new) {
            this.send(socket, {
                jsonrpc: "2.0",
                id,
                result: {
                    sessionId: this.options.sessionId ?? defaultSessionId,
                },
            });
            return;
        }
        if (method === acp.AGENT_METHODS.session_prompt) {
            const sessionId = sessionIdFromParams(params);
            const stopReason =
                (await this.options.onPrompt?.(this, { sessionId })) ??
                "end_turn";
            this.send(socket, {
                jsonrpc: "2.0",
                id,
                result: { stopReason },
            });
            return;
        }
        this.send(socket, {
            jsonrpc: "2.0",
            id,
            error: {
                code: -32601,
                message: `Mock ACP daemon does not implement ${method}`,
            },
        });
    }

    private handleNotification(method: string, params: unknown): void {
        if (method === acp.AGENT_METHODS.session_cancel) {
            this.options.onCancel?.(this, {
                sessionId: sessionIdFromParams(params),
            });
        }
    }

    private send(socket: Socket, payload: Record<string, unknown>): void {
        if (socket.destroyed) {
            return;
        }
        socket.write(`${JSON.stringify(payload)}\n`);
    }
}

function sessionIdFromParams(params: unknown): string {
    if (params === null || typeof params !== "object") {
        return defaultSessionId;
    }
    const sessionId = (params as { sessionId?: unknown }).sessionId;
    return typeof sessionId === "string" ? sessionId : defaultSessionId;
}
