import { Uri, type WorkspaceFolder, workspace } from "vscode";
import type { AcpHostFilesystem } from "../../acp/ports/hostFilesystem";

function uriForHostPath(path: string): Uri {
    return Uri.file(path);
}

/**
 * `workspace.fs` implementation of {@link AcpHostFilesystem}.
 */
export function createVscodeAcpHostFilesystem(): AcpHostFilesystem {
    return {
        async readTextFile(path: string): Promise<string> {
            const bytes = await workspace.fs.readFile(uriForHostPath(path));
            return Buffer.from(bytes).toString("utf-8");
        },
        async writeTextFile(path: string, content: string): Promise<void> {
            await workspace.fs.writeFile(uriForHostPath(path), Buffer.from(content, "utf-8"));
        },
    };
}

/** First workspace folder, if any (used for spawn `cwd` and `session/new` metadata). */
export function getFirstWorkspaceFolderPath(
    folders: readonly WorkspaceFolder[] | undefined,
): string | undefined {
    return folders?.[0]?.uri.fsPath;
}
