import {
  Fragment,
  type KeyboardEvent,
  type ReactElement,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "./ChatComposer.css";
import {
  buildModelPickerState,
  formatModelDisplayName,
  parseModelIdBracketParams,
} from "../../../../src/acp/session/modelVariantPicker";
import type { AcpUiSessionModelSelection } from "../../../../src/acp/session/sessionModels";
import {
  groupedModelChoices,
  modeConfigOption,
  modelConfigOption,
  modelParameterOptions,
  pickModelOptionForFamily,
  resolveDerivedModelParamPick,
  resolveModelSelectOption,
  isDerivedConfigId,
  usesAgentOrderedConfigLayout,
  configOptionsSummaryLabel,
} from "../../../../src/acp/session/sessionConfigOptions";
import type { AcpUiSessionConfigOption } from "../../../../src/acp/session/sessionConfigOptions";
import { isSessionModeConfigOption, resolveComposerPlaceholder } from "../../../../src/acp/session/sessionModeIndicator";
import type {
  AcpUiProviderCatalog,
  AcpUiSlashCommand,
} from "../../../../src/protocol/extensionHostMessages";
import { buildComposerAutocompleteState, wrapIndex } from "./composerAutocomplete";
import { ConfigOptionControls, ComposerConfigLoading } from "./ConfigOptionControls";
import { ModelSettingsDialog } from "./ModelSettingsDialog";
import { SessionModeIndicator } from "./SessionModeIndicator";

/** 只读面板写进输入区的那句话：光置灰不说明原因，用户只会以为界面坏了。 */
const READ_ONLY_PLACEHOLDER = "当前面板为只读观察；reply / resume 尚未开放";

export type ChatComposerProps = {
  activityLabel: string | null;
  /** Shown in the activity slot when nothing is in flight (e.g. workspace cwd). */
  workspacePathHint: string;
  modelSelection: AcpUiSessionModelSelection | null;
  sessionConfigOptions: AcpUiSessionConfigOption[] | null;
  sessionConfigLoading: boolean;
  /** Provider 模型目录快照（Model·Effort 弹框树数据源；null = 平铺回退）。 */
  providerCatalog: AcpUiProviderCatalog | null;
  /** When true, model is shown as a label (standalone: after the first message). */
  modelPickerLocked: boolean;
  /** Hides model/config dropdowns in the composer footer. */
  hideComposerModelControls: boolean;
  promptInFlight: boolean;
  /** 只读观察（任务详情）：输入区功能级禁用，并写明 reply / resume 尚未开放。 */
  readOnly: boolean;
  slashCommands: AcpUiSlashCommand[];
  workspaceFiles: string[];
  suggestionIndex: number;
  /** When true, hide autocomplete until the draft changes. */
  autocompleteDismissed: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onPickSessionModel: (modelId: string) => void;
  /** 弹框树叶子选中（provider + model）。缺省 = 宿主未接（弹框叶子不可选）。 */
  onPickModelSelection?: (provider: string, model: string) => void;
  /** 弹框 MANAGE Provider 行：打开 provider 管理页。缺省 = 不渲染该行。 */
  onOpenProviderManager?: () => void;
  onPickSessionConfigOption: (
    configId: string,
    value: string | boolean,
  ) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  /** Focus target after external inserts (e.g. file drop). */
  composerInputRef?: RefObject<HTMLTextAreaElement | null>;
};

/**
 * Activity hint, optional model picker, message input, and send/cancel actions.
 */
type SelectOption = Extract<AcpUiSessionConfigOption, { type: "select" }>;

function capsuleModelLabel(label: string): string {
  const first = label.split("(", 1)[0]?.trim() ?? "";
  if (first.length === 0) return "Model";
  return first.charAt(0).toUpperCase() + first.slice(1);
}

type ModelEffortCapsuleProps = {
  /** 胶囊摘要里的模型名（catalog 有 currentModel 用之，否则平铺派生）。 */
  modelLabel: string;
  /** Provider 模型目录快照；null = 平铺回退（老 daemon）。 */
  providerCatalog: AcpUiProviderCatalog | null;
  /** 平铺回退数据源（合成 model config option / sessionModels）。 */
  flatChoices: Array<{ value: string; name: string }>;
  /** 平铺回退的生效 provider（option currentValue / sessionModels 当前值）。 */
  flatCurrentProvider: string;
  effortValue: string;
  effortChoices: string[];
  disabled: boolean;
  onModelLeafPick: (provider: string, model: string) => void;
  onProviderPick: (providerId: string) => void;
  onEffortPick: (value: string) => void;
  onManage?: () => void;
};

/** Compact ZCode-style model capsule: label + effort in one trigger, provider/model
 * tree and effort slider only in the dialog. The trigger is a single-option <select> so
 * the indicator is the platform's own select arrow (the same one the workspace pill
 * gets), with the platform's built-in inset from the capsule's right edge. Its native
 * picker is suppressed on mousedown and the dialog opens instead. */
function ModelEffortCapsule({
  modelLabel,
  providerCatalog,
  flatChoices,
  flatCurrentProvider,
  effortValue,
  effortChoices,
  disabled,
  onModelLeafPick,
  onProviderPick,
  onEffortPick,
  onManage,
}: ModelEffortCapsuleProps): ReactElement {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [open]);
  const modelValue =
    providerCatalog?.currentProviderId ?? flatCurrentProvider ?? "";
  // 弹框的生效 provider：catalog 快照（含本地树选择就地更新），平铺回退取 option 当前值。
  const dialogCurrentProvider = providerCatalog?.currentProviderId ?? flatCurrentProvider;
  const triggerLabel = `${modelLabel} · ${effortValue}`;
  return (
    <div className="composer-model-capsule" ref={rootRef}>
      <select
        className="composer-model-capsule__trigger"
        aria-label={`Model ${triggerLabel}`}
        aria-expanded={open}
        disabled={disabled}
        onMouseDown={(event) => {
          // 原生 picker 在 mousedown 打开：拦掉它，换成弹窗；箭头仍由平台绘制。
          event.preventDefault();
          setOpen((value) => !value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
            return;
          }
          if (
            event.key === "Enter" ||
            event.key === " " ||
            event.key === "ArrowDown" ||
            event.key === "ArrowUp"
          ) {
            event.preventDefault();
            setOpen((value) => !value);
          }
        }}
        onChange={() => setOpen(false)}
      >
        <option value={modelValue}>{triggerLabel}</option>
      </select>
      {open ? (
        <ModelSettingsDialog
          catalog={providerCatalog}
          currentProviderId={dialogCurrentProvider}
          currentModel={providerCatalog?.currentModel ?? ""}
          flatChoices={flatChoices}
          effortValue={effortValue}
          effortChoices={effortChoices}
          disabled={disabled}
          onClose={() => setOpen(false)}
          onModelLeafPick={onModelLeafPick}
          onProviderPick={onProviderPick}
          onEffortPick={onEffortPick}
          onManage={onManage}
        />
      ) : null}
    </div>
  );
}

function WorkspacePill({
  option,
  disabled,
  onPick,
}: {
  option: SelectOption | undefined;
  disabled: boolean;
  onPick: (value: string) => void;
}): ReactElement | null {
  if (option === undefined) return null;
  return (
    <select
      className="composer-workspace-pill"
      aria-label="Workspace"
      value={option.currentValue}
      disabled={disabled}
      onChange={(event) => onPick(event.target.value)}
    >
      {option.options.map((choice) => (
        <option key={choice.value} value={choice.value}>{choice.name}</option>
      ))}
    </select>
  );
}

export function ChatComposer({
  activityLabel,
  workspacePathHint,
  modelSelection,
  providerCatalog,
  sessionConfigOptions,
  sessionConfigLoading,
  modelPickerLocked,
  hideComposerModelControls,
  promptInFlight,
  readOnly,
  slashCommands,
  workspaceFiles,
  suggestionIndex,
  autocompleteDismissed,
  draft,
  onDraftChange,
  onPickSessionModel,
  onPickModelSelection,
  onOpenProviderManager,
  onPickSessionConfigOption,
  onSubmit,
  onCancel,
  onKeyDown,
  composerInputRef,
}: ChatComposerProps): ReactElement {
  const autocomplete = useMemo(() => {
    if (readOnly) {
      return null;
    }
    const caret = draft.length;
    return buildComposerAutocompleteState({
      draft,
      caret,
      slashCommands,
      workspaceFiles,
    });
  }, [draft, slashCommands, workspaceFiles, readOnly]);
  const activeIndex =
    autocomplete !== null
      ? wrapIndex(suggestionIndex, autocomplete.items.length)
      : 0;
  const activeItemRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, autocomplete?.items.length]);
  const configState = useMemo(
    () =>
      sessionConfigOptions !== null
        ? { options: sessionConfigOptions }
        : null,
    [sessionConfigOptions],
  );
  const modeOption = useMemo(
    () => modeConfigOption(configState),
    [configState],
  );
  const composerPlaceholder = useMemo(
    () => resolveComposerPlaceholder(modeOption?.currentValue ?? ""),
    [modeOption],
  );
  const toolbarConfigOptions = useMemo(
    () =>
      sessionConfigOptions !== null
        ? sessionConfigOptions.filter(
            (option) => !isSessionModeConfigOption(option),
          )
        : null,
    [sessionConfigOptions],
  );
  const agentOrderedLayout = usesAgentOrderedConfigLayout(configState);
  const configModelOption = useMemo(
    () => modelConfigOption(configState),
    [configState],
  );
  const configModelGroups = useMemo(
    () =>
      configModelOption !== undefined
        ? groupedModelChoices(configModelOption)
        : [],
    [configModelOption],
  );
  const configParamOptions = useMemo(
    () => modelParameterOptions(configState, modelSelection),
    [configState, modelSelection],
  );
  const resolvedModelOption = useMemo(
    () => resolveModelSelectOption(configState, modelSelection),
    [configState, modelSelection],
  );
  const useLegacyModelPath = configModelOption === undefined;
  const useConfigModelPicker =
    configModelOption !== undefined && !agentOrderedLayout;
  // 旧通路（无 config options，纯 sessionModels）：与 agent 胶囊布局**同位**渲染——
  // model 数据源回退 modelSel（capsuleModelChoices/handleCapsuleModelPick 已兜底）。
  // 带括号参数的 config 模型面（需要分组 select）不走这里，保持 stacked。
  const legacyCapsuleLayout = !agentOrderedLayout && !useConfigModelPicker;
  const modelSel = modelSelection;
  const showConfigLoading = !modelPickerLocked && sessionConfigLoading;
  const modelReady =
    agentOrderedLayout ||
    useConfigModelPicker ||
    (modelSel !== null && modelSel.availableModels.length > 0);
  const modelSelectDisabled =
    modelPickerLocked || readOnly || !modelReady;
  const modelPickerState = useMemo(() => {
    if (useConfigModelPicker || !modelReady || modelSel === null) {
      return null;
    }
    return buildModelPickerState(
      modelSel.availableModels,
      modelSel.currentModelId,
    );
  }, [useConfigModelPicker, modelReady, modelSel]);
  const configCurrentGroupName = useMemo(() => {
    if (configModelOption === undefined) {
      return "";
    }
    const currentChoice = configModelOption.options.find(
      (choice) => choice.value === configModelOption.currentValue,
    );
    if (currentChoice !== undefined) {
      return currentChoice.name;
    }
    return parseModelIdBracketParams(configModelOption.currentValue).base;
  }, [configModelOption]);
  const modelLabel = agentOrderedLayout
    ? configOptionsSummaryLabel(sessionConfigOptions ?? [])
    : useConfigModelPicker
      ? formatModelDisplayName(
          configCurrentGroupName,
          configModelOption?.currentValue ?? "",
        )
      : (modelPickerState?.currentGroupLabel ?? "");

  const toolbarWorkspaceOption =
    toolbarConfigOptions?.find((option) => option.configId === "workspace") as
      | SelectOption
      | undefined;
  const toolbarModelOption =
    toolbarConfigOptions?.find((option) => option.category === "model" || option.configId === "model") as
      | SelectOption
      | undefined;
  const toolbarOtherOptions = toolbarConfigOptions?.filter(
    (option) =>
      option !== toolbarWorkspaceOption &&
      option !== toolbarModelOption &&
      option.category !== "effort" &&
      option.configId !== "effort",
  ) ?? [];
  const effortOption = sessionConfigOptions?.find(
    (option) => option.category === "effort" || option.configId === "effort",
  ) as SelectOption | undefined;
  const [effortValue, setEffortValue] = useState(() => {
    if (effortOption?.currentValue !== undefined) {
      return effortOption.currentValue;
    }
    // daemon 快照里的当前 effort（旧 daemon / anthropic 为空串 → medium 档位）。
    const seeded = providerCatalog?.currentEffort ?? "";
    return seeded.length > 0 ? seeded : "medium";
  });
  useEffect(() => {
    if (effortOption?.currentValue !== undefined) {
      setEffortValue(effortOption.currentValue);
      return;
    }
    const seeded = providerCatalog?.currentEffort ?? "";
    if (seeded.length > 0) {
      setEffortValue(seeded);
    }
  }, [effortOption?.currentValue, providerCatalog?.currentEffort]);
  const capsuleModelChoices = toolbarModelOption !== undefined
    ? toolbarModelOption.options.map((choice) => ({ value: choice.value, name: choice.name }))
    : modelSel?.availableModels.map((model) => ({ value: model.modelId, name: model.name })) ?? [];
  // effort 四档（low/medium/high/max）；daemon 显式下发 effort 选项时以它为准。
  const effortChoices = effortOption?.options.map((choice) => choice.value) ?? ["low", "medium", "high", "max"];

  const handleCapsuleModelPick = (value: string): void => {
    if (toolbarModelOption !== undefined) {
      onPickSessionConfigOption(toolbarModelOption.configId, value);
    } else {
      onPickSessionModel(value);
    }
  };

  const handleCapsuleEffortPick = (value: string): void => {
    setEffortValue(value);
    onPickSessionConfigOption(effortOption?.configId ?? "effort", value);
  };

  // 弹框树叶子选中：provider + model 一起上行（draft 宿主落 setDraftModel(provider)
  // + setDraftModelName(model)，发送时 /model use + /model set model= 应用）。
  const handleModelLeafPick = (provider: string, model: string): void => {
    if (onPickModelSelection !== undefined) {
      onPickModelSelection(provider, model);
      return;
    }
    // 宿主未接新上行（旧宿主/standalone）：退回 provider 级选择。
    handleCapsuleModelPick(provider);
  };

  // 弹框 hover 浮层里切 provider：一键提交——配对该 provider 当前的 model
  //（daemon catalog 的 entry.model，缺目录时取 models 头）；无 model 可提交的
  // provider（老数据）退回 provider 级选择。
  const handleProviderPick = (providerId: string): void => {
    const entry = providerCatalog?.providers.find((item) => item.id === providerId);
    const model = entry?.model ?? entry?.models[0];
    if (onPickModelSelection !== undefined && model !== undefined && model.length > 0) {
      onPickModelSelection(providerId, model);
      return;
    }
    handleCapsuleModelPick(providerId);
  };

  const handleWorkspacePick = (value: string): void => {
    onPickSessionConfigOption("workspace", value);
  };

  // 胶囊显示只取模型名（不含 workspace/effort 的 summary）＋effort，详情进弹窗。
  // catalog 有 currentModel（daemon 快照 / 本地树选择落过 reducer）时直接用模型 id，
  // 不走 provider 名的括号截断与大写化。
  const catalogModelName = providerCatalog?.currentModel ?? "";
  const capsuleModelName = toolbarModelOption !== undefined
    ? toolbarModelOption.options.find(
        (choice) => choice.value === toolbarModelOption.currentValue,
      )?.name ?? toolbarModelOption.currentValue
    : modelLabel.replace(/^Model\s*:\s*/i, "");
  const capsuleLabel =
    catalogModelName.length > 0
      ? catalogModelName
      : capsuleModelLabel(capsuleModelName);

  const handleModelParamPick = (
    configId: string,
    value: string | boolean,
  ): void => {
    if (
      resolvedModelOption !== undefined &&
      isDerivedConfigId(configId)
    ) {
      const nextModelId = resolveDerivedModelParamPick(
        resolvedModelOption,
        configId,
        value,
      );
      if (nextModelId === null) {
        return;
      }
      if (useLegacyModelPath) {
        onPickSessionModel(nextModelId);
        return;
      }
      onPickSessionConfigOption(
        resolvedModelOption.configId,
        nextModelId,
      );
      return;
    }
    onPickSessionConfigOption(configId, value);
  };

  const inflight =
    activityLabel !== null && activityLabel.length > 0;
  const activityDisplay = inflight ? activityLabel : workspacePathHint;
  return (
    <footer className="composer-frame">
      <div className="composer-top-bar">
        <div
          className={
            inflight
              ? "composer-activity composer-activity--inflight"
              : "composer-activity"
          }
          role="status"
          aria-live="polite"
          title={inflight ? undefined : workspacePathHint}
        >
          {activityDisplay}
        </div>
        {readOnly ? (
          <span className="composer-readonly-hint">read-only</span>
        ) : (
          <span className="composer-top-bar-hint">/ commands · @ files</span>
        )}
      </div>
      <div className="composer-input-wrap">
        {autocomplete !== null && !autocompleteDismissed ? (
          <div
            className="composer-slash-menu"
            role="listbox"
            aria-label={
              autocomplete.mode === "slash" ? "Slash commands" : "Workspace files"
            }
          >
            {(() => {
              let itemIndex = 0;
              return autocomplete.groups.map((group) => (
                <Fragment key={group.label ?? "built-in"}>
                  {group.label !== undefined ? (
                    <div
                      className="composer-slash-group"
                      role="presentation"
                      aria-hidden="true"
                    >
                      {group.label}
                    </div>
                  ) : null}
                  {group.items.map((item) => {
                    const index = itemIndex;
                    itemIndex += 1;
                    return (
                      <button
                        key={item.key}
                        ref={index === activeIndex ? activeItemRef : undefined}
                        type="button"
                        role="option"
                        aria-selected={index === activeIndex}
                        className={
                          index === activeIndex
                            ? "composer-slash-item composer-slash-item--active"
                            : "composer-slash-item"
                        }
                        onClick={() => {
                          onDraftChange(
                            draft.replace(
                              /(?:^|\s)(?:\/[^\s]*|@[^\s]*)$/,
                              (match) =>
                                `${match.startsWith(" ") ? " " : ""}${item.insertText.trimEnd()}`,
                            ),
                          );
                        }}
                      >
                        <span className="composer-slash-name">{item.primary}</span>
                        {item.secondary !== undefined &&
                        item.secondary.length > 0 ? (
                          <span className="composer-slash-desc">
                            {item.secondary}
                          </span>
                        ) : null}
                        {item.source !== undefined && item.source.length > 0 ? (
                          <span className="composer-slash-source">
                            {item.source}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </Fragment>
              ));
            })()}
          </div>
        ) : null}
        <textarea
          ref={composerInputRef}
          className={
            readOnly ? "composer-input composer-input--readonly" : "composer-input"
          }
          placeholder={readOnly ? READ_ONLY_PLACEHOLDER : composerPlaceholder}
          aria-label={readOnly ? "Read-only trace" : "Agent input"}
          title={
            readOnly
              ? READ_ONLY_PLACEHOLDER
              : "Enter to send. Shift+Enter for newline. Shift+Tab to cycle mode. Arrow up and down for prompt history."
          }
          rows={2}
          value={draft}
          disabled={readOnly}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={onKeyDown}
        />
      </div>
      <div className="composer-footer">
        {hideComposerModelControls ? null : (
        <div
          className={
            agentOrderedLayout || legacyCapsuleLayout
              ? "composer-footer-model composer-footer-config"
              : "composer-footer-model composer-footer-model--stacked"
          }
        >
          {modelPickerLocked ? (
            <span
              className="composer-pick-value"
              title={modelLabel}
              aria-label={
                agentOrderedLayout
                  ? `Session config: ${modelLabel}`
                  : `Model: ${modelLabel}`
              }
            >
              {modelLabel.length > 0 ? modelLabel : "\u2014"}
            </span>
          ) : showConfigLoading ? (
            <ComposerConfigLoading layout={agentOrderedLayout || legacyCapsuleLayout ? "inline" : "stacked"} />
          ) : agentOrderedLayout && toolbarConfigOptions !== null ? (
            <div className="composer-agent-toolbar">
              <WorkspacePill
                option={toolbarWorkspaceOption}
                disabled={modelSelectDisabled}
                onPick={handleWorkspacePick}
              />
              <ModelEffortCapsule
                modelLabel={capsuleLabel}
                providerCatalog={providerCatalog}
                flatChoices={capsuleModelChoices}
                flatCurrentProvider={
                  toolbarModelOption?.currentValue ?? modelSel?.currentModelId ?? ""
                }
                effortValue={effortValue}
                effortChoices={effortChoices}
                disabled={modelSelectDisabled}
                onModelLeafPick={handleModelLeafPick}
                onProviderPick={handleProviderPick}
                onEffortPick={handleCapsuleEffortPick}
                onManage={onOpenProviderManager}
              />
              {toolbarOtherOptions.length > 0 ? (
                <ConfigOptionControls
                  options={toolbarOtherOptions}
                  disabled={modelSelectDisabled}
                  layout="inline"
                  onPick={onPickSessionConfigOption}
                />
              ) : null}
            </div>
          ) : useConfigModelPicker && configModelOption !== undefined ? (
            <div className="composer-config-field">
              <label
                className="composer-config-label"
                htmlFor="acp-ui-model-select"
              >
                Model
              </label>
              <select
                id="acp-ui-model-select"
                className="composer-config-select composer-config-select--model"
                aria-label="Model"
                value={configCurrentGroupName}
                disabled={modelSelectDisabled}
                onChange={(e) => {
                  const preferredParams = parseModelIdBracketParams(
                    configModelOption.currentValue,
                  ).params;
                  const nextModelId = pickModelOptionForFamily(
                    configModelOption,
                    e.target.value,
                    preferredParams,
                  );
                  onPickSessionConfigOption(
                    configModelOption.configId,
                    nextModelId,
                  );
                }}
              >
                {configModelGroups.map((group) => (
                  <option key={group.name} value={group.name}>
                    {group.label}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="composer-agent-toolbar">
              <ModelEffortCapsule
                modelLabel={capsuleLabel}
                providerCatalog={providerCatalog}
                flatChoices={capsuleModelChoices}
                flatCurrentProvider={modelSel?.currentModelId ?? ""}
                effortValue={effortValue}
                effortChoices={effortChoices}
                disabled={modelSelectDisabled}
                onModelLeafPick={handleModelLeafPick}
                onProviderPick={handleProviderPick}
                onEffortPick={handleCapsuleEffortPick}
                onManage={onOpenProviderManager}
              />
            </div>
          )}
          {configParamOptions.length > 0 ? (
            <ConfigOptionControls
              options={configParamOptions}
              disabled={modelSelectDisabled}
              onPick={handleModelParamPick}
            />
          ) : null}
        </div>
        )}
        <div className="composer-mode-slot">
          <SessionModeIndicator modeOption={modeOption} />
        </div>
        {/* 运行中 send 即 stop：独立的 Cancel 按钮已并入（草稿/空闲态不再占位）。 */}
        <button
          type="button"
          className={
            promptInFlight
              ? "composer-send composer-send--stop"
              : "composer-send"
          }
          disabled={readOnly}
          aria-label={promptInFlight ? "Stop" : "Send"}
          title={promptInFlight ? "Stop the running turn" : "Send"}
          onClick={() => (promptInFlight ? onCancel() : onSubmit())}
        >
          {promptInFlight ? "Stop" : "Send"}
        </button>
      </div>
    </footer>
  );
}
