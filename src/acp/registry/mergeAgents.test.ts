import { describe, expect, it } from "vite-plus/test";
import type { AcpAgentSpawnConfig } from "../domain/agentSpawnConfig";
import { mergeAcpAgentConfigs } from "./mergeAgents";

describe("mergeAcpAgentConfigs", () => {
    it("keeps manual entries and appends non-colliding installed", () => {
        const manual: AcpAgentSpawnConfig[] = [{ name: "Custom", command: "custom", args: [] }];
        const installed: AcpAgentSpawnConfig[] = [
            { name: "Registry One", command: "npx", args: ["-y", "pkg"], registryId: "one" },
        ];
        expect(mergeAcpAgentConfigs(manual, installed)).toEqual([
            { name: "Custom", command: "custom", args: [] },
            {
                name: "Registry One",
                command: "npx",
                args: ["-y", "pkg"],
                registryId: "one",
            },
        ]);
    });

    it("drops installed agents whose name matches a manual entry", () => {
        const manual: AcpAgentSpawnConfig[] = [
            { name: "Gemini CLI", command: "gemini", args: ["--acp"] },
        ];
        const installed: AcpAgentSpawnConfig[] = [
            {
                name: "Gemini CLI",
                command: "npx",
                args: ["-y", "@google/gemini-cli"],
                registryId: "gemini",
            },
            { name: "Other", command: "npx", args: [], registryId: "other" },
        ];
        expect(mergeAcpAgentConfigs(manual, installed)).toEqual([
            { name: "Gemini CLI", command: "gemini", args: ["--acp"] },
            { name: "Other", command: "npx", args: [], registryId: "other" },
        ]);
    });

    it("suffixes duplicate installed display names with registry id", () => {
        const installed: AcpAgentSpawnConfig[] = [
            { name: "Duplicate Name", command: "npx", args: ["a"], registryId: "dup-name-a" },
            { name: "Duplicate Name", command: "npx", args: ["b"], registryId: "dup-name-b" },
        ];
        expect(mergeAcpAgentConfigs([], installed)).toEqual([
            {
                name: "Duplicate Name (dup-name-a)",
                command: "npx",
                args: ["a"],
                registryId: "dup-name-a",
            },
            {
                name: "Duplicate Name (dup-name-b)",
                command: "npx",
                args: ["b"],
                registryId: "dup-name-b",
            },
        ]);
    });
});
