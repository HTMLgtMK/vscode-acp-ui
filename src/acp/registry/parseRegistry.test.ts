import { describe, expect, it } from "vite-plus/test";
import { parseRegistryCatalog } from "./parseRegistry";

const sampleCatalog = {
    version: "1.0.0-sample",
    agents: [
        {
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
        },
        {
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
        },
        {
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
        },
        {
            id: "dup-name-a",
            name: "Duplicate Name",
            version: "1.0.0",
            description: "First agent with a shared display name",
            distribution: {
                npx: { package: "@example/dup-a@1.0.0" },
            },
        },
        {
            id: "dup-name-b",
            name: "Duplicate Name",
            version: "1.0.0",
            description: "Second agent with a shared display name",
            distribution: {
                npx: { package: "@example/dup-b@1.0.0" },
            },
        },
    ],
};

describe("parseRegistryCatalog", () => {
    it("parses the sample fixture", () => {
        const catalog = parseRegistryCatalog(sampleCatalog);
        expect(catalog).toBeDefined();
        expect(catalog?.version).toBe("1.0.0-sample");
        expect(catalog?.agents).toHaveLength(5);
        expect(catalog?.agents[0]?.id).toBe("sample-npx-agent");
    });

    it("rejects invalid catalog shape", () => {
        expect(parseRegistryCatalog(null)).toBeUndefined();
        expect(parseRegistryCatalog({ version: "1" })).toBeUndefined();
        expect(parseRegistryCatalog({ version: "1", agents: "nope" })).toBeUndefined();
    });

    it("rejects agents missing required distribution", () => {
        expect(
            parseRegistryCatalog({
                version: "1.0.0",
                agents: [
                    {
                        id: "x",
                        name: "X",
                        version: "1.0.0",
                        description: "d",
                        distribution: {},
                    },
                ],
            }),
        ).toBeUndefined();
    });
});
