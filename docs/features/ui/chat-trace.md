# Chat trace

## User facing

The chat trace is the scrolling conversation panel above the composer.
It shows your messages, streaming agent replies, reasoning thoughts, tool calls, file diffs, terminal output, and structured agent plans.
While the panel follows new text, empty space equal to 10% of the panel height stays above the composer.
Click a thought heading to hide or show that block.

Agent text renders as theme-aware markdown with colored headings, GFM tables, and syntax-highlighted fenced code blocks.
Each code block has a copy button.

Tool calls appear inline while the agent works.
Choose how much detail you want with the **Tool call verbosity** setting (`minimal`, `compact`, or `verbose`):

- **Verbose** (default) shows full file previews and diffs per tool call.
- **Compact** shows one summary line per tool call.
  A file name on that line stays the file name.
  The full path appears in a tooltip after the pointer rests on the name.
- **Minimal** groups consecutive tool calls with a short summary and shows details for the last three only.

While a session loads from the agent, a saved last screen is shown when one exists.
A loading indicator fills the panel only when that cache is empty.
Scrolling up to the top of the saved screen can show a loading overlay that does not change the transcript height.
Older history is applied in one step and the current scroll position is kept.

Adjust **Chat content width (%)** in settings to narrow the transcript and composer column (for example `50` centers a half-width column).

## Implementation

### Trace state and streaming

[chatReducer](../../../webview/acp-ui/src/chatReducer.ts#L541-L787) applies extension messages to trace state.
[createChatStateFromInit](../../../webview/acp-ui/src/chatReducer.ts#L209-L337) seeds the trace from the bootstrap payload.

ACP `session/update` events map in [sessionUpdateToWebviewMessages](../../../src/acp/mapping/sessionUpdateMapping.ts#L621-L810):

- `agent_message_chunk` to streaming agent text
- `agent_thought_chunk` to thought blocks
- `user_message_chunk` to user text (including load replay)
- `tool_call` and `tool_call_update` to tool trace items
- `plan` to plan blocks

Edit tools with ACP `diff` content get line-level `diffRows` for the verbose inline preview.
Cursor multi-line `toolCallId` values are normalized to the first line so pending and completed updates land on the same row.
Permission requests that carry edit diffs also update that row before you approve.

[joinThoughtChunks](../../../webview/acp-ui/src/chatReducer.ts#L555-L573) merges consecutive thought chunks.
Client-measured thought and command durations (and other UI-only fields) are written to the sibling `.jsonl` beside the `.acp` session file.
After `session/load` replay, [mergeThoughtDurationsFromCache](../../../webview/acp-ui/src/chatReducer.ts#L307-L335) and [mergeToolDurationsFromCache](../../../webview/acp-ui/src/chatReducer.ts#L341-L372) copy those durations back onto the authoritative transcript.

### Trace rendering

[TraceList](../../../webview/acp-ui/src/components/TraceList.tsx#L148-L296) walks trace items and picks presentation by type and verbosity.
[usesCompactToolPresentation](../../../webview/acp-ui/src/components/TraceList.tsx#L37-L43) gates minimal and compact modes.

- Agent text: [AgentMarkdown](../../../webview/acp-ui/src/components/AgentMarkdown.tsx#L117-L167) with [remark-gfm](https://github.com/remarkjs/remark-gfm).
  Code highlighting uses [renderHighlightedCode](../../../webview/acp-ui/src/components/codeHighlighting.tsx#L101-L120) with workbench theme colors.
- Thoughts: [AgentThoughtBlock](../../../webview/acp-ui/src/components/AgentThoughtBlock.tsx) is a disclosure.
  The heading stays open until it is clicked and shows a duration when known (`Thought for 1.2s`).
- Plans: [PlanBlock](../../../webview/acp-ui/src/components/PlanBlock.tsx#L8-L40).
- Verbose tools: [ToolCallBlock](../../../webview/acp-ui/src/components/ToolCallBlock.tsx).
- Compact tools: [ToolCallCompactBlock](../../../webview/acp-ui/src/components/ToolCallCompactBlock.tsx).
  [CompactPathLink](../../../webview/acp-ui/src/components/ToolCallCompactBlock.tsx#L33-L152) shows the file name and the full path in a workbench-style tooltip.
  Execute output uses [ToolCallCompactExecuteBlock](../../../webview/acp-ui/src/components/ToolCallCompactExecuteBlock.tsx).
  Command lines show a compact duration when known (`$ ls 117ms`).
  Summaries come from [toolCallCompactText.ts](../../../webview/acp-ui/src/toolCallCompactText.ts).

[createChatStateFromInit](../../../webview/acp-ui/src/chatReducer.ts#L274-L301) seeds the trace from `init.visibleTrace`.
While that cache is on screen and history is loading, transcript updates go to a side buffer in [chatReducer](../../../webview/acp-ui/src/chatReducer.ts#L631-L634).
When loading ends, the buffer replaces the visible trace in one step ([sessionHistoryLoading](../../../webview/acp-ui/src/chatReducer.ts#L767-L791)).
[anchoredScrollTop](../../../webview/acp-ui/src/anchoredScroll.ts#L1-L15) keeps the same pixels in view if you have scrolled up.
[agent-trace-follow-gap](../../../webview/acp-ui/src/AcpUiApp.css#L46-L49) is 10% of the transcript height, so follow-scroll stops above the composer.
[visibleTraceTail](../../../webview/acp-ui/src/visibleTraceTail.ts#L12-L53) chooses the rows that fill the scrollport and the webview writes them beside the session file.
[SessionHistoryLoader](../../../webview/acp-ui/src/components/SessionHistoryLoader.tsx#L7-L26) fills the panel only when the cache is empty.
A zero-height overlay is used at the top of a cached screen when you scroll up during load.

### Tool call verbosity setting

[readToolCallVerbosityFromSettings](../../../src/acp/config/toolCallVerbositySetting.ts#L13-L19) reads `ib-acp-ui.toolCallVerbosity`.
[acpUiSessionController](../../../src/extension/acpUiSessionController.ts#L112-L115) posts updates on configuration change.

### Content width setting

[readContentWidthRatioFromSettings](../../../src/acp/config/contentWidthRatioSetting.ts#L17-L22) reads `ib-acp-ui.contentWidthPercent` as a 0.1 to 1 ratio.
[AcpUiApp](../../../webview/acp-ui/src/AcpUiApp.tsx#L142-L143) applies it via the `--acp-ui-content-width-ratio` CSS variable.

### Markdown theme sync

[resolveMarkdownThemeVariables](../../../src/platform/vscode/resolveMarkdownThemeVariables.ts) resolves workbench colors and token rules for the webview.
[acpUiSessionController](../../../src/extension/acpUiSessionController.ts#L107-L109) reposts theme variables when the color theme changes.
[installAgentMarkdownThemeColors](../../../webview/acp-ui/src/agentMarkdownTheme.ts#L63-L86) applies CSS variables in the webview.
