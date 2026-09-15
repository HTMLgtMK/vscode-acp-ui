import { connect, type Socket } from "node:net";
import { Readable, Writable } from "node:stream";
import type {
    AcpAgentTransport,
    AcpAgentTransportConnection,
    AcpAgentTransportConnectRequest,
} from "../ports/agentTransport";

export type SocketAcpAgentTransportOptions = {
    /** Unix socket path of the already-running ACP daemon. */
    socketPath: string;
};

/**
 * {@link AcpAgentTransport} that connects to an already-running ACP daemon over a
 * unix socket speaking standard ACP NDJSON JSON-RPC (one connection per chat session;
 * a daemon serves many sessions).
 */
export class SocketAcpAgentTransport implements AcpAgentTransport {
    constructor(private readonly options: SocketAcpAgentTransportOptions) {}

    async connect(
        request: AcpAgentTransportConnectRequest,
    ): Promise<AcpAgentTransportConnection> {
        const socketPath = this.options.socketPath;
        const socket = await this.openSocket(request.agentName);
        let notifiedDisconnect = false;
        const notifyDisconnect = (): void => {
            if (notifiedDisconnect) {
                return;
            }
            notifiedDisconnect = true;
            request.onDisconnected?.();
        };
        socket.on("close", () => {
            console.error(
                `[ACP Agent ${request.agentName}] socket closed path="${socketPath}"`,
            );
            notifyDisconnect();
        });
        socket.on("error", (err) => {
            console.error(
                `[ACP Agent ${request.agentName}] socket error path="${socketPath}" message="${err.message}"`,
            );
        });

        return {
            fromAgent: Readable.toWeb(socket) as ReadableStream<Uint8Array>,
            toAgent: Writable.toWeb(socket) as WritableStream<Uint8Array>,
            dispose(): void {
                socket.destroy();
            },
        };
    }

    private openSocket(agentName: string): Promise<Socket> {
        const socketPath = this.options.socketPath;
        return new Promise<Socket>((resolve, reject) => {
            console.info(
                `[ACP Agent ${agentName}] connecting to ACP daemon socket="${socketPath}"`,
            );
            const socket = connect(socketPath);
            const onConnect = (): void => {
                socket.removeListener("error", onError);
                resolve(socket);
            };
            const onError = (err: Error): void => {
                socket.removeListener("connect", onConnect);
                reject(
                    new Error(
                        `Failed to connect to ACP daemon socket "${socketPath}": ${err.message}`,
                    ),
                );
            };
            socket.once("connect", onConnect);
            socket.once("error", onError);
        });
    }
}
