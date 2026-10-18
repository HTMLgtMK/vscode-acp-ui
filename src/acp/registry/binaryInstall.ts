import { createHash } from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { basename, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import { access } from "node:fs/promises";

const execFileAsync = promisify(execFile);

export type ArchiveKind = "zip" | "tarGz" | "tarBz2" | "raw";

function archiveBaseName(archiveUrl: string): string {
    try {
        return basename(new URL(archiveUrl).pathname) || "archive";
    } catch {
        return basename(archiveUrl) || "archive";
    }
}

export function detectArchiveKind(urlOrName: string): ArchiveKind {
    const lower = urlOrName.toLowerCase();
    if (lower.endsWith(".zip")) {
        return "zip";
    }
    if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) {
        return "tarGz";
    }
    if (lower.endsWith(".tar.bz2") || lower.endsWith(".tbz2")) {
        return "tarBz2";
    }
    return "raw";
}

export type DownloadAndInstallBinaryOptions = {
    archiveUrl: string;
    sha256?: string;
    cmdRelative: string;
    destDir: string;
    fetchImpl?: typeof fetch;
};

/**
 * Downloads an archive (or raw binary), verifies optional sha256, extracts when needed, and resolves the command path.
 */
export async function downloadAndInstallBinary(
    options: DownloadAndInstallBinaryOptions,
): Promise<{ commandAbsolutePath: string }> {
    const { archiveUrl, sha256, cmdRelative, destDir, fetchImpl = fetch } = options;
    await mkdir(destDir, { recursive: true });
    const archiveName = archiveBaseName(archiveUrl);
    const archivePath = join(destDir, archiveName);
    const response = await fetchImpl(archiveUrl);
    if (!response.ok) {
        throw new Error(
            `Binary download failed with HTTP ${response.status}: ${response.statusText}`,
        );
    }
    const body = Buffer.from(await response.arrayBuffer());
    if (sha256 !== undefined && sha256.length > 0) {
        const digest = createHash("sha256").update(body).digest("hex");
        if (digest !== sha256.toLowerCase()) {
            throw new Error(`Binary sha256 mismatch (expected ${sha256}, got ${digest})`);
        }
    }
    const kind = detectArchiveKind(archiveName);
    if (kind === "raw") {
        const cmdPath = join(destDir, cmdRelative.replace(/^\.\//, ""));
        await writeFile(cmdPath, body);
        if (process.platform !== "win32") {
            await chmod(cmdPath, 0o755);
        }
        return { commandAbsolutePath: await resolveCommandPath(cmdRelative, destDir) };
    }
    await writeFile(archivePath, body);
    await extractArchive(archivePath, destDir, kind);
    return { commandAbsolutePath: await resolveCommandPath(cmdRelative, destDir) };
}

async function extractArchive(
    archivePath: string,
    destDir: string,
    kind: ArchiveKind,
): Promise<void> {
    if (kind === "zip") {
        await execFileAsync("unzip", ["-o", archivePath, "-d", destDir]);
        return;
    }
    if (kind === "tarGz") {
        await execFileAsync("tar", ["-xzf", archivePath, "-C", destDir]);
        return;
    }
    if (kind === "tarBz2") {
        await execFileAsync("tar", ["-xjf", archivePath, "-C", destDir]);
    }
}

async function resolveCommandPath(cmdRelative: string, destDir: string): Promise<string> {
    const joined =
        cmdRelative.startsWith("./") || cmdRelative.startsWith(".\\")
            ? join(destDir, cmdRelative.slice(2))
            : isAbsolute(cmdRelative)
              ? cmdRelative
              : join(destDir, cmdRelative);
    const absolute = resolve(joined);
    try {
        await access(absolute);
    } catch {
        throw new Error(`Installed binary command not found: ${absolute}`);
    }
    return absolute;
}
