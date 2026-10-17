import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";
import { describe, expect, it, vi } from "vite-plus/test";

const mockSpawn = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
    spawn: mockSpawn,
}));

import {
    AcpAgentProcess,
    AcpProtocolVersionMismatchError,
    assertNegotiatedProtocolVersion,
    buildAcpClientInfoFromPackage,
} from "./acpAgentProcess";

function createTestAcpAgentProcess(command = "/missing/agent"): AcpAgentProcess {
    return new AcpAgentProcess({
        config: { name: "Test", command, args: ["acp"] },
        requestPermission: async () => ({
            outcome: { outcome: "cancelled" },
        }),
        hostFilesystem: {
            readTextFile: async () => "",
            writeTextFile: async () => {},
        },
        rpcNdjsonSink: {
            isLoggingEnabled: false,
            appendRawNdjsonLine: () => {},
        },
        getWorkspaceRoot: () => "/tmp",
    });
}

type CapabilityProbe = {
    supportsListSessions(): boolean;
    supportsLoadSession(): boolean;
    supportsDeleteSessions(): boolean;
};

function probeFromInit(init: {
    agentCapabilities?: {
        loadSession?: boolean;
        sessionCapabilities?: {
            list?: Record<string, never>;
            delete?: Record<string, never>;
        };
    };
}): CapabilityProbe {
    const process = new AcpAgentProcess({
        config: { name: "Test", command: "echo", args: [] },
        requestPermission: async () => ({
            outcome: { outcome: "cancelled" },
        }),
        hostFilesystem: {
            readTextFile: async () => "",
            writeTextFile: async () => {},
        },
        rpcNdjsonSink: {
            isLoggingEnabled: false,
            appendRawNdjsonLine: () => {},
        },
        getWorkspaceRoot: () => "/tmp",
    });
    (
        process as unknown as {
            initResponse: typeof init;
        }
    ).initResponse = init;
    return process;
}

describe("AcpAgentProcess.start spawn errors", () => {
    it("rejects initialize with command and ENOENT when spawn fails", async () => {
        const missingCommand = "/Users/econneely/.local/bin/agent";
        mockSpawn.mockImplementation(() => {
            const child = new EventEmitter() as ChildProcess;
            child.stdin = new Writable({
                write(_chunk, _encoding, callback) {
                    callback();
                },
            });
            child.stdout = new Readable({ read() {} });
            child.stderr = new Readable({ read() {} });
            child.kill = vi.fn();
            queueMicrotask(() => {
                const err = new Error(`spawn ${missingCommand} ENOENT`) as NodeJS.ErrnoException;
                err.code = "ENOENT";
                child.emit("error", err);
            });
            return child;
        });

        const process = createTestAcpAgentProcess(missingCommand);
        let caught: unknown;
        try {
            await process.start();
        } catch (err) {
            caught = err;
        }
        expect(caught).toBeInstanceOf(Error);
        const message = (caught as Error).message;
        expect(message).toContain(`cannot execute command "${missingCommand}"`);
        expect(message).toContain("ENOENT");
        expect(message).not.toContain("ACP connection closed");
    });
});

describe("AcpAgentProcess session capabilities", () => {
    it("detects list, load, and delete support from initialize", () => {
        const process = probeFromInit({
            agentCapabilities: {
                loadSession: true,
                sessionCapabilities: {
                    list: {},
                    delete: {},
                },
            },
        });
        expect(process.supportsListSessions()).toBe(true);
        expect(process.supportsLoadSession()).toBe(true);
        expect(process.supportsDeleteSessions()).toBe(true);
    });

    it("returns false when capabilities are absent", () => {
        const process = probeFromInit({});
        expect(process.supportsListSessions()).toBe(false);
        expect(process.supportsLoadSession()).toBe(false);
        expect(process.supportsDeleteSessions()).toBe(false);
    });
});

describe("buildAcpClientInfoFromPackage", () => {
    it("maps package.json fields to clientInfo", () => {
        expect(
            buildAcpClientInfoFromPackage({
                name: "ib-acp-ui",
                version: "0.4.0",
                displayName: "ACP UI",
            }),
        ).toEqual({
            name: "ib-acp-ui",
            version: "0.4.0",
            title: "ACP UI",
        });
    });

    it("falls back when fields are missing", () => {
        expect(buildAcpClientInfoFromPackage({})).toEqual({
            name: "ib-acp-ui",
            version: "0.0.0",
            title: "ACP UI",
        });
    });
});

describe("assertNegotiatedProtocolVersion", () => {
    it("accepts the supported protocol version", () => {
        expect(() =>
            assertNegotiatedProtocolVersion({
                protocolVersion: acp.PROTOCOL_VERSION,
                agentCapabilities: {},
            }),
        ).not.toThrow();
    });

    it("throws a user-facing error when versions differ", () => {
        expect(() =>
            assertNegotiatedProtocolVersion({
                protocolVersion: acp.PROTOCOL_VERSION + 1,
                agentCapabilities: {},
            }),
        ).toThrow(AcpProtocolVersionMismatchError);
        try {
            assertNegotiatedProtocolVersion({
                protocolVersion: 0,
                agentCapabilities: {},
            });
        } catch (err: unknown) {
            expect(err).toBeInstanceOf(AcpProtocolVersionMismatchError);
            const mismatch = err as AcpProtocolVersionMismatchError;
            expect(mismatch.negotiatedVersion).toBe(0);
            expect(mismatch.supportedVersion).toBe(acp.PROTOCOL_VERSION);
            expect(mismatch.message).toContain("Update the agent");
        }
    });
});
