import { type CSSProperties, type ReactElement, useEffect, useState } from "react";
import type { AcpUiProviderCatalogEntry } from "../../../../src/protocol/extensionHostMessages";

/**
 * Model·Effort 弹框（图1 双栏样式，宿主 `providerCatalog` 快照为数据源）：
 *   - 左栏：当前/预览 provider 头（monogram 头像 + 名称 + type 徽标）→ Models
 *     列表（当前 model 打勾，目录外的当前 model 并入显示）→ Effort 行 + 渐变
 *     slider（绿→蓝，填充比例随档位）+ 四档刻度；
 *   - 右栏：Providers 列表（monogram 头像 + 名称 + type 徽标 + 当前✓），点击 =
 *     预览切换（左栏跟着切）；底部边框分隔的 Manage Provider 沉底行（打开管理页）。
 * 点 model 叶子 = 提交 (provider, model)；Esc / backdrop / × 关闭。
 */
export type ModelSettingsDialogProps = {
  /** 宿主快照；null = 老 daemon 无目录能力，退单栏平铺 provider 行。 */
  catalog: {
    currentProviderId: string;
    currentModel: string;
    providers: AcpUiProviderCatalogEntry[];
  } | null;
  /** 生效中的 provider（catalog 快照或平铺 option 的 currentValue）。 */
  currentProviderId: string;
  /** 生效中的 model（catalog 快照 / 本地树选择；平铺模式为空串）。 */
  currentModel: string;
  /** 平铺回退数据源（合成 model config option / sessionModels）。 */
  flatChoices: Array<{ value: string; name: string }>;
  effortValue: string;
  effortChoices: string[];
  disabled: boolean;
  onClose: () => void;
  /** 树叶子选中（provider + model）。 */
  onModelLeafPick: (provider: string, model: string) => void;
  /** 平铺回退的 provider 行选中。 */
  onProviderPick: (providerId: string) => void;
  onEffortPick: (value: string) => void;
  /** Manage Provider 行（缺省不渲染）。 */
  onManage?: () => void;
};

/** monogram 头像底色板（--vscode-charts-* 主题色，按名 hash 取）。 */
const AVATAR_COLORS = [
  "var(--vscode-charts-blue, #4daafc)",
  "var(--vscode-charts-green, #3fb950)",
  "var(--vscode-charts-orange, #d18616)",
  "var(--vscode-charts-purple, #b180d7)",
  "var(--vscode-charts-red, #f14c4c)",
  "var(--vscode-charts-yellow, #cca700)",
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? AVATAR_COLORS[0]!;
}

/** provider monogram 头像：首字母圆角方块（图1 的品牌图标位）。 */
function ProviderAvatar({ name }: { name: string }): ReactElement {
  const letter = (name.trim()[0] ?? "?").toUpperCase();
  return (
    <span
      className="provider-avatar"
      aria-hidden="true"
      style={{ backgroundColor: avatarColor(name) }}
    >
      {letter}
    </span>
  );
}

/** provider 的 type 徽标（openai / anthropic；缺省不渲染）。 */
function TypeBadge({ type }: { type: string | undefined }): ReactElement | null {
  if (type === undefined || type.length === 0) {
    return null;
  }
  return <span className="provider-badge">{type}</span>;
}

/** 当前 provider 的展示目录：配置目录 + 目录外的当前 model 并入（仅当前
 * provider —— 其他 provider 的目录与本次选择无关）。 */
function providerModelsWithCurrent(
  provider: AcpUiProviderCatalogEntry,
  currentProviderId: string,
  currentModel: string,
): string[] {
  if (
    provider.id !== currentProviderId ||
    currentModel.length === 0 ||
    provider.models.includes(currentModel)
  ) {
    return provider.models;
  }
  return [...provider.models, currentModel];
}

export function ModelSettingsDialog({
  catalog,
  currentProviderId,
  currentModel,
  flatChoices,
  effortValue,
  effortChoices,
  disabled,
  onClose,
  onModelLeafPick,
  onProviderPick,
  onEffortPick,
  onManage,
}: ModelSettingsDialogProps): ReactElement {
  const [previewProvider, setPreviewProvider] = useState<string | null>(null);
  useEffect(() => {
    const close = (event: globalThis.KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", close, true);
    return () => document.removeEventListener("keydown", close, true);
  }, [onClose]);

  const hasCatalog = catalog !== null && catalog.providers.length > 0;
  const effortIndex = Math.max(0, effortChoices.indexOf(effortValue));
  const fillPercent =
    effortChoices.length > 1
      ? (effortIndex / (effortChoices.length - 1)) * 100
      : 100;

  if (!hasCatalog) {
    // 平铺回退（老 daemon）：单栏 provider 行 + effort slider。
    return (
      <div
        className="composer-model-dialog-backdrop"
        onPointerDown={() => onClose()}
      >
        <section
          className="composer-model-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="Model settings"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <header className="composer-model-dialog__header">
            <span>Model settings</span>
            <button
              type="button"
              className="composer-model-dialog__close"
              aria-label="Close"
              onClick={onClose}
            >
              ×
            </button>
          </header>
          <div className="composer-model-dialog__body">
            <div className="composer-model-dialog__label">Providers</div>
            <div className="composer-model-tree" role="listbox" aria-label="Providers">
              {flatChoices.map((choice) => {
                const isCurrent = choice.value === currentProviderId;
                return (
                  <button
                    key={choice.value}
                    type="button"
                    role="option"
                    aria-selected={isCurrent}
                    disabled={disabled}
                    className={
                      isCurrent
                        ? "provider-row provider-row--current"
                        : "provider-row"
                    }
                    onClick={() => onProviderPick(choice.value)}
                  >
                    <ProviderAvatar name={choice.name} />
                    <span className="provider-row__name">{choice.name}</span>
                    {isCurrent ? (
                      <span className="provider-row__check" aria-hidden="true">
                        ✓
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <div className="composer-model-dialog__label">Effort</div>
            <EffortSlider
              effortValue={effortValue}
              effortChoices={effortChoices}
              effortIndex={effortIndex}
              fillPercent={fillPercent}
              disabled={disabled}
              onEffortPick={onEffortPick}
            />
            {onManage !== undefined ? <ManageRow onManage={onManage} /> : null}
          </div>
        </section>
      </div>
    );
  }

  const previewed =
    catalog.providers.find((provider) => provider.id === previewProvider) ??
    catalog.providers.find((provider) => provider.id === currentProviderId) ??
    catalog.providers[0]!;
  const previewedIsCurrent = previewed.id === currentProviderId;
  const models = previewedIsCurrent
    ? providerModelsWithCurrent(previewed, currentProviderId, currentModel)
    : previewed.models;

  return (
    <div
      className="composer-model-dialog-backdrop"
      onPointerDown={() => onClose()}
    >
      <section
        className="composer-model-dialog composer-model-dialog--twopane"
        role="dialog"
        aria-modal="true"
        aria-label="Model settings"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="composer-model-dialog__header">
          <span>Model settings</span>
          <button
            type="button"
            className="composer-model-dialog__close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="composer-model-dialog__body composer-model-dialog__body--twopane">
          <div className="composer-model-dialog__left">
            <div className="provider-head">
              <ProviderAvatar name={previewed.name} />
              <span className="provider-head__name">{previewed.name}</span>
              <TypeBadge type={previewed.type} />
            </div>
            <div className="composer-model-dialog__label">Models</div>
            <div className="composer-model-tree" role="listbox" aria-label="Models">
              {models.map((model) => {
                const isCurrent = previewedIsCurrent && model === currentModel;
                return (
                  <button
                    key={model}
                    type="button"
                    role="option"
                    aria-selected={isCurrent}
                    disabled={disabled}
                    className={
                      isCurrent
                        ? "model-row model-row--current"
                        : "model-row"
                    }
                    onClick={() => onModelLeafPick(previewed.id, model)}
                  >
                    <span className="model-row__name">{model}</span>
                    {isCurrent ? (
                      <span className="provider-row__check" aria-hidden="true">
                        ✓
                      </span>
                    ) : null}
                  </button>
                );
              })}
              {models.length === 0 ? (
                <div className="composer-model-tree__empty">（无模型）</div>
              ) : null}
            </div>
            <div className="composer-effort-head">
              <span className="composer-model-dialog__label">Effort</span>
              <span className="composer-effort-head__value">{effortValue}</span>
            </div>
            <EffortSlider
              effortValue={effortValue}
              effortChoices={effortChoices}
              effortIndex={effortIndex}
              fillPercent={fillPercent}
              disabled={disabled}
              onEffortPick={onEffortPick}
            />
          </div>
          <div className="composer-model-dialog__right">
            <div className="composer-model-dialog__label composer-model-dialog__label--pane">
              Providers
            </div>
            <div
              className="composer-model-dialog__providers"
              role="listbox"
              aria-label="Providers"
            >
              {catalog.providers.map((provider) => {
                const isCurrent = provider.id === currentProviderId;
                return (
                  <button
                    key={provider.id}
                    type="button"
                    role="option"
                    aria-selected={isCurrent}
                    disabled={disabled}
                    className={
                      isCurrent
                        ? "provider-row provider-row--current"
                        : "provider-row"
                    }
                    onClick={() => setPreviewProvider(provider.id)}
                  >
                    <ProviderAvatar name={provider.name} />
                    <span className="provider-row__name">{provider.name}</span>
                    <TypeBadge type={provider.type} />
                    {isCurrent ? (
                      <span className="provider-row__check" aria-hidden="true">
                        ✓
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            {onManage !== undefined ? <ManageRow onManage={onManage} /> : null}
          </div>
        </div>
      </section>
    </div>
  );
}

/** Effort 渐变 slider：填充段绿→蓝（--gw-state-done → --gw-state-running），
 * 填充比例 inline `--slider-fill`；下方四档刻度行。 */
function EffortSlider({
  effortValue,
  effortChoices,
  effortIndex,
  fillPercent,
  disabled,
  onEffortPick,
}: {
  effortValue: string;
  effortChoices: string[];
  effortIndex: number;
  fillPercent: number;
  disabled: boolean;
  onEffortPick: (value: string) => void;
}): ReactElement {
  return (
    <div className="composer-effort-slider">
      <input
        type="range"
        min={0}
        max={Math.max(0, effortChoices.length - 1)}
        step={1}
        value={effortIndex}
        disabled={disabled}
        aria-label="Effort"
        aria-valuetext={effortChoices[effortIndex] ?? effortValue}
        style={{ "--slider-fill": `${fillPercent}%` } as CSSProperties}
        onChange={(event) => {
          const index = Number(event.target.value);
          const choice = effortChoices[index];
          if (choice !== undefined) {
            onEffortPick(choice);
          }
        }}
      />
      <div
        className="composer-effort-slider__ticks"
        role="presentation"
        aria-hidden="true"
      >
        {effortChoices.map((choice, index) => (
          <span
            key={choice}
            className={
              index === effortIndex
                ? "composer-effort-slider__tick composer-effort-slider__tick--current"
                : "composer-effort-slider__tick"
            }
          >
            {choice}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Manage Provider 沉底行（图1 的 "Manage models" 分区）。 */
function ManageRow({ onManage }: { onManage: () => void }): ReactElement {
  return (
    <div className="composer-model-dialog__manage-section">
      <button
        type="button"
        className="composer-model-dialog__manage"
        onClick={onManage}
      >
        Manage Provider
      </button>
    </div>
  );
}
