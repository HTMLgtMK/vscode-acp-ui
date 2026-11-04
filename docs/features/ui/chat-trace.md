# Chat trace

## User facing

The chat trace is the scrolling conversation panel above the composer.
It shows your messages, streaming agent replies, reasoning thoughts, tool calls, file diffs, terminal output, and structured agent plans.
Unrecognized `session/update` types show up as a collapsed row carrying the raw payload, so a new
agent message never silently disappears.
A filter bar above the transcript toggles messages, thoughts, tools, and unknown rows by count.

Agent text renders as theme-aware markdown with colored headings, GFM tables, and syntax-highlighted fenced code blocks.
Each code block has a copy button.

Tool calls appear inline while the agent works, in one of three detail levels:

- **Verbose** (default) shows full file previews and diffs per tool call.
- **Compact** shows one summary line per tool call.
- **Minimal** groups consecutive tool calls with a short summary and shows details for the last three only.

The embedding extension picks that level and how wide the transcript column is; both arrive with
the panel bootstrap and can change while the panel is open.
While a session loads from the agent, a loading indicator appears until replay finishes.

## Implementation

### Trace state and streaming

[chatReducer](../../../webview/acp-ui/src/chatReducer.ts#L633-L886) applies extension messages to
trace state.
[createChatStateFromInit](../../../webview/acp-ui/src/chatReducer.ts#L237-L264) seeds the trace from the bootstrap payload.

ACP `session/update` events map in [sessionUpdateToWebviewMessages](../../../src/acp/mapping/sessionUpdateMapping.ts#L793-L995):

- `agent_message_chunk` to streaming agent text
- `agent_thought_chunk` to thought blocks
- `user_message_chunk` to user text (including load replay)
- `tool_call` and `tool_call_update` to tool trace items
- `plan` to plan blocks
- anything else to one collapsed raw row

[joinThoughtChunks](../../../webview/acp-ui/src/chatReducer.ts#L391-L413) merges consecutive thought chunks.

### Trace rendering

[TraceList](../../../webview/acp-ui/src/components/TraceList.tsx#L149-L315) walks trace items and picks presentation by type and verbosity.
[usesCompactToolPresentation](../../../webview/acp-ui/src/components/TraceList.tsx#L38-L44) gates minimal and compact modes.

- Agent text: [AgentMarkdown](../../../webview/acp-ui/src/components/AgentMarkdown.tsx#L117-L167) with [remark-gfm](https://github.com/remarkjs/remark-gfm).
  Code highlighting uses [renderHighlightedCode](../../../webview/acp-ui/src/components/codeHighlighting.tsx#L101-L106) with workbench theme colors.
- Thoughts: [AgentThoughtBlock](../../../webview/acp-ui/src/components/AgentThoughtBlock.tsx#L16-L55).
- Plans: [PlanBlock](../../../webview/acp-ui/src/components/PlanBlock.tsx#L8-L41).
- Verbose tools: [ToolCallBlock](../../../webview/acp-ui/src/components/ToolCallBlock.tsx#L158-L398).
- Compact tools: [ToolCallCompactBlock](../../../webview/acp-ui/src/components/ToolCallCompactBlock.tsx#L209-L296).
  Execute output uses [ToolCallCompactExecuteBlock](../../../webview/acp-ui/src/components/ToolCallCompactExecuteBlock.tsx#L17-L98).
  Summaries come from [compactToolGroupSummary](../../../webview/acp-ui/src/toolCallCompactText.ts#L335-L344),
  and [compactGroupMaxVisibleDetails](../../../webview/acp-ui/src/toolCallCompactText.ts#L492-L493) is
  the "last three" cap in minimal mode.
- Unknown updates: [UnknownUpdateBlock](../../../webview/acp-ui/src/components/UnknownUpdateBlock.tsx#L9-L45), typed by
  [traceItemKind](../../../webview/acp-ui/src/traceView.ts#L45-L56) over
  [TRACE_FILTER_KINDS](../../../webview/acp-ui/src/traceView.ts#L40).

[SessionHistoryLoader](../../../webview/acp-ui/src/components/SessionHistoryLoader.tsx#L7-L27) shows while `sessionHistoryLoading` is true during load replay.
[TraceFilters](../../../webview/acp-ui/src/components/TraceFilters.tsx#L19-L83) renders the kind toggle row from
[countByKind](../../../webview/acp-ui/src/traceView.ts#L58-L71).

### Host-driven verbosity and width

There is no setting in this repo for either value.
The host sends them on the bootstrap payload as
[init.toolCallVerbosity and init.contentWidthRatio](../../../src/protocol/extensionHostMessages.ts#L155-L158),
and can change them later with the
[toolCallVerbosity](../../../src/protocol/extensionHostMessages.ts#L160-L167) downlink pair.
[AcpUiApp](../../../webview/acp-ui/src/AcpUiApp.tsx#L129-L134) holds both in state, defaulting to
`verbose` and full width when the host omits them, and applies them at
[AcpUiApp](../../../webview/acp-ui/src/AcpUiApp.tsx#L188-L195).
Verbosity reaches the list as a prop at
[AcpUiApp](../../../webview/acp-ui/src/AcpUiApp.tsx#L744-L754); width becomes the
`--gw-content-width-ratio` custom property on the shell
([AcpUiApp](../../../webview/acp-ui/src/AcpUiApp.tsx#L702-L706)), consumed by
[AcpUiApp.css](../../../webview/acp-ui/src/AcpUiApp.css#L9-L12) for the content column.

### Markdown theme sync

[resolveMarkdownThemeVariables](../../../src/platform/vscode/resolveMarkdownThemeVariables.ts#L100-L159) resolves workbench colors and token rules for a VS Code host.
The host sends the result on `init.vscodeThemeVariables` and reposts the
[vscodeThemeVariables](../../../src/protocol/extensionHostMessages.ts#L168-L172) message when its
theme changes; [AcpUiApp](../../../webview/acp-ui/src/AcpUiApp.tsx#L183-L187) forwards it to the webview.
[installAgentMarkdownThemeColors](../../../webview/acp-ui/src/agentMarkdownTheme.ts#L63-L74) applies CSS variables in the webview.
