/**
 * Public entry of the ACP UI chat panel SDK.
 *
 * Curated, `vscode`-free surface for embedding the ACP chat panel into another
 * extension host (Node process): the hexagonal session core (`AcpSessionBridge` +
 * `AcpSessionHostRuntime` with the `createAgentTransport` injection point), default
 * agent transports (subprocess spawn / unix-socket daemon), an in-process mock daemon
 * for host development/regression, host ports, the
 * host↔webview message contract, pure ACP→webview mapping helpers, and the webview
 * HTML/asset helpers. VS Code–specific glue stays in the extension shell and is
 * intentionally not exported.
 */

// --- Agent spawn config (incl. socketPath parsing) -------------------------------
export type {
    AcpAgentSpawnConfig,
    AcpAuthMethodRef,
} from "../acp/domain/agentSpawnConfig";
export {
    isCursorAcpAgent,
    PARAMETERIZED_MODEL_PICKER_META_KEY,
    parseAcpAgentSpawnConfig,
    parseAcpAgentsJsonFileContent,
    resolveAuthMethodId,
} from "../acp/domain/agentSpawnConfig";

// --- ACP wire client (advanced): direct use without the session bridge ----------
export type {
    AcpAgentProcessOptions,
    RequestPermissionHandler,
    SessionUpdateHandler,
} from "../acp/infrastructure/acpAgentProcess";
export {
    AcpAgentProcess,
    AcpProtocolVersionMismatchError,
    assertNegotiatedProtocolVersion,
    buildAcpClientCapabilities,
    buildAcpClientInfoFromPackage,
    configureAcpClientInfo,
} from "../acp/infrastructure/acpAgentProcess";

// --- Agent transports: default infrastructure -----------------------------------
export type { DefaultAcpAgentTransportOptions } from "../acp/infrastructure/defaultAcpAgentTransport";
export { createDefaultAcpAgentTransport } from "../acp/infrastructure/defaultAcpAgentTransport";
export type { SocketAcpAgentTransportOptions } from "../acp/infrastructure/socketAcpAgentTransport";
export { SocketAcpAgentTransport } from "../acp/infrastructure/socketAcpAgentTransport";
export type { SpawnAcpAgentTransportOptions } from "../acp/infrastructure/spawnAcpAgentTransport";
export { SpawnAcpAgentTransport } from "../acp/infrastructure/spawnAcpAgentTransport";

// --- Mapping: pure ACP session/update → webview message functions ---------------
export type { ToolCallKindTracking } from "../acp/mapping/sessionUpdateMapping";
export {
    createToolCallKindTracking,
    extensionMessagesForPermissionRequest,
    sessionUpdateToWebviewMessages,
    toolCallUpdateSubtitleHint,
} from "../acp/mapping/sessionUpdateMapping";
export { computeToolCallDiffRows } from "../acp/mapping/toolCallDiffLines";

// --- Ports: host-implemented capabilities --------------------------------------
export type {
    AcpAgentTransport,
    AcpAgentTransportConnection,
    AcpAgentTransportConnectRequest,
} from "../acp/ports/agentTransport";
export type { AcpHostFilesystem } from "../acp/ports/hostFilesystem";
export type {
    AcpRpcNdjsonDirection,
    AcpRpcNdjsonLineContext,
    AcpRpcNdjsonSink,
} from "../acp/ports/rpcNdjsonSink";
export {
    formatAcpRpcNdjsonDebugLine,
    NullAcpRpcNdjsonSink,
} from "../acp/ports/rpcNdjsonSink";

// --- Session core: bridge + host runtime contract (incl. transport injection) ---
export type {
    AcpSessionBridgeHooks,
    AcpSessionConnectOptions,
    AcpSessionHostRuntime,
    PostToWebview,
} from "../acp/session/acpSessionBridge";
export {
    AcpSessionBridge,
    shouldLoadRuntimeSession,
} from "../acp/session/acpSessionBridge";

// --- Session state types referenced by the message contract ---------------------
export type {
    AcpUiSessionConfigOption,
    AcpUiSessionConfigState,
} from "../acp/session/sessionConfigOptions";
export type { AcpUiSessionModelSelection } from "../acp/session/sessionModels";

// --- Dev support: in-process mock daemon (host development/regression) ----------
// Real unix-socket mock of the minimal ACP daemon surface so external hosts can
// develop and regression-test the chat panel before a real daemon is ready.
// Development/testing aid only — keep it out of production dependencies.
export type {
    MockAcpNdjsonDaemonOptions,
    RecordedAcpDaemonMessage,
} from "../acp/testing/mockAcpNdjsonDaemon";
export { MockAcpNdjsonDaemon } from "../acp/testing/mockAcpNdjsonDaemon";

// --- Host ↔ webview message contract --------------------------------------------
export type {
    AcpUiHistoryReplayEvent,
    AcpUiSlashCommand,
    ExtensionToWebviewMessage,
    PlanEntry,
    TodoEntry,
    ToolCallDiffRow,
    ToolCallStatus,
    ToolCallVerbosity,
    WebviewToExtensionMessage,
    WorkspacePathOpenTarget,
} from "../protocol/extensionHostMessages";
export {
    isPotentiallyExtensionPostMessageData,
    tryParseWebviewMessage,
} from "../protocol/extensionHostMessages";

// --- Webview HTML assembly + asset resolution (vscode-free) ----------------------
export type {
    AcpUiWebviewAssets,
    AcpUiWebviewHtmlOptions,
} from "./acpUiWebviewHtml";
export {
    buildAcpUiWebviewHtml,
    resolveAcpUiWebviewAssets,
} from "./acpUiWebviewHtml";
