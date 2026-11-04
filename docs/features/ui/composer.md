# Composer

## User facing

The chat composer is where you draft messages, run slash commands, and mention workspace files.

While typing, ACP UI suggests completions without leaving the message box.
Type `/` to open slash-command suggestions from the connected agent alongside built-in commands such as `/clear`, `/new`, `/rename`, and `/show-thinking`.
Type `@` to mention workspace files.
Paths with spaces or quotes are inserted as quoted mentions.

Drag files from the Explorer or your file manager onto the chat to insert `@` path mentions.

Arrow Up recalls previous prompts when the caret is at the start of the first line.
Arrow Down walks forward through recalled entries.
The panel keeps the last 50 prompts and hands the whole list to the host on each send; on reopen
it restores whatever the host passed back, so nothing is written to disk here.

Keyboard shortcuts while the composer is focused:

- Enter sends, Shift+Enter inserts a newline
- Shift+Tab cycles session mode when the agent exposes a mode option
- Ctrl+C cancels an in-flight prompt when nothing is selected
- Ctrl+T / Cmd+T asks the host for a new chat

A host can mount the same composer read-only (the observation panel case): the textarea and Send
are inert and say why.

Planned: send images, audio, and structured file references in prompts when the agent advertises multimodal `promptCapabilities`.
Composer `@` file mentions will become structured ACP `resource` blocks instead of plain path text in the draft.
Today prompts are a single text block.

## Implementation

### Autocomplete

[buildComposerAutocompleteState](../../../webview/acp-ui/src/components/composerAutocomplete.ts#L84-L123) inspects the draft and caret.
It uses [queryFromCaret](../../../webview/acp-ui/src/components/composerAutocomplete.ts#L32-L42) to detect a `/query` or `@query` token.
Detection applies at the start of a line or after whitespace.

- **`/` mode** — filters the merged `slashCommands` list.
  Builds items via [slashSuggestionItem](../../../webview/acp-ui/src/components/composerAutocomplete.ts#L44-L58).
  Groups with [groupSlashSuggestionItems](../../../webview/acp-ui/src/components/composerAutocomplete.ts#L59-L83).
- **`@` mode** — filters `workspaceFiles` from the bootstrap payload.
  Formats inserts with [formatPathMention](../../../webview/acp-ui/src/components/composerAutocomplete.ts#L28-L30).

[ChatComposer](../../../webview/acp-ui/src/components/ChatComposer.tsx#L99-L110) recomputes autocomplete from the draft (caret at end).
[AcpUiApp.onComposerKeyDown](../../../webview/acp-ui/src/AcpUiApp.tsx#L404-L419) drives navigation, and
[Enter accepts a highlighted suggestion](../../../webview/acp-ui/src/AcpUiApp.tsx#L484-L516) before it falls through to submit.

**Built-in commands** — [builtInSlashCommands](../../../webview/acp-ui/src/AcpUiApp.tsx#L299-L318) defines `/clear`, `/new`, `/rename`, `/show-thinking`;
[mergedSlashCommands](../../../webview/acp-ui/src/AcpUiApp.tsx#L320-L332) de-dupes them against agent commands.
**Agent commands** — ACP `available_commands_update` is mapped in
[sessionUpdateMapping.ts](../../../src/acp/mapping/sessionUpdateMapping.ts#L898-L953).
[normalizeSlashCommandSource](../../../src/acp/slashCommandMetadata.ts#L20-L60) and
[slashCommandGroupLabel](../../../src/acp/slashCommandMetadata.ts#L70-L86) normalize source labels and grouping.

`init.workspaceFiles`
([shape](../../../src/protocol/extensionHostMessages.ts#L129-L130)) is the `@` candidate list; the
host supplies it.
Filtering is case-insensitive substring match, capped at 30 results.

Protocol: [available_commands_update](../../acp/protocol/v2/slash-commands.mdx).

### Prompt history

On submit, [AcpUiApp](../../../webview/acp-ui/src/AcpUiApp.tsx#L391-L398) appends the prompt,
drops the oldest entries past 50, and posts
[saveHistory](../../../src/protocol/extensionHostMessages.ts#L90-L91) with the full list; the
untrusted-input parser trims it
[here](../../../src/protocol/extensionHostMessages.ts#L381-L392).
Restore goes the other way through
[init.history](../../../src/protocol/extensionHostMessages.ts#L138).
The dev shell persists it in `localStorage`
([standalone/src/main.ts](../../../standalone/src/main.ts#L52-L108)); a VS Code host stores it
wherever it keeps chat state.

Recall is [onComposerKeyDown](../../../webview/acp-ui/src/AcpUiApp.tsx#L518-L557), gated on
[textareaAtFirstLineFirstColumn](../../../webview/acp-ui/src/AcpUiApp.tsx#L826-L834).
After a resumed session, the agent's `session/load` replay is what puts past user messages in the
trace — see [sessions](../acp/sessions.md).

Task: covered by [sessions](../acp/sessions.md).

### Read-only composer

[init.composerReadOnly](../../../src/protocol/extensionHostMessages.ts#L144-L148) seeds the state
in [createChatStateFromInit](../../../webview/acp-ui/src/chatReducer.ts#L237-L264).
The gate on submit is in
[chatReducer](../../../webview/acp-ui/src/chatReducer.ts#L633-L645).

### File drag and drop

[dataTransferLooksLikePathDrop](../../../webview/acp-ui/src/droppedFilePaths.ts#L8-L27) detects Explorer and OS file drops.
[collectPathsFromDataTransfer](../../../webview/acp-ui/src/droppedFilePaths.ts#L29-L93) resolves paths relative to the workspace root.
[appendFileMentionsToDraft](../../../webview/acp-ui/src/droppedFilePaths.ts#L180-L198) inserts formatted `@` mentions.

[AcpUiApp](../../../webview/acp-ui/src/AcpUiApp.tsx#L707-L710) handles dragover and drop on the shell.

### Keyboard bindings

[shouldCycleSessionModeOnShiftTab](../../../webview/acp-ui/src/components/composerKeybindings.ts#L16-L30) gates Shift+Tab mode cycling.
[shouldCancelRunOnCtrlC](../../../webview/acp-ui/src/components/composerKeybindings.ts#L49-L67) gates Ctrl+C cancel.
[shouldConfirmOnEnter](../../../webview/acp-ui/src/components/composerKeybindings.ts#L32-L47) covers Enter, including the IME composition guard.
[shouldOpenNewChatOnCtrlT](../../../webview/acp-ui/src/components/composerKeybindings.ts#L1-L14) is checked by a
[document-level listener](../../../webview/acp-ui/src/AcpUiApp.tsx#L234-L242) that posts
[openNewChat](../../../src/protocol/extensionHostMessages.ts#L92-L93); this repo registers no
keybinding for it, so a host that wants the shortcut binds it itself.

### Multimodal prompts

Not implemented.
[prompt](../../../src/acp/infrastructure/acpAgentProcess.ts#L415-L423) assembles text-only content today.
Composer `@` mentions are handled as text inserts until structured resource blocks ship.

Task: [multimodal-prompts](../../tasks/multimodal-prompts.md).
Protocol: [prompt turn](../../acp/protocol/v1/prompt-turn.mdx).
