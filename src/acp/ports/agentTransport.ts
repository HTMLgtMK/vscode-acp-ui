/**
 * Transport port for ACP agent connections (hexagonal): how to obtain the ACP wire
 * to an agent. The wire contract is standard ACP NDJSON JSON-RPC, so connections are
 * byte duplexes that plug into `acp.ndJsonStream` and the `@agentclientprotocol/sdk`
 * client side (`ClientSideConnection`).
 *
 * The default implementation spawns an agent subprocess (`SpawnAcpAgentTransport`);
 * hosts may inject alternatives, e.g. connecting to an already-running ACP daemon
 * over a unix socket (`SocketAcpAgentTransport`).
 */
export type AcpAgentTransportConnectRequest = {
    /** Display name used for transport logs. */
    agentName: string;
    /** Invoked once when the underlying connection drops (subprocess exit / socket close). */
    onDisconnected?: () => void;
};

/** One open ACP connection to an agent. */
export type AcpAgentTransportConnection = {
    /** Bytes received from the agent; feed into `acp.ndJsonStream`. */
    readonly fromAgent: ReadableStream<Uint8Array>;
    /** Bytes sent to the agent; feed into `acp.ndJsonStream`. */
    readonly toAgent: WritableStream<Uint8Array>;
    /** Tears down the underlying transport (kills the subprocess, closes the socket). */
    dispose(): void;
};

export interface AcpAgentTransport {
    /** Opens the ACP wire to the agent. */
    connect(
        request: AcpAgentTransportConnectRequest,
    ): Promise<AcpAgentTransportConnection>;
}
