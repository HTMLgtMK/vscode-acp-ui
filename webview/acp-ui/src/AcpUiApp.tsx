import "./AcpUiApp.css";
import "./scrollRegions.css";
import {
  Fragment,
  type DragEvent,
  type KeyboardEvent,
  type ReactElement,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { cycleSessionModePick } from "../../../src/acp/session/sessionConfigOptions";
import type {
  AcpUiSlashCommand,
  ToolCallVerbosity,
  WorkspacePathOpenTarget,
} from "../../../src/protocol/extensionHostMessages";
import {
  type ChatAction,
  chatReducer,
  createChatStateFromInit,
  type ChatState,
  type ExtensionMessageAfterInit,
  type InitPayload,
  type TraceItem,
} from "./chatReducer";
import { ChatComposer } from "./components/ChatComposer";
import { installSessionModeIndicatorThemeColors } from "./sessionModeIndicatorTheme";
import {
    installAgentMarkdownThemeColors,
    updateAgentMarkdownThemeColors,
} from "./agentMarkdownTheme";
import {
  buildComposerAutocompleteState,
  wrapIndex,
} from "./components/composerAutocomplete";
import {
  shouldCancelRunOnCtrlC,
  shouldConfirmOnEnter,
  shouldCycleSessionModeOnShiftTab,
  shouldOpenNewChatOnCtrlT,
} from "./components/composerKeybindings";
import { PermissionApprovalCard } from "./components/PermissionApprovalCard";
import { TaskDetailHeader } from "./components/TaskDetailHeader";
import { TraceList } from "./components/TraceList";
import { TraceFilters } from "./components/TraceFilters";
import {
  TRACE_FILTER_KINDS,
  countsAsTraceEvent,
  countByKind,
  filterItems,
  isNearBottom,
  type TraceFilterKind,
} from "./traceView";
import { SessionHistoryLoader } from "./components/SessionHistoryLoader";
import {
  appendFileMentionsToDraft,
  collectPathsFromDataTransfer,
  dataTransferLooksLikePathDrop,
} from "./droppedFilePaths";

export type AcpUiAppProps = {
  init: InitPayload;
  initialChatState?: ChatState;
  postSend: (body: string) => void;
  postCancel: () => void;
  postRenameSession: (title: string) => void;
  postResetSession: () => void;
  postSetSessionModel: (modelId: string) => void;
  postSetSessionConfigOption: (
    configId: string,
    value: string | boolean,
  ) => void;
  postSaveHistory: (entries: string[]) => void;
  postOpenNewChat?: () => void;
  postOpenWorkspacePath?: (
    path: string,
    options?: { target?: WorkspacePathOpenTarget },
  ) => void;
  postPermissionResponse: (
    payload:
      | { requestId: string; selectedOptionId: string }
      | { requestId: string; cancelled: true },
  ) => void;
  extensionDispatchRef: RefObject<
    ((message: ExtensionMessageAfterInit) => void) | null
  >;
  onExtensionDispatchReady?: () => void;
};

/**
 * ACP UI editor webview: header, transcript, composer, and protocol-driven transcript updates.
 */
export function AcpUiApp({
  init,
  initialChatState,
  postSend,
  postCancel,
  postRenameSession,
  postResetSession,
  postSetSessionModel,
  postSetSessionConfigOption,
  postSaveHistory,
  postOpenNewChat,
  postOpenWorkspacePath,
  postPermissionResponse,
  extensionDispatchRef,
  onExtensionDispatchReady,
}: AcpUiAppProps): ReactElement {
  const [state, dispatch] = useReducer(
    chatReducer,
    { init, initialChatState },
    ({ init: initPayload, initialChatState: replayed }) =>
      replayed ?? createChatStateFromInit(initPayload),
  );
  const [draft, setDraft] = useState("");
  const [history, setHistory] = useState<string[]>(init.history ?? []);
  const [historyBrowse, setHistoryBrowse] = useState<{
    pointer: number;
    restore: string;
  } | null>(null);
  const [expandAllToolOutputs, setExpandAllToolOutputs] = useState(false);
  const [showThinkingBlocks, setShowThinkingBlocks] = useState(true);
  const [toolCallVerbosity, setToolCallVerbosity] = useState<ToolCallVerbosity>(
    init.toolCallVerbosity ?? "verbose",
  );
  const [contentWidthRatio, setContentWidthRatio] = useState(
    init.contentWidthRatio ?? 1,
  );
  const traceRef = useRef<HTMLElement | null>(null);
  const traceContentRef = useRef<HTMLDivElement | null>(null);
  /** 跟不跟最新那条事件。人上滚就断，点"↓ N 条新事件"或 live 那颗才接上。 */
  const [followLive, setFollowLive] = useState(true);
  const [pendingEvents, setPendingEvents] = useState(0);
  const [shownKinds, setShownKinds] = useState<ReadonlySet<TraceFilterKind>>(
    () => new Set(TRACE_FILTER_KINDS),
  );
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [fileDragActive, setFileDragActive] = useState(false);
  const [composerSuggestionIndex, setComposerSuggestionIndex] = useState(0);
  const [composerAutocompleteDismissed, setComposerAutocompleteDismissed] =
    useState(false);

  const scrollTraceToBottomIfPinned = useCallback((): void => {
    const el = traceRef.current;
    if (el !== null && followLive) {
      el.scrollTop = el.scrollHeight;
    }
  }, [followLive]);

  const onTraceScroll = useCallback((): void => {
    const el = traceRef.current;
    if (el === null) {
      return;
    }
    const nearBottom = isNearBottom(
      el.scrollHeight,
      el.scrollTop,
      el.clientHeight,
    );
    // 同一个值重复 setState 不会重渲染，所以这里不用自己判等。
    setFollowLive(nearBottom);
    if (nearBottom) {
      // 人自己滚回最新了，那颗"↓ N 条新事件"就没东西可提示了。
      setPendingEvents(0);
    }
  }, []);

  const resumeLive = useCallback((): void => {
    setFollowLive(true);
    setPendingEvents(0);
    const el = traceRef.current;
    if (el !== null) {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  extensionDispatchRef.current = (message: ExtensionMessageAfterInit) => {
    if (message.type === "vscodeThemeVariables") {
      updateAgentMarkdownThemeColors(message.variables);
      return;
    }
    if (message.type === "toolCallVerbosity") {
      setToolCallVerbosity(message.verbosity);
      return;
    }
    if (message.type === "contentWidthRatio") {
      setContentWidthRatio(message.ratio);
      return;
    }
    if (message.type === "sessionReset") {
      setPendingEvents(0);
    } else if (!followLive && countsAsTraceEvent(message)) {
      // 人正在往回看：数着条数，别把他拽下去。
      setPendingEvents((count) => count + 1);
    }
    dispatch(message as ChatAction);
  };

  useLayoutEffect(() => {
    onExtensionDispatchReady?.();
  });

  useLayoutEffect(() => {
    const cleanup = installAgentMarkdownThemeColors(init.vscodeThemeVariables);
    return cleanup;
  }, [init]);

  useLayoutEffect(() => installSessionModeIndicatorThemeColors(), []);

  useLayoutEffect(() => {
    scrollTraceToBottomIfPinned();
  }, [state.trace, scrollTraceToBottomIfPinned]);

  useEffect(() => {
    const content = traceContentRef.current;
    if (content === null) {
      return;
    }
    const observer = new ResizeObserver(() => {
      scrollTraceToBottomIfPinned();
    });
    observer.observe(content);
    return () => {
      observer.disconnect();
    };
  }, [scrollTraceToBottomIfPinned]);

  useEffect(() => {
    const onDocumentKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (shouldOpenNewChatOnCtrlT(event)) {
        if (postOpenNewChat !== undefined) {
          event.preventDefault();
          postOpenNewChat();
        }
        return;
      }
      if (
        event.key.toLowerCase() !== "o" ||
        (!event.ctrlKey && !event.metaKey)
      ) {
        return;
      }
      const target = event.target;
      if (
        target !== null &&
        target instanceof HTMLElement &&
        target.closest("textarea, input, [contenteditable='true']")
      ) {
        return;
      }
      event.preventDefault();
      setExpandAllToolOutputs((expanded) => !expanded);
    };
    document.addEventListener("keydown", onDocumentKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onDocumentKeyDown, true);
    };
  }, [postOpenNewChat]);

  const dropFilesDisabled =
    state.composerReadOnly ||
    state.promptInFlight ||
    state.permissionQueue.length > 0;

  useEffect(() => {
    if (!fileDragActive) {
      return;
    }
    const endDragUi = (): void => {
      setFileDragActive(false);
    };
    window.addEventListener("dragend", endDragUi);
    return () => {
      window.removeEventListener("dragend", endDragUi);
    };
  }, [fileDragActive]);

  const workspaceText =
    init.workspaceLabel !== undefined && init.workspaceLabel.length > 0
      ? init.workspaceLabel
      : "No workspace folder open";

  const activityLabel = useMemo(
    () =>
      composerActivityLabel(
        state.promptInFlight,
        state.trace,
        state.openStreamIndex,
      ),
    [state.promptInFlight, state.trace, state.openStreamIndex],
  );

  const builtInSlashCommands = useMemo((): AcpUiSlashCommand[] => {
    return [
      {
        name: "clear",
        description: "Clear the transcript and start a fresh agent session",
      },
      {
        name: "new",
        description: "Same as /clear — new session, empty transcript",
      },
      {
        name: "rename",
        description: "Rename the current chat (usage: /rename <new-name>)",
      },
      {
        name: "show-thinking",
        description: "Toggle visibility of thought blocks",
      },
    ];
  }, []);

  const mergedSlashCommands = useMemo(() => {
    const seen = new Set<string>();
    const out: AcpUiSlashCommand[] = [];
    for (const cmd of [...builtInSlashCommands, ...state.slashCommands]) {
      const key = cmd.name.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      out.push(cmd);
    }
    return out;
  }, [builtInSlashCommands, state.slashCommands]);

  const onDraftChange = useCallback((value: string): void => {
    setDraft(value);
    setHistoryBrowse((browse) => (browse !== null ? null : browse));
    setComposerSuggestionIndex(0);
    setComposerAutocompleteDismissed(false);
  }, []);

  const submit = (): void => {
    // 只读面板（任务详情）唯一的发送出口：这里不放行，宿主就收不到 send。
    if (state.composerReadOnly) {
      return;
    }
    if (state.permissionQueue.length > 0) {
      return;
    }
    const body = draft;
    if (body.trim().length === 0) {
      return;
    }
    const asCommand = body.toLowerCase();
    if (asCommand === "/clear" || asCommand === "/new") {
      setDraft("");
      setHistoryBrowse(null);
      resumeLive();
      dispatch({ type: "sessionReset" });
      postResetSession();
      return;
    }
    if (asCommand === "/show-thinking") {
      setDraft("");
      setHistoryBrowse(null);
      setShowThinkingBlocks((value) => !value);
      dispatch({
        type: "commandFeedback",
        message: showThinkingBlocks
          ? "Thought blocks hidden."
          : "Thought blocks shown.",
      });
      return;
    }
    if (body.toLowerCase().startsWith("/rename")) {
      const match = body.match(/^\/rename\s+(\S+)$/i);
      if (match === null) {
        dispatch({
          type: "commandFeedback",
          message: "Usage: /rename <new-name>",
        });
        return;
      }
      const nextTitle = match[1]!;
      setDraft("");
      setHistoryBrowse(null);
      postRenameSession(nextTitle);
      return;
    }
    setDraft("");
    setHistoryBrowse(null);
    setHistory((prev) => {
      const next =
        prev.length > 0 && prev[prev.length - 1] === body
          ? prev
          : [...prev.slice(-49), body];
      postSaveHistory(next);
      return next;
    });
    resumeLive();
    dispatch({ type: "submit", body });
    postSend(body);
  };

  const onComposerKeyDown = (
    event: KeyboardEvent<HTMLTextAreaElement>,
  ): void => {
    const target = event.currentTarget;
    const start = target.selectionStart ?? 0;
    const end = target.selectionEnd ?? 0;
    const mod =
      event.shiftKey || event.ctrlKey || event.metaKey || event.altKey;
    const autocomplete = buildComposerAutocompleteState({
      draft,
      caret: start,
      slashCommands: mergedSlashCommands,
      workspaceFiles: init.workspaceFiles ?? [],
    });
    const autocompleteActive =
      autocomplete !== null && !composerAutocompleteDismissed;
    const hasSelection = start !== end;

    if (
      shouldCycleSessionModeOnShiftTab({
        key: event.key,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
      }) &&
      !state.composerPicksLocked
    ) {
      const pick = cycleSessionModePick(
        state.sessionConfigOptions !== null
          ? { options: state.sessionConfigOptions }
          : null,
      );
      if (pick !== null) {
        event.preventDefault();
        dispatch({
          type: "pickSessionConfigOption",
          configId: pick.configId,
          value: pick.value,
        });
        postSetSessionConfigOption(pick.configId, pick.value);
        return;
      }
    }

    if (
      shouldCancelRunOnCtrlC({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        hasSelection,
        promptInFlight: state.promptInFlight,
      })
    ) {
      event.preventDefault();
      postCancel();
      return;
    }

    if (autocompleteActive && event.key === "Escape") {
      event.preventDefault();
      setComposerSuggestionIndex(0);
      setComposerAutocompleteDismissed(true);
      return;
    }

    if (
      autocompleteActive &&
      (event.key === "ArrowUp" || event.key === "ArrowDown")
    ) {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setComposerSuggestionIndex((current) =>
        wrapIndex(current + delta, autocomplete.items.length),
      );
      return;
    }

    if (
      autocompleteActive &&
      shouldConfirmOnEnter({
        key: event.key,
        shiftKey: event.shiftKey,
        isComposing: event.nativeEvent.isComposing,
      })
    ) {
      const nextIndex = wrapIndex(
        composerSuggestionIndex,
        autocomplete.items.length,
      );
      const selected = autocomplete.items[nextIndex];
      if (selected !== undefined) {
        const left = draft.slice(0, start);
        const lineStart = left.lastIndexOf("\n") + 1;
        const prefixToken = autocomplete.mode === "slash" ? "/" : "@";
        const tokenStart = left.lastIndexOf(prefixToken);
        if (tokenStart >= lineStart) {
          event.preventDefault();
          const right = draft.slice(start);
          const consumed = right.match(/^[^\s]*/)?.[0] ?? "";
          const nextDraft =
            draft.slice(0, tokenStart) + selected.insertText + right.slice(consumed.length);
          setDraft(nextDraft);
          setHistoryBrowse(null);
          setComposerSuggestionIndex(0);
          return;
        }
      }
      // 没接受候选（token 位置对不上）就落到下面的提交分支：这里不能
      // preventDefault，否则 Enter 被吞掉、既没补全也没发送。
    }

    if (event.key === "ArrowUp" && !mod) {
      if (historyBrowse !== null) {
        event.preventDefault();
        if (historyBrowse.pointer > 0) {
          const nextPointer = historyBrowse.pointer - 1;
          setHistoryBrowse({
            pointer: nextPointer,
            restore: historyBrowse.restore,
          });
          setDraft(history[nextPointer] ?? "");
        }
        return;
      }
      if (
        history.length > 0 &&
        textareaAtFirstLineFirstColumn(start, end)
      ) {
        event.preventDefault();
        const lastIdx = history.length - 1;
        setHistoryBrowse({ pointer: lastIdx, restore: draft });
        setDraft(history[lastIdx] ?? "");
        return;
      }
    }

    if (event.key === "ArrowDown" && !mod && historyBrowse !== null) {
      event.preventDefault();
      if (historyBrowse.pointer < history.length - 1) {
        const nextPointer = historyBrowse.pointer + 1;
        setHistoryBrowse({
          pointer: nextPointer,
          restore: historyBrowse.restore,
        });
        setDraft(history[nextPointer] ?? "");
      } else {
        setHistoryBrowse(null);
        setDraft(historyBrowse.restore);
      }
      return;
    }

    if (
      shouldConfirmOnEnter({
        key: event.key,
        shiftKey: event.shiftKey,
        isComposing: event.nativeEvent.isComposing,
      })
    ) {
      event.preventDefault();
      if (state.promptInFlight) {
        postCancel();
      }
      submit();
    }
  };

  // 队首那条就是当前审批卡；后面的只排队、不上屏（稿 03 B③）。
  const permission = state.permissionQueue[0] ?? null;
  const approvalActive = permission !== null;

  // 裁决一条：选了 option 就回 daemon 给的那一项；Dismiss / Esc 是纯本地动作 ——
  // 什么都不发，卡片收起，到 daemon 自己的截止时间判拒（稿 03 B② 的口径）。
  const decidePermission = (
    requestId: string,
    optionId: string | undefined,
  ): void => {
    if (optionId !== undefined) {
      postPermissionResponse({ requestId, selectedOptionId: optionId });
    }
    dispatch({ type: "resolvePermission", requestId });
  };

  // composer 与审批卡共用底部那一格：审批期间 textarea 整块不渲染。光标位置平时就顺着
  // 用户动作抄一份（不等卸载时再读 —— 那时元素可能已经从树上摘了）。
  const composerCaretRef = useRef<{ start: number; end: number } | null>(null);
  useLayoutEffect(() => {
    const el = composerTextareaRef.current;
    if (el === null || approvalActive) {
      return;
    }
    const record = (): void => {
      if (document.activeElement === el) {
        composerCaretRef.current = {
          start: el.selectionStart,
          end: el.selectionEnd,
        };
      }
    };
    // 光标会动的路子就这几样：打字、点击定位、方向键、拖选。
    const events = ["keyup", "click", "input", "select"] as const;
    for (const name of events) {
      el.addEventListener(name, record);
    }
    return (): void => {
      for (const name of events) {
        el.removeEventListener(name, record);
      }
    };
  }, [approvalActive]);

  // 审批卡收掉、composer 重新挂回来：把抄下的光标位置交还给输入框。草稿本身存在这一层
  // 的 state 里，textarea 卸载再挂不丢，所以只补光标（和焦点）。只在被审批卡换下的那
  // 一次恢复（ref 平时是 null），不抢别的场景的焦点。
  useLayoutEffect(() => {
    if (approvalActive) {
      return;
    }
    const saved = composerCaretRef.current;
    if (saved === null) {
      return;
    }
    composerCaretRef.current = null;
    const el = composerTextareaRef.current;
    if (el === null) {
      return;
    }
    el.focus();
    el.setSelectionRange(saved.start, saved.end);
  }, [approvalActive]);

  const onShellDragEnterCapture = (event: DragEvent<HTMLDivElement>): void => {
    if (dropFilesDisabled || !dataTransferLooksLikePathDrop(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    setFileDragActive(true);
  };

  const onShellDragLeave = (event: DragEvent<HTMLDivElement>): void => {
    if (!dataTransferLooksLikePathDrop(event.dataTransfer)) {
      return;
    }
    const next = event.relatedTarget as Node | null;
    if (next !== null && event.currentTarget.contains(next)) {
      return;
    }
    setFileDragActive(false);
  };

  const onShellDragOver = (event: DragEvent<HTMLDivElement>): void => {
    if (dropFilesDisabled || !dataTransferLooksLikePathDrop(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const onShellDrop = (event: DragEvent<HTMLDivElement>): void => {
    setFileDragActive(false);
    if (dropFilesDisabled || !dataTransferLooksLikePathDrop(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const root =
      init.workspaceLabel !== undefined && init.workspaceLabel.length > 0
        ? init.workspaceLabel
        : undefined;
    const paths = collectPathsFromDataTransfer(event.dataTransfer, root);
    if (paths.length === 0) {
      return;
    }
    setDraft((d) => appendFileMentionsToDraft(d, paths, root));
    setHistoryBrowse(null);
    requestAnimationFrame(() => {
      composerTextareaRef.current?.focus();
    });
  };

  return (
    <Fragment>
      <div
        className="acp-ui-error"
        role="alert"
        hidden={state.errorText === null}
      >
        {state.errorText}
      </div>
      <div
        className={
          fileDragActive
            ? "acp-ui-shell acp-ui-shell--file-drag"
            : "acp-ui-shell"
        }
        style={
          {
            "--gw-content-width-ratio": contentWidthRatio,
          } as React.CSSProperties
        }
        onDragEnterCapture={onShellDragEnterCapture}
        onDragLeave={onShellDragLeave}
        onDragOver={onShellDragOver}
        onDrop={onShellDrop}
      >
        <TaskDetailHeader header={state.taskHeader} />
        <TraceFilters
          counts={countByKind(state.trace)}
          shown={shownKinds}
          live={followLive}
          onToggle={(kind) => {
            setShownKinds((prev) => {
              const next = new Set(prev);
              if (next.has(kind)) {
                next.delete(kind);
              } else {
                next.add(kind);
              }
              return next;
            });
          }}
          onShowAll={() => {
            setShownKinds(new Set(TRACE_FILTER_KINDS));
          }}
          onResumeLive={resumeLive}
        />
        <main
          ref={traceRef}
          className="agent-trace"
          role="log"
          aria-label="Conversation"
          onScroll={onTraceScroll}
        >
          <div ref={traceContentRef} className="acp-ui-content-column">
            {state.sessionHistoryLoading && state.trace.length === 0 ? (
              <SessionHistoryLoader />
            ) : null}
            <TraceList
              items={filterItems(state.trace, shownKinds)}
              completed={state.traceCompleted}
              showThoughts={showThinkingBlocks}
              expandAllToolOutputs={expandAllToolOutputs}
              toolCallVerbosity={toolCallVerbosity}
              onOpenWorkspacePath={postOpenWorkspacePath}
              onCollapseExpandAll={() => {
                setExpandAllToolOutputs(false);
              }}
            />
            {state.sessionHistoryLoading && state.trace.length > 0 ? (
              <SessionHistoryLoader inline />
            ) : null}
          </div>
          {!followLive && pendingEvents > 0 ? (
            <button
              type="button"
              className="trace-jump"
              data-testid="trace-jump"
              onClick={resumeLive}
            >
              {`↓ ${pendingEvents} 条新事件`}
            </button>
          ) : null}
        </main>
        <div className="acp-ui-composer-stack">
          <div className="acp-ui-content-column">
          {permission !== null ? (
            // 审批卡整块替换底部输入区：composer 连同 textarea 一起不渲（稿 03 B②）。
            <PermissionApprovalCard
              prompt={permission}
              queueLength={state.permissionQueue.length}
              total={state.permissionTotal}
              onOption={(optionId) => {
                decidePermission(permission.requestId, optionId);
              }}
              onDismiss={() => {
                decidePermission(permission.requestId, undefined);
              }}
            />
          ) : (
            <ChatComposer
              activityLabel={activityLabel}
              workspacePathHint={workspaceText}
              modelSelection={state.modelSelection}
              sessionConfigOptions={state.sessionConfigOptions}
              sessionConfigLoading={state.sessionConfigLoading}
              modelPickerLocked={state.composerPicksLocked}
              hideComposerModelControls={state.hideComposerModelControls}
              promptInFlight={state.promptInFlight}
              readOnly={state.composerReadOnly}
              slashCommands={mergedSlashCommands}
              workspaceFiles={init.workspaceFiles ?? []}
              suggestionIndex={composerSuggestionIndex}
              autocompleteDismissed={composerAutocompleteDismissed}
              draft={draft}
              onDraftChange={onDraftChange}
              onPickSessionModel={(modelId) => {
                dispatch({ type: "pickSessionModel", modelId });
                postSetSessionModel(modelId);
              }}
              onPickSessionConfigOption={(configId, value) => {
                dispatch({ type: "pickSessionConfigOption", configId, value });
                postSetSessionConfigOption(configId, value);
              }}
              onSubmit={submit}
              onCancel={postCancel}
              onKeyDown={onComposerKeyDown}
              composerInputRef={composerTextareaRef}
            />
          )}
          </div>
        </div>
      </div>
    </Fragment>
  );
}

/**
 * Whether the caret is at the start of the first line (for recalling prompt history with ArrowUp).
 */
function textareaAtFirstLineFirstColumn(
  selectionStart: number,
  selectionEnd: number,
): boolean {
  if (selectionStart !== selectionEnd) {
    return false;
  }
  return selectionStart === 0;
}

/**
 * Short status line for the composer while a prompt is in flight (tool kind, generating, or thinking).
 */
function composerActivityLabel(
  promptInFlight: boolean,
  trace: TraceItem[],
  openStreamIndex: number | null,
): string | null {
  if (!promptInFlight) {
    return null;
  }
  for (let i = trace.length - 1; i >= 0; i--) {
    const item = trace[i];
    if (
      item?.type === "tool" &&
      (item.status === "pending" || item.status === "in_progress")
    ) {
      const k = item.kind?.toLowerCase();
      if (k === "read") {
        return "Reading…";
      }
      if (k === "edit") {
        return "Writing…";
      }
      if (k === "search") {
        return "Searching…";
      }
      if (k === "execute") {
        return "Running…";
      }
      const title = item.title.trim();
      return title.length > 0 ? `${title}…` : "Using tools…";
    }
  }
  if (openStreamIndex !== null) {
    const open = trace[openStreamIndex];
    if (open?.type === "agent") {
      return "Generating…";
    }
  }
  return "Thinking…";
}
