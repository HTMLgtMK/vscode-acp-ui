import { describe, expect, it, vi } from "vite-plus/test";
import { detectArchiveKind, downloadAndInstallBinary } from "./binaryInstall";

describe("detectArchiveKind", () => {
    it("detects zip", () => {
        expect(detectArchiveKind("https://example.com/agent-linux.zip")).toBe("zip");
    });

    it("detects tar.gz and tgz", () => {
        expect(detectArchiveKind("bundle.tar.gz")).toBe("tarGz");
        expect(detectArchiveKind("bundle.tgz")).toBe("tarGz");
    });

    it("detects tar.bz2 and tbz2", () => {
        expect(detectArchiveKind("bundle.tar.bz2")).toBe("tarBz2");
        expect(detectArchiveKind("bundle.tbz2")).toBe("tarBz2");
    });

    it("treats unknown extensions as raw", () => {
        expect(detectArchiveKind("my-agent")).toBe("raw");
    });
});

describe("downloadAndInstallBinary", () => {
    it("rejects sha256 mismatch", async () => {
        const body = new TextEncoder().encode("not-the-expected-binary");
        const fetchImpl = vi.fn(async () => ({
            ok: true,
            status: 200,
            statusText: "OK",
            arrayBuffer: async () =>
                body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
        }));
        await expect(
            downloadAndInstallBinary({
                archiveUrl: "https://example.com/agent.bin",
                sha256: "0000000000000000000000000000000000000000000000000000000000000000",
                cmdRelative: "agent",
                destDir: "/tmp/acp-ui-binary-test",
                fetchImpl: fetchImpl as unknown as typeof fetch,
            }),
        ).rejects.toThrow(/sha256 mismatch/);
    });
});
