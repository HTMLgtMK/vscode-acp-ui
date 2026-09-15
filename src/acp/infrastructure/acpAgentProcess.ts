import * as acp from "@agentclientprotocol/sdk";
import {
    type AcpAgentSpawnConfig,
    isCursorAcpAgent,
    PARAMETERIZED_MODEL_PICKER_META_KEY,
} from "../domain/agentSpawnConfig";
import type {
    AcpAgentTransport,
    AcpAgentTransportConnection,
} from "../ports/agentTransport";
import type { AcpHostFilesystem } from "../ports/hostFilesystem";
import type {
    AcpRpcNdjsonDirection,
    AcpRpcNdjsonSink,
} from "../ports/rpcNdjsonSink";
import { createDefaultAcpAgentTransport } from "./defaultAcpAgentTransport";

/** Node `fs` and VS Code `FileSystemError` both use distinct codes for a missing path. */
function isFileNotFoundError(error: unknown): boolean {
    if (error === null || typeof error !== "object") {
        return false;
    }
    const code = (error as { code?: string }).code;
    return code === "ENOENT" || code === "FileNotFound";
}

/**
 * Passes bytes through while appending each complete NDJSON line to the configured sink.
 */
function createNdjsonRpcLogTap(
    sink: AcpRpcNdjsonSink,
    direction: AcpRpcNdjsonDirection,
    agentName: string,
): TransformStream<Uint8Array, Uint8Array> {
    let buffer = "";
    const decoder = new TextDecoder();
    return new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller): void {
            buffer += decoder.decode(chunk, { stream: true });
            const parts = buffer.split("\n");
            buffer = parts.pop() ?? "";
            for (const part of parts) {
                const trimmed = part.trim();
                if (trimmed.length > 0) {
                    sink.appendRawNdjsonLine(trimmed, {
                        direction,
                        agentName,
                    });
                }
            }
            controller.enqueue(chunk);
        },
        flush(): void {
            const trimmed = buffer.trim();
            if (trimmed.length > 0) {
                sink.appendRawNdjsonLine(trimmed, { direction, agentName });
            }
            buffer = "";
        },
    });
}

/**
 * Inserts raw NDJSON-RPC log taps between a transport connection and the ACP SDK when
 * RPC logging is enabled; returns the streams to hand to `acp.ndJsonStream`.
 */
function tapAcpAgentTransportForRpcLog(
    connection: AcpAgentTransportConnection,
    rpcNdjsonSink: AcpRpcNdjsonSink,
    agentName: string,
): {
    toAgent: WritableStream<Uint8Array>;
    fromAgent: ReadableStream<Uint8Array>;
} {
    if (!rpcNdjsonSink.isLoggingEnabled) {
        return { toAgent: connection.toAgent, fromAgent: connection.fromAgent };
    }
    const toAgentTap = createNdjsonRpcLogTap(
        rpcNdjsonSink,
        "toAgent",
        agentName,
    );
    const fromAgentTap = createNdjsonRpcLogTap(
        rpcNdjsonSink,
        "fromAgent",
        agentName,
    );
    // Pipe failures mean the transport dropped; disconnect is reported via `onDisconnected`.
    void toAgentTap.readable.pipeTo(connection.toAgent).catch(() => {});
    void connection.fromAgent.pipeTo(fromAgentTap.writable).catch(() => {});
    return {
        toAgent: toAgentTap.writable,
        fromAgent: fromAgentTap.readable,
    };
}

/** Callback invoked whenever the agent sends a session/update notification. */
export type SessionUpdateHandler = (params: acp.SessionNotification) => void;

/** Thrown when the agent negotiates an ACP protocol version this client build does not support. */
export class AcpProtocolVersionMismatchError extends Error {
    readonly negotiatedVersion: number;
    readonly supportedVersion: number;

    constructor(negotiatedVersion: number, supportedVersion: number) {
        const direction =
            negotiatedVersion > supportedVersion
                ? "Update ACP UI to a newer version, or use an agent that supports the current protocol."
                : "Update the agent to a newer version, or use an older ACP UI build if one is available.";
        super(
            `ACP protocol version mismatch: ACP UI supports protocol v${supportedVersion} but the agent negotiated v${negotiatedVersion}. ${direction}`,
        );
        this.name = "AcpProtocolVersionMismatchError";
        this.negotiatedVersion = negotiatedVersion;
        this.supportedVersion = supportedVersion;
    }
}

let configuredClientInfo: acp.Implementation | undefined;

/** Sets `clientInfo` sent on every `initialize` (extension package metadata at activation). */
export function configureAcpClientInfo(info: acp.Implementation): void {
    configuredClientInfo = info;
}

/** Builds `clientInfo` from extension `package.json` fields. */
export function buildAcpClientInfoFromPackage(pkg: {
    name?: string;
    version?: string;
    displayName?: string;
}): acp.Implementation {
    const name =
        typeof pkg.name === "string" && pkg.name.length > 0
            ? pkg.name
            : "ib-acp-ui";
    const version =
        typeof pkg.version === "string" && pkg.version.length > 0
            ? pkg.version
            : "0.0.0";
    const title =
        typeof pkg.displayName === "string" && pkg.displayName.length > 0
            ? pkg.displayName
            : "ACP UI";
    return { name, version, title };
}

/** `clientInfo` for the `initialize` request (configured at activation or a safe fallback). */
function buildAcpClientInfo(): acp.Implementation {
    return (
        configuredClientInfo ??
        buildAcpClientInfoFromPackage({
            name: "ib-acp-ui",
            version: "0.0.0",
            displayName: "ACP UI",
        })
    );
}

/** Ensures the negotiated protocol version is supported by this client build. */
export function assertNegotiatedProtocolVersion(
    response: acp.InitializeResponse,
): void {
    if (response.protocolVersion !== acp.PROTOCOL_VERSION) {
        throw new AcpProtocolVersionMismatchError(
            response.protocolVersion,
            acp.PROTOCOL_VERSION,
        );
    }
}

/** Client capabilities for the ACP initialize handshake (matches Zed for Cursor). */
export function buildAcpClientCapabilities(
    config: AcpAgentSpawnConfig,
): acp.ClientCapabilities {
    const capabilities: acp.ClientCapabilities = {
        fs: { readTextFile: true, writeTextFile: true },
    };
    if (isCursorAcpAgent(config)) {
        capabilities._meta = {
            [PARAMETERIZED_MODEL_PICKER_META_KEY]: true,
        };
    }
    return capabilities;
}

/** Resolves `session/request_permission` (UI surfaces this as a dialog). */
export type RequestPermissionHandler = (
    params: acp.RequestPermissionRequest,
) => Promise<acp.RequestPermissionResponse>;

export type AcpAgentProcessOptions = {
    config: AcpAgentSpawnConfig;
    /** Sent on `initialize`; defaults to {@link buildAcpClientInfo}. */
    clientInfo?: acp.Implementation;
    requestPermission: RequestPermissionHandler;
    extMethod?: (
        method: string,
        params: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
    extNotification?: (
        method: string,
        params: Record<string, unknown>,
    ) => Promise<void>;
    /** Called after the agent reads a workspace file via ACP `fs/readTextFile`. */
    onHostFilesystemRead?: (path: string) => void;
    hostFilesystem: AcpHostFilesystem;
    rpcNdjsonSink: AcpRpcNdjsonSink;
    /** Workspace folder used for spawn `cwd` and `session/new` `cwd` metadata. */
    getWorkspaceRoot: () => string | undefined;
    /** Called when the agent connection drops (subprocess exit / socket close). */
    onProcessExit?: () => void;
    /**
     * Transport used to reach the agent. Defaults to the unix-socket daemon transport
     * when `config.socketPath` is configured, otherwise spawning an agent subprocess.
     */
    transport?: AcpAgentTransport;
};

/**
 * Manages the lifecycle of a single ACP agent connection: connect, initialize handshake,
 * session creation, prompting, and teardown. The connection mechanics (spawn vs. socket
 * daemon) are abstracted behind {@link AcpAgentTransport}.
 */
export class AcpAgentProcess {
    private connection: acp.ClientSideConnection | null = null;
    private transportConnection: AcpAgentTransportConnection | null = null;
    private initResponse: acp.InitializeResponse | null = null;
    private sessionUpdateHandler: SessionUpdateHandler | null = null;
    private readonly transport: AcpAgentTransport;

    constructor(private readonly options: AcpAgentProcessOptions) {
        this.transport =
            options.transport ??
            createDefaultAcpAgentTransport({
                config: options.config,
                getWorkspaceRoot: options.getWorkspaceRoot,
            });
    }

    /** Registers a handler that receives every `session/update` notification. */
    onSessionUpdate(handler: SessionUpdateHandler): void {
        this.sessionUpdateHandler = handler;
    }

    async start(): Promise<acp.InitializeResponse> {
        this.transportConnection = await this.transport.connect({
            agentName: this.options.config.name,
            onDisconnected: () => {
                this.connection = null;
                this.options.onProcessExit?.();
            },
        });
        const { toAgent, fromAgent } = tapAcpAgentTransportForRpcLog(
            this.transportConnection,
            this.options.rpcNdjsonSink,
            this.options.config.name,
        );
        const stream = acp.ndJsonStream(toAgent, fromAgent);

        const client: acp.Client = {
            requestPermission: async (params) =>
                this.options.requestPermission(params),
            sessionUpdate: async (params) => {
                this.sessionUpdateHandler?.(params);
            },
            extMethod: async (method, params) => {
                if (this.options.extMethod === undefined) {
                    return {};
                }
                return this.options.extMethod(method, params);
            },
            extNotification: async (method, params) => {
                if (this.options.extNotification === undefined) {
                    return;
                }
                await this.options.extNotification(method, params);
            },
            readTextFile: async (params) => this.handleReadTextFile(params),
            writeTextFile: async (params) => this.handleWriteTextFile(params),
        };

        this.connection = new acp.ClientSideConnection(
            (_agent) => client,
            stream,
        );

        const response = await this.connection.initialize({
            protocolVersion: acp.PROTOCOL_VERSION,
            clientCapabilities: buildAcpClientCapabilities(this.options.config),
            clientInfo: this.options.clientInfo ?? buildAcpClientInfo(),
        });
        assertNegotiatedProtocolVersion(response);

        this.initResponse = response;
        return response;
    }

    async authenticate(methodId: string): Promise<void> {
        if (!this.connection) {
            throw new Error("Agent not started");
        }
        await this.connection.authenticate({ methodId });
    }

    supportsLogout(): boolean {
        return this.initResponse?.agentCapabilities?.auth?.logout != null;
    }

    async logout(): Promise<void> {
        if (!this.connection || !this.supportsLogout()) {
            return;
        }
        await this.connection.logout({});
    }

    getInitializeResponse(): acp.InitializeResponse | null {
        return this.initResponse;
    }

    supportsListSessions(): boolean {
        return (
            this.initResponse?.agentCapabilities?.sessionCapabilities?.list !=
            null
        );
    }

    supportsLoadSession(): boolean {
        return this.initResponse?.agentCapabilities?.loadSession === true;
    }

    supportsDeleteSessions(): boolean {
        const sessionCapabilities = this.initResponse?.agentCapabilities
            ?.sessionCapabilities as { delete?: unknown } | undefined;
        return sessionCapabilities?.delete != null;
    }

    async listSessions(
        params: acp.ListSessionsRequest = {},
    ): Promise<acp.ListSessionsResponse> {
        if (!this.connection) {
            throw new Error("Agent not started");
        }
        if (!this.supportsListSessions()) {
            throw new Error("Agent does not support session/list");
        }
        return this.connection.listSessions(params);
    }

    /** Fetches every page of `session/list` for the given filter. */
    async listAllSessions(cwd?: string): Promise<acp.SessionInfo[]> {
        const sessions: acp.SessionInfo[] = [];
        let cursor: string | null | undefined;
        do {
            const response = await this.listSessions({
                ...(cwd !== undefined ? { cwd } : {}),
                ...(cursor !== undefined && cursor !== null && cursor.length > 0
                    ? { cursor }
                    : {}),
            });
            sessions.push(...response.sessions);
            cursor = response.nextCursor;
        } while (cursor != null && cursor.length > 0);
        return sessions;
    }

    async loadSession(sessionId: string): Promise<acp.LoadSessionResponse> {
        if (!this.connection) {
            throw new Error("Agent not started");
        }
        if (!this.supportsLoadSession()) {
            throw new Error("Agent does not support session/load");
        }
        const cwd = this.options.getWorkspaceRoot() ?? process.cwd();
        return this.connection.loadSession({
            sessionId,
            cwd,
            mcpServers: [],
        });
    }

    async deleteSession(sessionId: string): Promise<void> {
        if (!this.connection) {
            throw new Error("Agent not started");
        }
        if (!this.supportsDeleteSessions()) {
            throw new Error("Agent does not support session/delete");
        }
        await this.connection.deleteSession({ sessionId });
    }

    async newSession(): Promise<acp.NewSessionResponse> {
        if (!this.connection) {
            throw new Error("Agent not started");
        }
        const cwd = this.options.getWorkspaceRoot() ?? process.cwd();
        return this.connection.newSession({ cwd, mcpServers: [] });
    }

    async setSessionModel(sessionId: string, modelId: string): Promise<void> {
        if (!this.connection) {
            throw new Error("Agent not started");
        }
        await this.connection.setSessionMode({ sessionId, modeId: modelId });
    }

    async setSessionConfigOption(
        params: acp.SetSessionConfigOptionRequest,
    ): Promise<acp.SetSessionConfigOptionResponse> {
        if (!this.connection) {
            throw new Error("Agent not started");
        }
        return this.connection.setSessionConfigOption(params);
    }

    async prompt(sessionId: string, text: string): Promise<acp.PromptResponse> {
        if (!this.connection) {
            throw new Error("Agent not started");
        }
        return this.connection.prompt({
            sessionId,
            prompt: [{ type: "text", text }],
        });
    }

    async cancel(sessionId: string): Promise<void> {
        if (!this.connection) {
            return;
        }
        await this.connection.cancel({ sessionId });
    }

    dispose(): void {
        if (this.transportConnection) {
            this.transportConnection.dispose();
            this.transportConnection = null;
        }
        this.connection = null;
        this.initResponse = null;
    }

    private async handleReadTextFile(
        params: acp.ReadTextFileRequest,
    ): Promise<acp.ReadTextFileResponse> {
        try {
            const content = await this.options.hostFilesystem.readTextFile(
                params.path,
            );
            this.options.onHostFilesystemRead?.(params.path);
            return { content };
        } catch (err) {
            // Agents (e.g. Gemini CLI) read before write to merge edits; a missing file must
            // behave like an empty document, not a JSON-RPC error, or create flows fail.
            if (isFileNotFoundError(err)) {
                return { content: "" };
            }
            throw err;
        }
    }

    private async handleWriteTextFile(
        params: acp.WriteTextFileRequest,
    ): Promise<acp.WriteTextFileResponse> {
        await this.options.hostFilesystem.writeTextFile(
            params.path,
            params.content,
        );
        return {};
    }
}
