import { describe, expect, it } from "vitest";
import { createDefaultAcpAgentTransport } from "./defaultAcpAgentTransport";
import { SocketAcpAgentTransport } from "./socketAcpAgentTransport";
import { SpawnAcpAgentTransport } from "./spawnAcpAgentTransport";

const baseConfig = { name: "Test", command: "echo", args: [] };

describe("createDefaultAcpAgentTransport", () => {
    it("returns the spawn transport when no socketPath is configured", () => {
        expect(
            createDefaultAcpAgentTransport({
                config: baseConfig,
                getWorkspaceRoot: () => undefined,
            }),
        ).toBeInstanceOf(SpawnAcpAgentTransport);
    });

    it("returns the socket transport when socketPath is configured", () => {
        expect(
            createDefaultAcpAgentTransport({
                config: { ...baseConfig, socketPath: "/tmp/acp.sock" },
                getWorkspaceRoot: () => undefined,
            }),
        ).toBeInstanceOf(SocketAcpAgentTransport);
    });

    it("treats a blank socketPath as unset", () => {
        expect(
            createDefaultAcpAgentTransport({
                config: { ...baseConfig, socketPath: "   " },
                getWorkspaceRoot: () => undefined,
            }),
        ).toBeInstanceOf(SpawnAcpAgentTransport);
    });
});
