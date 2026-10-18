import type { AcpUiSessionModelSelection } from "../../../src/acp/session/sessionModels";
import {
  modelConfigOption,
  modelParamCacheKey,
  resolvedModelParamOptionsForModelPick,
  type AcpUiSessionConfigOption,
} from "../../../src/acp/session/sessionConfigOptions";
import {
  cacheModelParamOptionsFromSession,
  readCachedModelParamOptions,
  writeCachedSessionConfigOptions,
  writeCachedSessionModels,
} from "../../../src/acp/session/sessionConfigOptionsCache";
import {
  canonicalToolCallId,
  resolveToolIndexByCallId,
} from "../../../src/acp/mapping/canonicalToolCallId";
import type {
  ExtensionToWebviewMessage,
  AcpUiSlashCommand,
  PlanEntry,
  TodoEntry,
  ToolCallDiffRow,
  ToolCallStatus,
} from "../../../src/protocol/extensionHostMessages";
import {
  positiveDurationMs,
  type AcpUiVisibleTraceItem,
} from "../../../src/protocol/visibleTrace";

export type InitPayload = Extract<ExtensionToWebviewMessage, { type: "init" }>;
export type ExtensionMessageAfterInit = Exclude<ExtensionToWebviewMessage, { type: "init" }>;

export type TraceToolItem = {
  type: "tool";
  toolCallId: string;
  title: string;
  kind: string | undefined;
  /** Dim terminal-style line (paths, args, preview); from ACP at tool start. */
  subtitle: string | undefined;
  status: ToolCallStatus;
  content: string | undefined;
  /** Structured diff when the agent sent `diff` content (preferred over plain `content`). */
  diffRows: ToolCallDiffRow[] | undefined;
  detailVisible: boolean;
  durationMs?: number;
};

export type TraceItem =
  | { type: "user"; text: string }
  | { type: "thought"; text: string; durationMs?: number }
  | { type: "agent"; text: string }
  | TraceToolItem
  | { type: "plan"; entries: PlanEntry[] };

export type AcpAgentSelectionState = {
  currentName: string;
};

export type PermissionPromptState = {
  requestId: string;
  toolTitle: string;
  options: { optionId: string; name: string }[];
};

export type AskQuestionPromptState = Extract<
  ExtensionToWebviewMessage,
  { type: "cursorAskQuestionRequest" }
>;

export type CreatePlanPromptState = Extract<
  ExtensionToWebviewMessage,
  { type: "cursorCreatePlanRequest" }
>;

export type ChatState = {
  trace: TraceItem[];
  openStreamIndex: number | null;
  toolIndexById: Map<string, number>;
  promptInFlight: boolean;
  errorText: string | null;
  modelSelection: AcpUiSessionModelSelection | null;
  sessionConfigOptions: AcpUiSessionConfigOption[] | null;
  /** True while waiting for agent model/config options (uncached reconnect). */
  sessionConfigLoading: boolean;
  /** True while ACP `session/load` is replaying conversation history. */
  sessionHistoryLoading: boolean;
  viewportCacheActive: boolean;
  replayTrace: TraceItem[];
  replayToolIndexById: Map<string, number>;
  replayOpenStreamIndex: number | null;
  replayThoughtStartedAtMs: number | null;
  replayToolStartedAtMsById: Map<string, number>;
  historyCommit: number;
  acpAgentSelection: AcpAgentSelectionState | null;
  slashCommands: AcpUiSlashCommand[];
  permissionPrompt: PermissionPromptState | null;
  askQuestionPrompt: AskQuestionPromptState | null;
  createPlanPrompt: CreatePlanPromptState | null;
  /**
   * From host init: agent was fixed when the chat was created (VS Code sidebar flow).
   */
  lockSessionAgent: boolean;
  /**
   * After the first real user message, model + agent pickers are read-only (playground pre-flight).
   */
  composerPicksLocked: boolean;
  /** When true, hide model/config controls in the composer footer. */
  hideComposerModelControls: boolean;
  thoughtStartedAtMs: number | null;
  /** Client clock start for tool rows waiting on a completed/failed status. */
  toolStartedAtMsById: Map<string, number>;
};

export type ChatAction =
  | ExtensionMessageAfterInit
  | { type: "submit"; body: string }
  | { type: "pickSessionModel"; modelId: string }
  | {
      type: "pickSessionConfigOption";
      configId: string;
      value: string | boolean;
    }
  | { type: "clearPermissionPrompt" }
  | { type: "clearAskQuestionPrompt" }
  | { type: "clearCreatePlanPrompt" };

const EDIT_TOOL_DISPLAY_TITLE = "Write File";

/** Stable header for ACP `kind: edit` tools (file write / diff), ignoring verbose agent titles. */
function toolDisplayTitle(kind: string | undefined, agentTitle: string): string {
  if (kind !== undefined && kind.toLowerCase() === "edit") {
    return EDIT_TOOL_DISPLAY_TITLE;
  }
  const t = agentTitle.trim();
  return t.length > 0 ? t : "Tool";
}

function modelSelectionFromConfigOptions(
  options: AcpUiSessionConfigOption[],
): AcpUiSessionModelSelection | null {
  const modelOption = options.find(
    (option) => option.type === "select" && option.category === "model",
  );
  if (modelOption?.type !== "select") {
    return null;
  }
  return {
    currentModelId: modelOption.currentValue,
    availableModels: modelOption.options.map((choice) => ({
      modelId: choice.value,
      name: choice.name,
    })),
  };
}

function isModelConfigPick(
  options: ReadonlyArray<AcpUiSessionConfigOption>,
  configId: string,
): boolean {
  const option = options.find((row) => row.configId === configId);
  return option?.type === "select" && option.category === "model";
}

function agentNameFromState(state: ChatState): string {
  return state.acpAgentSelection?.currentName ?? "";
}

function applySessionConfigOptions(
  state: ChatState,
  options: AcpUiSessionConfigOption[],
): ChatState {
  const agentName = agentNameFromState(state);
  if (agentName.length > 0) {
    cacheModelParamOptionsFromSession(agentName, options);
    writeCachedSessionConfigOptions(agentName, options);
  }
  const modelSelection = modelSelectionFromConfigOptions(options);
  return {
    ...state,
    sessionConfigOptions: options,
    sessionConfigLoading: false,
    ...(modelSelection !== null ? { modelSelection } : {}),
  };
}

function applySessionConfigOptionsLoading(state: ChatState): ChatState {
  return {
    ...state,
    sessionConfigOptions: null,
    modelSelection: null,
    sessionConfigLoading: true,
  };
}

export function createInitialChatState(): ChatState {
  return {
    trace: [],
    openStreamIndex: null,
    toolIndexById: new Map(),
    promptInFlight: false,
    errorText: null,
    modelSelection: null,
    sessionConfigOptions: null,
    sessionConfigLoading: true,
    sessionHistoryLoading: false,
    viewportCacheActive: false,
    replayTrace: [],
    replayToolIndexById: new Map(),
    replayOpenStreamIndex: null,
    replayThoughtStartedAtMs: null,
    replayToolStartedAtMsById: new Map(),
    historyCommit: 0,
    acpAgentSelection: null,
    slashCommands: [],
    permissionPrompt: null,
    askQuestionPrompt: null,
    createPlanPrompt: null,
    lockSessionAgent: false,
    composerPicksLocked: false,
    hideComposerModelControls: false,
    thoughtStartedAtMs: null,
    toolStartedAtMsById: new Map(),
  };
}

function isTerminalToolStatus(status: ToolCallStatus): boolean {
  return status === "completed" || status === "failed";
}

function rememberToolStartedAt(
  toolStartedAtMsById: Map<string, number>,
  toolCallId: string,
  startedAtMs: number,
): Map<string, number> {
  const next = new Map(toolStartedAtMsById);
  next.set(toolCallId, startedAtMs);
  const canonicalId = canonicalToolCallId(toolCallId);
  if (canonicalId !== toolCallId) {
    next.set(canonicalId, startedAtMs);
  }
  return next;
}

function forgetToolStartedAt(
  toolStartedAtMsById: Map<string, number>,
  toolCallId: string,
): Map<string, number> {
  if (!toolStartedAtMsById.has(toolCallId) && !toolStartedAtMsById.has(canonicalToolCallId(toolCallId))) {
    return toolStartedAtMsById;
  }
  const next = new Map(toolStartedAtMsById);
  next.delete(toolCallId);
  next.delete(canonicalToolCallId(toolCallId));
  return next;
}

function resolveToolStartedAtMs(
  toolStartedAtMsById: Map<string, number>,
  toolCallId: string,
): number | undefined {
  return toolStartedAtMsById.get(toolCallId) ?? toolStartedAtMsById.get(canonicalToolCallId(toolCallId));
}

function resolveToolDurationMs(
  provided: number | undefined,
  existing: number | undefined,
  startedAtMs: number | undefined,
  status: ToolCallStatus,
): number | undefined {
  const fromProvided = positiveDurationMs(provided);
  if (fromProvided !== undefined) {
    return fromProvided;
  }
  const fromExisting = positiveDurationMs(existing);
  if (fromExisting !== undefined) {
    return fromExisting;
  }
  if (!isTerminalToolStatus(status) || startedAtMs === undefined) {
    return undefined;
  }
  return positiveDurationMs(Date.now() - startedAtMs);
}

function finalizeOpenThoughtDuration(state: ChatState): ChatState {
  const open = state.openStreamIndex;
  if (open === null || state.thoughtStartedAtMs === null) {
    return state;
  }
  const existing = state.trace[open];
  if (existing?.type !== "thought" || existing.durationMs !== undefined) {
    return state;
  }
  const durationMs = Date.now() - state.thoughtStartedAtMs;
  if (!(durationMs > 0)) {
    return { ...state, thoughtStartedAtMs: null };
  }
  const trace = state.trace.slice();
  trace[open] = { ...existing, durationMs };
  return { ...state, trace, thoughtStartedAtMs: null };
}

/**
 * Copies UI-only thought metadata (durationMs) from a cached visible-trace onto
 * the authoritative agent-replay transcript by thought order.
 */
export function mergeThoughtDurationsFromCache(
  authoritative: readonly TraceItem[],
  metadataSource: readonly TraceItem[],
): TraceItem[] {
  const cachedDurations: number[] = [];
  for (const item of metadataSource) {
    if (item.type === "thought" && item.durationMs !== undefined && item.durationMs > 0) {
      cachedDurations.push(item.durationMs);
    }
  }
  if (cachedDurations.length === 0) {
    return authoritative.slice();
  }
  let thoughtIndex = 0;
  return authoritative.map((item) => {
    if (item.type !== "thought") {
      return item;
    }
    const cached = cachedDurations[thoughtIndex];
    thoughtIndex += 1;
    if (item.durationMs !== undefined && item.durationMs > 0) {
      return item;
    }
    if (cached === undefined) {
      return item;
    }
    return { ...item, durationMs: cached };
  });
}

/**
 * Copies UI-only tool metadata (durationMs) from a cached visible-trace onto
 * the authoritative agent-replay transcript by toolCallId.
 */
export function mergeToolDurationsFromCache(
  authoritative: readonly TraceItem[],
  metadataSource: readonly TraceItem[],
): TraceItem[] {
  const cachedById = new Map<string, number>();
  for (const item of metadataSource) {
    if (item.type !== "tool") {
      continue;
    }
    const durationMs = positiveDurationMs(item.durationMs);
    if (durationMs === undefined) {
      continue;
    }
    cachedById.set(canonicalToolCallId(item.toolCallId), durationMs);
  }
  if (cachedById.size === 0) {
    return authoritative.slice();
  }
  return authoritative.map((item) => {
    if (item.type !== "tool") {
      return item;
    }
    if (positiveDurationMs(item.durationMs) !== undefined) {
      return item;
    }
    const cached = cachedById.get(canonicalToolCallId(item.toolCallId));
    if (cached === undefined) {
      return item;
    }
    return { ...item, durationMs: cached };
  });
}

function stateAfterLeavingOpenThoughtStream(state: ChatState): ChatState {
  const open = state.openStreamIndex;
  if (open === null) {
    return state;
  }
  const existing = state.trace[open];
  if (existing?.type === "thought") {
    return finalizeOpenThoughtDuration(state);
  }
  return state;
}

/**
 * Builds initial chat state from the host `init` payload (model list from ACP or playground readme seed).
 */
function traceFromVisibleCache(items: readonly AcpUiVisibleTraceItem[] | undefined): {
  trace: TraceItem[];
  toolIndexById: Map<string, number>;
} {
  const trace: TraceItem[] = [];
  const toolIndexById = new Map<string, number>();
  for (const item of items ?? []) {
    if (item.type === "tool") {
      const hasDiff = item.diffRows !== undefined && item.diffRows.length > 0;
      const hasContent = item.content !== undefined && item.content.trim().length > 0;
      const durationMs = positiveDurationMs(item.durationMs);
      const tool: TraceToolItem = {
        type: "tool",
        toolCallId: item.toolCallId,
        title: item.title,
        kind: item.kind,
        subtitle: item.subtitle,
        status: item.status,
        content: item.content,
        diffRows: item.diffRows,
        detailVisible: item.detailVisible === true || hasDiff || hasContent,
        ...(durationMs !== undefined ? { durationMs } : {}),
      };
      toolIndexById.set(tool.toolCallId, trace.length);
      const canonicalId = canonicalToolCallId(tool.toolCallId);
      if (canonicalId !== tool.toolCallId) {
        toolIndexById.set(canonicalId, trace.length);
      }
      trace.push(tool);
      continue;
    }
    trace.push(item);
  }
  return { trace, toolIndexById };
}

export function createChatStateFromInit(payload: InitPayload): ChatState {
  const seeded = traceFromVisibleCache(payload.visibleTrace);
  const base: ChatState = {
    ...createInitialChatState(),
    trace: seeded.trace,
    toolIndexById: seeded.toolIndexById,
    sessionHistoryLoading: payload.sessionHistoryLoading === true,
    viewportCacheActive: seeded.trace.length > 0 && payload.sessionHistoryLoading === true,
    acpAgentSelection: buildAcpAgentSelectionFromInit(payload),
    lockSessionAgent: payload.lockSessionAgent === true,
    composerPicksLocked: false,
    hideComposerModelControls: payload.hideComposerModelControls === true,
  };
  if (
    payload.sessionConfigOptionsSeed !== undefined &&
    payload.sessionConfigOptionsSeed.length > 0
  ) {
    return applySessionConfigOptions(base, payload.sessionConfigOptionsSeed);
  }
  const hasBootstrapModels =
    payload.sessionModels !== undefined && payload.sessionModels.availableModels.length > 0;
  return {
    ...base,
    modelSelection: payload.sessionModels ?? null,
    sessionConfigLoading: payload.hideComposerModelControls === true ? false : !hasBootstrapModels,
    sessionHistoryLoading: payload.sessionHistoryLoading === true,
  };
}

function buildAcpAgentSelectionFromInit(payload: InitPayload): AcpAgentSelectionState | null {
  const named = payload.acpAgentName;
  if (named !== undefined && named.length > 0) {
    return { currentName: named };
  }
  return null;
}

function appendUserText(state: ChatState, text: string): ChatState {
  const last = state.trace[state.trace.length - 1];
  if (last?.type === "user") {
    const trace = state.trace.slice();
    trace[trace.length - 1] = { type: "user", text: last.text + text };
    return { ...state, trace };
  }
  return {
    ...state,
    trace: [...state.trace, { type: "user" as const, text }],
  };
}

function appendAgentText(state: ChatState, text: string): ChatState {
  const open = state.openStreamIndex;
  if (open !== null) {
    const existing = state.trace[open];
    if (existing?.type === "agent") {
      const trace = state.trace.slice();
      trace[open] = { type: "agent", text: existing.text + text };
      return { ...state, trace };
    }
    if (existing?.type === "thought") {
      state = finalizeOpenThoughtDuration(state);
    }
  }
  const trace = [...state.trace, { type: "agent" as const, text }];
  return {
    ...state,
    trace,
    openStreamIndex: trace.length - 1,
  };
}

function appendAgentThought(
  state: ChatState,
  text: string,
  durationMs: number | undefined,
): ChatState {
  const resolvedDuration =
    durationMs !== undefined && durationMs > 0 ? durationMs : undefined;
  const open = state.openStreamIndex;
  if (open !== null) {
    const existing = state.trace[open];
    if (existing?.type === "thought") {
      const mergedDuration = resolvedDuration ?? existing.durationMs;
      const trace = state.trace.slice();
      trace[open] = {
        type: "thought",
        text: joinThoughtChunks(existing.text, text),
        ...(mergedDuration !== undefined && mergedDuration > 0
          ? { durationMs: mergedDuration }
          : {}),
      };
      const thoughtStartedAtMs =
        mergedDuration !== undefined && mergedDuration > 0
          ? null
          : (state.thoughtStartedAtMs ?? Date.now());
      return { ...state, trace, thoughtStartedAtMs };
    }
  }
  const trace = [
    ...state.trace,
    {
      type: "thought" as const,
      text,
      ...(resolvedDuration !== undefined ? { durationMs: resolvedDuration } : {}),
    },
  ];
  return {
    ...state,
    trace,
    openStreamIndex: trace.length - 1,
    thoughtStartedAtMs: resolvedDuration !== undefined ? null : Date.now(),
  };
}

function isWordChar(char: string): boolean {
  return /[\p{L}\p{N}_]/u.test(char);
}

function opensFenceBoundary(text: string): boolean {
  const fences = text.match(/```/g);
  return (fences?.length ?? 0) % 2 === 1;
}

function startsWithPunctuation(text: string): boolean {
  return /^[,.;:!?]/.test(text);
}

/**
 * Joins streamed thought chunks with natural spacing outside fenced code blocks.
 */
export function joinThoughtChunks(existing: string, incoming: string): string {
  if (existing.length === 0 || incoming.length === 0) {
    return existing + incoming;
  }
  if (opensFenceBoundary(existing)) {
    return existing + incoming;
  }
  const existingEndsWithWhitespace = /\s$/.test(existing);
  const incomingStartsWithWhitespace = /^\s/.test(incoming);
  if (existingEndsWithWhitespace || incomingStartsWithWhitespace) {
    return existing + incoming;
  }
  const existingLast = existing.at(-1) ?? "";
  const incomingFirst = incoming[0] ?? "";
  if (isWordChar(existingLast) && isWordChar(incomingFirst) && !startsWithPunctuation(incoming)) {
    return `${existing} ${incoming}`;
  }
  return existing + incoming;
}

function rememberToolIndex(
  toolIndexById: Map<string, number>,
  toolCallId: string,
  index: number,
): void {
  toolIndexById.set(toolCallId, index);
  const canonicalId = canonicalToolCallId(toolCallId);
  if (canonicalId !== toolCallId) {
    toolIndexById.set(canonicalId, index);
  }
}

function appendToolCall(
  state: ChatState,
  toolCallId: string,
  title: string,
  kind: string | undefined,
  status: ToolCallStatus | undefined,
  subtitle: string | undefined,
  durationMs: number | undefined,
): ChatState {
  state = stateAfterLeavingOpenThoughtStream(state);
  const id = canonicalToolCallId(toolCallId);
  const existingIdx = resolveToolIndexByCallId(state.toolIndexById, toolCallId);
  if (existingIdx !== undefined) {
    const existing = state.trace[existingIdx];
    if (existing?.type === "tool") {
      const mergedStatus = status ?? existing.status;
      const mergedSubtitle =
        subtitle !== undefined && subtitle.trim().length > 0 ? subtitle.trim() : existing.subtitle;
      const startedAtMs = resolveToolStartedAtMs(state.toolStartedAtMsById, id);
      const resolvedDuration = resolveToolDurationMs(
        durationMs,
        existing.durationMs,
        startedAtMs,
        mergedStatus,
      );
      const trace = state.trace.slice();
      trace[existingIdx] = {
        ...existing,
        title: toolDisplayTitle(kind !== undefined ? kind : existing.kind, title),
        kind: kind !== undefined ? kind : existing.kind,
        status: mergedStatus,
        subtitle: mergedSubtitle,
        ...(resolvedDuration !== undefined ? { durationMs: resolvedDuration } : {}),
      };
      const toolIndexById = new Map(state.toolIndexById);
      rememberToolIndex(toolIndexById, id, existingIdx);
      let toolStartedAtMsById = state.toolStartedAtMsById;
      if (resolvedDuration !== undefined || isTerminalToolStatus(mergedStatus)) {
        toolStartedAtMsById = forgetToolStartedAt(toolStartedAtMsById, id);
      } else if (startedAtMs === undefined) {
        toolStartedAtMsById = rememberToolStartedAt(toolStartedAtMsById, id, Date.now());
      }
      return {
        ...state,
        trace,
        toolIndexById,
        toolStartedAtMsById,
        openStreamIndex: null,
      };
    }
  }
  const newStatus = status ?? "pending";
  const startedAtMs = resolveToolStartedAtMs(state.toolStartedAtMsById, id);
  const resolvedDuration = resolveToolDurationMs(durationMs, undefined, startedAtMs, newStatus);
  const newItem: TraceToolItem = {
    type: "tool",
    toolCallId: id,
    title: toolDisplayTitle(kind, title),
    kind,
    subtitle,
    status: newStatus,
    content: undefined,
    diffRows: undefined,
    detailVisible: false,
    ...(resolvedDuration !== undefined ? { durationMs: resolvedDuration } : {}),
  };
  const trace = [...state.trace, newItem];
  const toolIndexById = new Map(state.toolIndexById);
  rememberToolIndex(toolIndexById, id, trace.length - 1);
  let toolStartedAtMsById = state.toolStartedAtMsById;
  if (resolvedDuration !== undefined || isTerminalToolStatus(newStatus)) {
    toolStartedAtMsById = forgetToolStartedAt(toolStartedAtMsById, id);
  } else {
    toolStartedAtMsById = rememberToolStartedAt(toolStartedAtMsById, id, Date.now());
  }
  return {
    ...state,
    trace,
    toolIndexById,
    toolStartedAtMsById,
    openStreamIndex: null,
  };
}

function updateToolCall(
  state: ChatState,
  toolCallId: string,
  status: ToolCallStatus,
  content: string | undefined,
  subtitle: string | undefined,
  diffRows: ToolCallDiffRow[] | undefined,
  kind: string | undefined,
  durationMs: number | undefined,
): ChatState {
  const id = canonicalToolCallId(toolCallId);
  const idx = resolveToolIndexByCallId(state.toolIndexById, toolCallId);
  if (idx !== undefined) {
    const item = state.trace[idx];
    if (item?.type !== "tool") {
      return state;
    }
    const mergedContent = content !== undefined ? content : item.content;
    const mergedDiffRows = diffRows !== undefined && diffRows.length > 0 ? diffRows : item.diffRows;
    const detailVisible =
      (mergedContent !== undefined && mergedContent.trim().length > 0) ||
      (mergedDiffRows !== undefined && mergedDiffRows.length > 0);
    const mergedSubtitle =
      subtitle !== undefined && subtitle.trim().length > 0 ? subtitle.trim() : item.subtitle;
    const mergedKind = kind !== undefined && kind.trim().length > 0 ? kind.trim() : item.kind;
    const inferredKind =
      mergedKind ??
      (mergedDiffRows !== undefined && mergedDiffRows.length > 0 ? "edit" : undefined);
    const mergedTitle = toolDisplayTitle(inferredKind, item.title);
    const startedAtMs = resolveToolStartedAtMs(state.toolStartedAtMsById, id);
    const resolvedDuration = resolveToolDurationMs(
      durationMs,
      item.durationMs,
      startedAtMs,
      status,
    );
    const trace = state.trace.slice();
    trace[idx] = {
      ...item,
      toolCallId: canonicalToolCallId(item.toolCallId),
      status,
      content: mergedContent,
      diffRows: mergedDiffRows,
      detailVisible,
      subtitle: mergedSubtitle,
      kind: inferredKind,
      title: mergedTitle,
      ...(resolvedDuration !== undefined ? { durationMs: resolvedDuration } : {}),
    };
    const toolIndexById = new Map(state.toolIndexById);
    rememberToolIndex(toolIndexById, id, idx);
    let toolStartedAtMsById = state.toolStartedAtMsById;
    if (resolvedDuration !== undefined || isTerminalToolStatus(status)) {
      toolStartedAtMsById = forgetToolStartedAt(toolStartedAtMsById, id);
    } else if (startedAtMs === undefined) {
      toolStartedAtMsById = rememberToolStartedAt(toolStartedAtMsById, id, Date.now());
    }
    return { ...state, trace, toolIndexById, toolStartedAtMsById };
  }
  state = stateAfterLeavingOpenThoughtStream(state);
  const mergedContent = content;
  const mergedDiffRows = diffRows !== undefined && diffRows.length > 0 ? diffRows : undefined;
  const detailVisible =
    (mergedContent !== undefined && mergedContent.trim().length > 0) ||
    (mergedDiffRows !== undefined && mergedDiffRows.length > 0);
  const inferredKind =
    kind !== undefined && kind.trim().length > 0
      ? kind.trim()
      : mergedDiffRows !== undefined && mergedDiffRows.length > 0
        ? "edit"
        : undefined;
  const startedAtMs = resolveToolStartedAtMs(state.toolStartedAtMsById, id);
  const resolvedDuration = resolveToolDurationMs(durationMs, undefined, startedAtMs, status);
  const newItem: TraceToolItem = {
    type: "tool",
    toolCallId: id,
    title: toolDisplayTitle(inferredKind, ""),
    kind: inferredKind,
    subtitle: subtitle !== undefined && subtitle.trim().length > 0 ? subtitle.trim() : undefined,
    status,
    content: mergedContent,
    diffRows: mergedDiffRows,
    detailVisible,
    ...(resolvedDuration !== undefined ? { durationMs: resolvedDuration } : {}),
  };
  const trace = [...state.trace, newItem];
  const toolIndexById = new Map(state.toolIndexById);
  rememberToolIndex(toolIndexById, id, trace.length - 1);
  let toolStartedAtMsById = state.toolStartedAtMsById;
  if (resolvedDuration !== undefined || isTerminalToolStatus(status)) {
    toolStartedAtMsById = forgetToolStartedAt(toolStartedAtMsById, id);
  } else {
    toolStartedAtMsById = rememberToolStartedAt(toolStartedAtMsById, id, Date.now());
  }
  return {
    ...state,
    trace,
    toolIndexById,
    toolStartedAtMsById,
    openStreamIndex: null,
  };
}

/**
 * Applies extension protocol messages and local submit actions to chat UI state.
 */
function applySessionReset(state: ChatState): ChatState {
  return {
    ...state,
    trace: [],
    openStreamIndex: null,
    toolIndexById: new Map(),
    promptInFlight: false,
    errorText: null,
    permissionPrompt: null,
    askQuestionPrompt: null,
    createPlanPrompt: null,
    sessionConfigOptions: null,
    modelSelection: null,
    sessionConfigLoading: true,
    sessionHistoryLoading: false,
    viewportCacheActive: false,
    replayTrace: [],
    replayToolIndexById: new Map(),
    replayOpenStreamIndex: null,
    replayThoughtStartedAtMs: null,
    replayToolStartedAtMsById: new Map(),
    composerPicksLocked: false,
    thoughtStartedAtMs: null,
    toolStartedAtMsById: new Map(),
  };
}

function todoStatusEmoji(status: TodoEntry["status"]): string {
  if (status === "completed") {
    return "x";
  }
  if (status === "in_progress") {
    return "~";
  }
  if (status === "cancelled") {
    return "-";
  }
  return " ";
}

function isReplayTranscriptAction(action: ChatAction): boolean {
  switch (action.type) {
    case "appendAgentText":
    case "appendUserText":
    case "appendAgentThought":
    case "appendToolCall":
    case "updateToolCall":
    case "appendPlan":
    case "cursorUpdateTodos":
    case "cursorTask":
    case "cursorGenerateImage":
    case "turnComplete":
      return true;
    default:
      return false;
  }
}

function replayShadow(state: ChatState): ChatState {
  return {
    ...state,
    trace: state.replayTrace,
    toolIndexById: state.replayToolIndexById,
    openStreamIndex: state.replayOpenStreamIndex,
    thoughtStartedAtMs: state.replayThoughtStartedAtMs,
    toolStartedAtMsById: state.replayToolStartedAtMsById,
    sessionHistoryLoading: false,
    viewportCacheActive: false,
  };
}

function withReplayResult(state: ChatState, next: ChatState): ChatState {
  return {
    ...state,
    replayTrace: next.trace,
    replayToolIndexById: next.toolIndexById,
    replayOpenStreamIndex: next.openStreamIndex,
    replayThoughtStartedAtMs: next.thoughtStartedAtMs,
    replayToolStartedAtMsById: next.toolStartedAtMsById,
  };
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  if (state.viewportCacheActive && state.sessionHistoryLoading && isReplayTranscriptAction(action)) {
    return withReplayResult(state, chatReducer(replayShadow(state), action));
  }
  if (action.type === "submit") {
    const afterThought = stateAfterLeavingOpenThoughtStream(state);
    return {
      ...afterThought,
      trace: [...afterThought.trace, { type: "user", text: action.body }],
      promptInFlight: true,
      errorText: null,
      openStreamIndex: null,
      toolIndexById: new Map(),
      toolStartedAtMsById: new Map(),
      composerPicksLocked: state.lockSessionAgent === true ? state.composerPicksLocked : true,
    };
  }
  if (action.type === "pickSessionModel") {
    if (state.composerPicksLocked || state.modelSelection === null) {
      return state;
    }
    if (state.sessionConfigOptions !== null) {
      const modelOption = modelConfigOption({
        options: state.sessionConfigOptions,
      });
      if (modelOption !== undefined) {
        const cached = readCachedModelParamOptions(
          agentNameFromState(state),
          modelParamCacheKey(action.modelId, modelOption),
        );
        return applySessionConfigOptions(
          state,
          resolvedModelParamOptionsForModelPick(
            state.sessionConfigOptions,
            modelOption.configId,
            action.modelId,
            cached,
          ),
        );
      }
    }
    return {
      ...state,
      modelSelection: {
        ...state.modelSelection,
        currentModelId: action.modelId,
      },
    };
  }
  if (action.type === "pickSessionConfigOption") {
    if (state.composerPicksLocked || state.sessionConfigOptions === null) {
      return state;
    }
    const isModelPick = isModelConfigPick(state.sessionConfigOptions, action.configId);
    if (isModelPick && typeof action.value === "string" && action.value.length > 0) {
      const modelOption = modelConfigOption({
        options: state.sessionConfigOptions,
      });
      const cached = readCachedModelParamOptions(
        agentNameFromState(state),
        modelParamCacheKey(action.value, modelOption),
      );
      return applySessionConfigOptions(
        state,
        resolvedModelParamOptionsForModelPick(
          state.sessionConfigOptions,
          action.configId,
          action.value,
          cached,
        ),
      );
    }
    const nextOptions = state.sessionConfigOptions.map((option) => {
      if (option.configId !== action.configId) {
        return option;
      }
      if (option.type === "boolean") {
        return {
          ...option,
          currentValue: typeof action.value === "boolean" ? action.value : action.value === "true",
        };
      }
      return {
        ...option,
        currentValue: typeof action.value === "string" ? action.value : option.currentValue,
      };
    });
    return applySessionConfigOptions(state, nextOptions);
  }
  if (action.type === "clearPermissionPrompt") {
    return { ...state, permissionPrompt: null };
  }
  if (action.type === "clearAskQuestionPrompt") {
    return { ...state, askQuestionPrompt: null };
  }
  if (action.type === "clearCreatePlanPrompt") {
    return { ...state, createPlanPrompt: null };
  }
  switch (action.type) {
    case "sessionReset":
      return applySessionReset(state);
    case "sessionModels": {
      const modelSelection = {
        currentModelId: action.currentModelId,
        availableModels: action.availableModels,
      };
      const agentName = agentNameFromState(state);
      if (agentName.length > 0) {
        writeCachedSessionModels(agentName, modelSelection);
      }
      return {
        ...state,
        modelSelection,
        sessionConfigLoading: false,
      };
    }
    case "sessionConfigOptions":
      return applySessionConfigOptions(state, action.options);
    case "sessionConfigOptionsLoading":
      return applySessionConfigOptionsLoading(state);
    case "sessionHistoryLoading":
      if (action.loading) {
        return { ...state, sessionHistoryLoading: true };
      }
      if (state.viewportCacheActive && state.replayTrace.length > 0) {
        return {
          ...state,
          sessionHistoryLoading: false,
          viewportCacheActive: false,
          trace: mergeToolDurationsFromCache(
            mergeThoughtDurationsFromCache(state.replayTrace, state.trace),
            state.trace,
          ),
          toolIndexById: state.replayToolIndexById,
          openStreamIndex: state.replayOpenStreamIndex,
          thoughtStartedAtMs: state.replayThoughtStartedAtMs,
          toolStartedAtMsById: state.replayToolStartedAtMsById,
          replayTrace: [],
          replayToolIndexById: new Map(),
          replayOpenStreamIndex: null,
          replayThoughtStartedAtMs: null,
          replayToolStartedAtMsById: new Map(),
          historyCommit: state.historyCommit + 1,
        };
      }
      return {
        ...state,
        sessionHistoryLoading: false,
        viewportCacheActive: false,
      };
    case "appendAgentText":
      return appendAgentText(state, action.text);
    case "appendUserText":
      return appendUserText(state, action.text);
    case "appendAgentThought":
      return appendAgentThought(state, action.text, action.durationMs);
    case "appendToolCall":
      return appendToolCall(
        state,
        action.toolCallId,
        action.title,
        action.kind,
        action.status,
        action.subtitle,
        action.durationMs,
      );
    case "updateToolCall":
      return updateToolCall(
        state,
        action.toolCallId,
        action.status,
        action.content,
        action.subtitle,
        action.diffRows,
        action.kind,
        action.durationMs,
      );
    case "slashCommands":
      return { ...state, slashCommands: action.commands };
    case "permissionRequest":
      return {
        ...state,
        permissionPrompt: {
          requestId: action.requestId,
          toolTitle: action.toolTitle,
          options: action.options,
        },
      };
    case "cursorAskQuestionRequest":
      return { ...state, askQuestionPrompt: action };
    case "cursorCreatePlanRequest":
      return { ...state, createPlanPrompt: action };
    case "cursorUpdateTodos": {
      const base = stateAfterLeavingOpenThoughtStream(state);
      const trace = [
        ...base.trace,
        {
          type: "plan" as const,
          entries: action.todos.map((todo) => ({
            content: `[${todoStatusEmoji(todo.status)}] ${todo.content}`,
            status: todo.status,
          })),
        },
      ];
      return { ...base, trace, openStreamIndex: null };
    }
    case "cursorTask": {
      const base = stateAfterLeavingOpenThoughtStream(state);
      const taskLine = `Subagent task: ${action.description}`;
      const trace = [...base.trace, { type: "agent" as const, text: taskLine }];
      return { ...base, trace, openStreamIndex: trace.length - 1 };
    }
    case "cursorGenerateImage": {
      const base = stateAfterLeavingOpenThoughtStream(state);
      const text =
        action.filePath !== undefined
          ? `Generated image: ${action.filePath}`
          : `Generate image requested: ${action.description}`;
      const trace = [...base.trace, { type: "agent" as const, text }];
      return { ...base, trace, openStreamIndex: trace.length - 1 };
    }
    case "appendPlan": {
      const base = stateAfterLeavingOpenThoughtStream(state);
      const trace = [...base.trace, { type: "plan" as const, entries: action.entries }];
      return {
        ...base,
        trace,
        openStreamIndex: null,
      };
    }
    case "commandFeedback": {
      const base = stateAfterLeavingOpenThoughtStream(state);
      const trace = [...base.trace, { type: "agent" as const, text: action.message }];
      return {
        ...base,
        trace,
        openStreamIndex: trace.length - 1,
        promptInFlight: false,
        errorText: null,
      };
    }
    case "turnComplete": {
      const base = finalizeOpenThoughtDuration(state);
      return {
        ...base,
        openStreamIndex: null,
        promptInFlight: false,
      };
    }
    case "error": {
      const base = finalizeOpenThoughtDuration(state);
      return {
        ...base,
        openStreamIndex: null,
        errorText: action.message,
        promptInFlight: false,
      };
    }
    default:
      return state;
  }
}

/**
 * Replays persisted session log events onto the initial state from `init`.
 */
export function replayChatState(
  init: InitPayload,
  events: Array<ExtensionMessageAfterInit | { type: "submit"; body: string }>,
): ChatState {
  let state = createChatStateFromInit(init);
  for (const event of events) {
    state = chatReducer(state, event as ChatAction);
  }
  return state;
}
