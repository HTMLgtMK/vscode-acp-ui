import { describe, expect, it } from "vite-plus/test";
import type { AcpRegistryAgent } from "./types";
import { platformTargetKey, resolveDistributionSpawn } from "./resolveDistribution";

const npxAgent: AcpRegistryAgent = {
    id: "sample-npx-agent",
    name: "Sample Npx Agent",
    version: "1.0.0",
    description: "Fixture agent using npx distribution",
    distribution: {
        npx: {
            package: "@example/sample-acp@1.0.0",
            args: ["--acp"],
        },
    },
};

const uvxAgent: AcpRegistryAgent = {
    id: "sample-uvx-agent",
    name: "Sample Uvx Agent",
    version: "2.0.0",
    description: "Fixture agent using uvx distribution",
    distribution: {
        uvx: {
            package: "sample-acp==2.0.0",
            args: ["-x"],
            env: { SAMPLE_ENV: "1" },
        },
    },
};

const binaryAgent: AcpRegistryAgent = {
    id: "sample-binary-agent",
    name: "Sample Binary Agent",
    version: "3.0.0",
    description: "Fixture agent using binary distribution",
    distribution: {
        binary: {
            "linux-x86_64": {
                archive: "https://example.com/sample-linux-x86_64.tar.gz",
                cmd: "./sample-acp",
                sha256: "abc123",
                args: ["--stdio"],
                env: { BINARY_ENV: "yes" },
            },
        },
    },
};

describe("platformTargetKey", () => {
    it("maps linux x64", () => {
        expect(platformTargetKey("linux", "x64")).toBe("linux-x86_64");
    });

    it("maps darwin arm64", () => {
        expect(platformTargetKey("darwin", "arm64")).toBe("darwin-aarch64");
    });
});

describe("resolveDistributionSpawn", () => {
    it("resolves npx with -y prefix", () => {
        expect(resolveDistributionSpawn(npxAgent)).toEqual({
            name: "Sample Npx Agent",
            command: "npx",
            args: ["-y", "@example/sample-acp@1.0.0", "--acp"],
            registryId: "sample-npx-agent",
        });
    });

    it("resolves uvx with package and env", () => {
        expect(resolveDistributionSpawn(uvxAgent)).toEqual({
            name: "Sample Uvx Agent",
            command: "uvx",
            args: ["sample-acp==2.0.0", "-x"],
            registryId: "sample-uvx-agent",
            env: { SAMPLE_ENV: "1" },
        });
    });

    it("prefers npx over binary when both exist", () => {
        const agent: AcpRegistryAgent = {
            ...npxAgent,
            distribution: {
                npx: npxAgent.distribution.npx,
                binary: binaryAgent.distribution.binary,
            },
        };
        expect(
            resolveDistributionSpawn(agent, { binaryCommandAbsolutePath: "/bin/sample" })?.command,
        ).toBe("npx");
    });

    it("resolves binary only with an absolute command path", () => {
        expect(resolveDistributionSpawn(binaryAgent)).toBeUndefined();
        expect(
            resolveDistributionSpawn(binaryAgent, {
                binaryCommandAbsolutePath: "/opt/sample-acp",
                platform: "linux",
                arch: "x64",
            }),
        ).toEqual({
            name: "Sample Binary Agent",
            command: "/opt/sample-acp",
            args: ["--stdio"],
            registryId: "sample-binary-agent",
            env: { BINARY_ENV: "yes" },
        });
    });
});
