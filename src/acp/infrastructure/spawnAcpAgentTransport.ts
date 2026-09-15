import { type ChildProcess, spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";
import type { AcpAgentSpawnConfig } from "../domain/agentSpawnConfig";
import type {
    AcpAgentTransport,
    AcpAgentTransportConnection,
    AcpAgentTransportConnectRequest,
} from "../ports/agentTransport";

export type SpawnAcpAgentTransportOptions = {
    config: AcpAgentSpawnConfig;
    /** Workspace folder used for the subprocess `cwd`. */
    getWorkspaceRoot: () => string | undefined;
};

/**
 * Default {@link AcpAgentTransport}: spawns the agent subprocess and speaks standard
 * ACP NDJSON JSON-RPC over its stdio. This is the historical behavior of `AcpAgentProcess`.
 */
export class SpawnAcpAgentTransport implements AcpAgentTransport {
    constructor(private readonly options: SpawnAcpAgentTransportOptions) {}

    async connect(
        request: AcpAgentTransportConnectRequest,
    ): Promise<AcpAgentTransportConnection> {
        const { config } = this.options;
        const cwd = this.options.getWorkspaceRoot();
        const env = { ...process.env, ...config.env };

        console.info(
            `[ACP Agent ${config.name}] spawning command="${config.command}" args=${JSON.stringify(config.args)} cwd="${cwd ?? "<undefined>"}"`,
        );

        const child: ChildProcess = spawn(config.command, config.args, {
            stdio: ["pipe", "pipe", "pipe"],
            cwd,
            env,
        });

        child.stderr?.on("data", (chunk: Buffer) => {
            const text = chunk.toString();
            console.error(`[ACP Agent ${config.name}] stderr: ${text}`);
        });

        child.on("error", (err) => {
            const nodeErr = err as NodeJS.ErrnoException;
            console.error(
                `[ACP Agent ${config.name}] process error code=${nodeErr.code ?? "unknown"} message="${nodeErr.message}" command="${config.command}"`,
                err,
            );
        });

        child.on("exit", (code, signal) => {
            console.error(
                `[ACP Agent ${config.name}] exited code=${code ?? "null"} signal=${signal ?? "null"}`,
            );
            request.onDisconnected?.();
        });

        child.on("close", (code, signal) => {
            console.error(
                `[ACP Agent ${config.name}] stdio closed code=${code ?? "null"} signal=${signal ?? "null"}`,
            );
        });

        const stdin = child.stdin;
        const stdout = child.stdout;
        if (stdin === null || stdout === null) {
            child.kill();
            throw new Error(
                `Agent subprocess "${config.name}" has no stdio streams (stdio=pipe).`,
            );
        }

        return {
            fromAgent: Readable.toWeb(stdout) as ReadableStream<Uint8Array>,
            toAgent: Writable.toWeb(stdin) as WritableStream<Uint8Array>,
            dispose(): void {
                child.kill();
            },
        };
    }
}
