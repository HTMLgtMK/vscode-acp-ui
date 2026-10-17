import { workspace } from "vscode";
import type { AcpRpcNdjsonSink } from "../../acp/ports/rpcNdjsonSink";
import type { AcpSessionHostRuntime } from "../../acp/session/acpSessionBridge";
import { createVscodeAcpHostFilesystem, getFirstWorkspaceFolderPath } from "./vscodeHostFilesystem";

/** Production wiring for `AcpSessionHostRuntime`: `workspace.fs`, first-folder root, and the RPC sink. */
export function createDefaultAcpSessionHostRuntime(
    rpcNdjsonSink: AcpRpcNdjsonSink,
): AcpSessionHostRuntime {
    return {
        hostFilesystem: createVscodeAcpHostFilesystem(),
        rpcNdjsonSink,
        getWorkspaceRoot: () => getFirstWorkspaceFolderPath(workspace.workspaceFolders),
    };
}
