# RPC logging

## User facing

Raw ACP wire traffic is recorded as one NDJSON line per JSON-RPC message, tagged with direction
(`toAgent` or `fromAgent`) and the agent name.

This is a developer diagnostics surface, and it is opt-in from the host side.
The browser dev shell writes it to a file on every run (see [standalone](./standalone.md)).
A VS Code host decides whether to record at all and where the lines go — this repo ships no
output channel and no command to open one; **Show ACP RPC Log** was removed with the rest of the
extension's own command palette.

## Implementation

### Stdio / socket tap

When the sink reports `isLoggingEnabled`, [tapAcpAgentTransportForRpcLog](../../../src/acp/infrastructure/acpAgentProcess.ts#L63-L95) inserts pass-through taps between the agent transport and the SDK connection;
otherwise it returns the untouched streams.
[AcpAgentProcess.start](../../../src/acp/infrastructure/acpAgentProcess.ts#L253-L257) is the only caller.
[createNdjsonRpcLogTap](../../../src/acp/infrastructure/acpAgentProcess.ts#L27-L61) buffers bytes and
forwards complete NDJSON lines without altering the wire protocol.

[formatAcpRpcNdjsonDebugLine](../../../src/acp/ports/rpcNdjsonSink.ts#L15-L33) renders each record:
JSON first, then `// <agent> | <direction>`, so an editor can highlight the payload as jsonl.

### Sink contract and implementations

[AcpRpcNdjsonSink](../../../src/acp/ports/rpcNdjsonSink.ts#L35-L38) is the host-implemented port,
handed to the session bridge through
[AcpSessionHostRuntime.rpcNdjsonSink](../../../src/acp/session/acpSessionBridge.ts#L44-L54) and
exported from [src/sdk/index.ts](../../../src/sdk/index.ts#L67-L75).
[NullAcpRpcNdjsonSink](../../../src/acp/ports/rpcNdjsonSink.ts#L40-L47) turns logging off.

In standalone mode, [FileAcpRpcNdjsonSink](../../../src/platform/node/fileRpcNdjsonSink.ts#L12-L27)
appends to a path resolved from `ACP_RPC_LOG`
([standalone/server.ts](../../../standalone/server.ts#L86-L108)): unset or `1` uses
`standalone/acp-rpc.ndjson`, any other non-empty value is taken as a path, and `0` disables
logging and prints nothing.

[VscodeAcpRpcNdjsonSink](../../../src/platform/vscode/vscodeRpcNdjsonSink.ts#L13-L34) is the
VS Code-shaped version of the same port: it appends to an `OutputChannel` and/or a log file, both
chosen by whoever constructs it.
