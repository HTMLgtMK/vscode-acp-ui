import type { AcpAgentSpawnConfig } from "../domain/agentSpawnConfig";
import type { AcpAgentTransport } from "../ports/agentTransport";
import { SocketAcpAgentTransport } from "./socketAcpAgentTransport";
import { SpawnAcpAgentTransport } from "./spawnAcpAgentTransport";

export type DefaultAcpAgentTransportOptions = {
    config: AcpAgentSpawnConfig;
    /** Workspace folder used for the subprocess `cwd` (spawn transport only). */
    getWorkspaceRoot: () => string | undefined;
};

/**
 * Resolves the default transport for an agent config: the unix-socket daemon
 * transport when `socketPath` is configured, otherwise spawning a subprocess.
 */
export function createDefaultAcpAgentTransport(
    options: DefaultAcpAgentTransportOptions,
): AcpAgentTransport {
    const socketPath = options.config.socketPath?.trim();
    if (socketPath !== undefined && socketPath.length > 0) {
        return new SocketAcpAgentTransport({ socketPath });
    }
    return new SpawnAcpAgentTransport({
        config: options.config,
        getWorkspaceRoot: options.getWorkspaceRoot,
    });
}
