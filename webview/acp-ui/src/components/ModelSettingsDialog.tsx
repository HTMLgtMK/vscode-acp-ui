import { type ReactElement, useEffect } from "react";
import type { AcpUiProviderCatalogEntry } from "../../../../src/protocol/extensionHostMessages";

/**
 * Model·Effort 弹框（宿主 `providerCatalog` 快照为数据源）：
 *   - Provider Model 树：provider 分组 + model 叶子，单选打勾（当前 model 不在
 *     目录里时并入当前 provider 显示——`/model set model=` 可以落在目录之外）；
 *   - Effort slider：low / medium / high / max 四档，`<input type="range">`；
 *   - MANAGE PROVIDER：打开 daemon provider 配置文件（宿主 `openProviderConfig`）。
 * 选择即生效（跟旧 popover 一致），Esc / backdrop / × 关闭。
 */
export type ModelSettingsDialogProps = {
  /** 宿主快照；null = 老 daemon 无目录能力，退平铺 provider 行。 */
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
  onManage?: () => void;
};

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
          <div className="composer-model-dialog__label">Provider / Model</div>
          {hasCatalog ? (
            <div
              className="composer-model-tree"
              role="listbox"
              aria-label="Provider models"
            >
              {catalog.providers.map((provider) => {
                const models = providerModelsWithCurrent(
                  provider,
                  currentProviderId,
                  currentModel,
                );
                return (
                  <div
                    key={provider.id}
                    className="composer-model-tree__group"
                  >
                    <div
                      className="composer-model-tree__provider"
                      role="presentation"
                      aria-hidden="true"
                    >
                      {provider.name}
                    </div>
                    {models.map((model) => {
                      const isCurrent =
                        provider.id === currentProviderId &&
                        model === currentModel;
                      return (
                        <button
                          key={model}
                          type="button"
                          role="option"
                          aria-selected={isCurrent}
                          disabled={disabled}
                          className={
                            isCurrent
                              ? "composer-model-tree__leaf composer-model-tree__leaf--current"
                              : "composer-model-tree__leaf"
                          }
                          onClick={() => onModelLeafPick(provider.id, model)}
                        >
                          <span className="composer-model-tree__model">
                            {model}
                          </span>
                          {isCurrent ? (
                            <span
                              className="composer-model-tree__check"
                              aria-hidden="true"
                            >
                              ✓
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ) : (
            <div
              className="composer-model-tree"
              role="listbox"
              aria-label="Providers"
            >
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
                        ? "composer-model-tree__leaf composer-model-tree__leaf--current"
                        : "composer-model-tree__leaf"
                    }
                    onClick={() => onProviderPick(choice.value)}
                  >
                    <span className="composer-model-tree__model">
                      {choice.name}
                    </span>
                    {isCurrent ? (
                      <span
                        className="composer-model-tree__check"
                        aria-hidden="true"
                      >
                        ✓
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
          <div className="composer-model-dialog__label">Effort</div>
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
        </div>
        {onManage !== undefined ? (
          <footer className="composer-model-dialog__footer">
            <button
              type="button"
              className="composer-model-dialog__manage"
              onClick={onManage}
            >
              MANAGE PROVIDER
            </button>
          </footer>
        ) : null}
      </section>
    </div>
  );
}
