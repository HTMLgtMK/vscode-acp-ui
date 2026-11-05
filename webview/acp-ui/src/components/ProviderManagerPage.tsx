import { type ReactElement, useEffect, useState } from "react";
import type {
  AcpUiProviderCatalog,
  AcpUiProviderDetail,
} from "../../../../src/protocol/extensionHostMessages";
import "./ProviderManagerPage.css";

/**
 * Provider 管理页（图2 布局，宿主 provider CRUD RPC 的前端）：
 *   - header：标题 + 描述 + 刷新 + "＋ Add provider" + "打开 config.yaml"；
 *   - 左栏：provider 列表（monogram 头像 + 名称），点击 → `providerDetailRequest`；
 *   - 右栏：表单（Name / API format / Base URL / API key / Model list），
 *     Save = `providerUpsert`（新建或 merge 更新，apiKey 留空 = 保留原值），
 *     Delete = `providerRemove`（默认 provider 禁用——daemon 拒绝删默认）。
 * 编辑 daemon 运行配置：保存即时生效（SaveConfig），catalog 由宿主回推刷新。
 */
export type ProviderManagerPageProps = {
  catalog: AcpUiProviderCatalog | null;
  /** `providerDetailRequest` 的应答（null = 未加载/失败，配 detailError）。 */
  detail: AcpUiProviderDetail | null;
  detailError: string | null;
  onDetailRequest?: (id: string) => void;
  onUpsert?: (req: {
    id?: string;
    name: string;
    providerType: string;
    endpoint: string;
    apiKey?: string;
    models: string[];
    maxTokens?: number;
    authType?: string;
  }) => void;
  onRemove?: (id: string) => void;
  onOpenConfig?: () => void;
  /** 注册/注销 manage 操作应答的消费者（AcpUiApp 拦截下行后路由到这里）。 */
  onManageResult: (
    handler:
      | ((result: { ok: boolean; message: string; removedId?: string }) => void)
      | null,
  ) => void;
  onClose: () => void;
};

type ProviderForm = {
  name: string;
  type: string;
  endpoint: string;
  apiKey: string;
  models: string[];
};

const EMPTY_FORM: ProviderForm = {
  name: "",
  type: "openai",
  endpoint: "",
  apiKey: "",
  models: [""],
};

/** anthropic 新建时 daemon 要求 max_tokens>0，表单不展示该字段就用这个缺省。 */
const ANTHROPIC_DEFAULT_MAX_TOKENS = 8192;

function formFromDetail(detail: AcpUiProviderDetail): ProviderForm {
  return {
    name: detail.name,
    type: detail.type.length > 0 ? detail.type : "openai",
    endpoint: detail.endpoint,
    apiKey: "",
    // 空目录 → 空态（图2 的 "No models" 提示）；创建态 EMPTY_FORM 给一行空输入。
    models: detail.models.length > 0 ? [...detail.models] : [],
  };
}

export function ProviderManagerPage({
  catalog,
  detail,
  detailError,
  onDetailRequest,
  onUpsert,
  onRemove,
  onOpenConfig,
  onManageResult,
  onClose,
}: ProviderManagerPageProps): ReactElement {
  // selectedId = 左栏选中（编辑态）；creating = Add provider 的新建空白表单。
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<ProviderForm>(EMPTY_FORM);
  const [showKey, setShowKey] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // manage 操作应答：成功清错误（创建态退出、选择交给 catalog/detail 刷新），
  // 失败内联展示。每次渲染重注册保证闭包新鲜。
  useEffect(() => {
    onManageResult((result) => {
      if (result.ok) {
        setActionError(null);
        if (result.removedId !== undefined) {
          setCreating(false);
          setSelectedId(null);
          setForm(EMPTY_FORM);
        } else {
          setCreating(false);
        }
      } else {
        setActionError(result.message);
      }
    });
    return () => onManageResult(null);
  });

  // 首次/无选择：落当前 provider（catalog 刷新后 effect 会再校准）。
  useEffect(() => {
    if (creating || selectedId !== null) {
      return;
    }
    const initial = catalog?.currentProviderId ?? catalog?.providers[0]?.id;
    if (initial !== undefined && initial.length > 0) {
      setSelectedId(initial);
    }
  }, [creating, selectedId, catalog]);

  // 选中变化 → 请求全量配置。
  useEffect(() => {
    if (creating || selectedId === null || onDetailRequest === undefined) {
      return;
    }
    onDetailRequest(selectedId);
  }, [creating, selectedId, onDetailRequest]);

  // detail 到达 → 灌表单（apiKey 不回传，只留占位提示）。
  useEffect(() => {
    if (creating || detail === null) {
      return;
    }
    setForm(formFromDetail(detail));
  }, [creating, detail]);

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

  const selectProvider = (id: string): void => {
    setCreating(false);
    setActionError(null);
    setSelectedId(id);
  };

  const startCreate = (): void => {
    setCreating(true);
    setSelectedId(null);
    setActionError(null);
    setForm(EMPTY_FORM);
    setShowKey(false);
  };

  const save = (): void => {
    if (onUpsert === undefined) {
      return;
    }
    const name = form.name.trim();
    const endpoint = form.endpoint.trim();
    const models = form.models.map((m) => m.trim()).filter((m) => m.length > 0);
    if (name.length === 0 || endpoint.length === 0 || models.length === 0) {
      setActionError("Name、Base URL 与至少一个 Model 为必填项");
      return;
    }
    onUpsert({
      ...(creating ? {} : { id: selectedId ?? undefined }),
      name,
      providerType: form.type,
      endpoint,
      ...(form.apiKey.length > 0 ? { apiKey: form.apiKey } : {}),
      models,
      ...(form.type === "anthropic" && creating
        ? { maxTokens: ANTHROPIC_DEFAULT_MAX_TOKENS }
        : {}),
    });
  };

  const remove = (): void => {
    if (onRemove === undefined || selectedId === null || creating) {
      return;
    }
    onRemove(selectedId);
  };

  const isDefault = !creating && detail !== null && detail.id === selectedId && detail.isDefault;
  const editingApiKeySet = !creating && detail !== null && detail.id === selectedId && detail.apiKeySet;

  return (
    <div className="provider-manager" role="dialog" aria-label="Model settings">
      <header className="provider-manager__header">
        <div className="provider-manager__title-row">
          <button
            type="button"
            className="provider-manager__back"
            aria-label="Back to chat"
            onClick={onClose}
          >
            ←
          </button>
          <h1 className="provider-manager__title">Model settings</h1>
          <div className="provider-manager__header-actions">
            <button
              type="button"
              className="provider-manager__refresh"
              aria-label="Refresh"
              title="刷新当前 provider 配置"
              onClick={() => {
                if (!creating && selectedId !== null) {
                  onDetailRequest?.(selectedId);
                }
              }}
            >
              ⟳
            </button>
            <button
              type="button"
              className="provider-manager__add"
              onClick={startCreate}
            >
              ＋ Add provider
            </button>
          </div>
        </div>
        <p className="provider-manager__desc">
          管理模型 provider。保存即时生效（写入 daemon 配置），可在聊天里直接选用。
          {onOpenConfig !== undefined ? (
            <>
              {" "}
              <button
                type="button"
                className="provider-manager__config-link"
                onClick={onOpenConfig}
              >
                在编辑器中打开 config.yaml
              </button>
            </>
          ) : null}
        </p>
      </header>
      <div className="provider-manager__layout">
        <aside className="provider-manager__sidebar">
          <div className="provider-manager__side-label">Providers</div>
          <div className="provider-manager__list">
            {(catalog?.providers ?? []).map((provider) => {
              const active = !creating && provider.id === selectedId;
              return (
                <button
                  key={provider.id}
                  type="button"
                  className={
                    active
                      ? "provider-manager__row provider-manager__row--active"
                      : "provider-manager__row"
                  }
                  onClick={() => selectProvider(provider.id)}
                >
                  <ProviderMonogram name={provider.name} />
                  <span className="provider-manager__row-name">
                    {provider.name}
                  </span>
                </button>
              );
            })}
            {creating ? (
              <div className="provider-manager__row provider-manager__row--active">
                <ProviderMonogram name={form.name || "New provider"} />
                <span className="provider-manager__row-name">
                  {form.name.trim().length > 0 ? form.name : "New provider"}
                </span>
              </div>
            ) : null}
          </div>
        </aside>
        <section className="provider-manager__form">
          {creating || selectedId !== null ? (
            <>
              <div className="provider-manager__form-head">
                <span className="provider-manager__form-title">
                  {creating ? "New provider" : (detail?.name ?? selectedId)}
                </span>
              </div>
              <label className="provider-manager__field">
                Name
                <input
                  type="text"
                  value={form.name}
                  disabled={!creating}
                  placeholder="例如 zhipu"
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                />
              </label>
              <label className="provider-manager__field">
                API format
                <select
                  value={form.type}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, type: event.target.value }))
                  }
                >
                  <option value="openai">
                    OpenAI-compatible (/v1/chat/completions)
                  </option>
                  <option value="anthropic">
                    Anthropic messages (/v1/messages)
                  </option>
                </select>
              </label>
              <label className="provider-manager__field">
                Base URL
                <input
                  type="text"
                  value={form.endpoint}
                  placeholder="https://api.example.com/v1"
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      endpoint: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="provider-manager__field">
                API key
                <span className="provider-manager__key-row">
                  <input
                    type={showKey ? "text" : "password"}
                    value={form.apiKey}
                    placeholder={
                      editingApiKeySet
                        ? "已设置——留空保持不变"
                        : "Enter API key"
                    }
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        apiKey: event.target.value,
                      }))
                    }
                  />
                  <button
                    type="button"
                    className="provider-manager__eye"
                    aria-label={showKey ? "Hide API key" : "Show API key"}
                    onClick={() => setShowKey((value) => !value)}
                  >
                    {showKey ? "🙈" : "👁"}
                  </button>
                </span>
              </label>
              <div className="provider-manager__field">
                <span className="provider-manager__models-head">
                  <span>Model list</span>
                  <button
                    type="button"
                    className="provider-manager__add-model"
                    onClick={() =>
                      setForm((prev) => ({ ...prev, models: [...prev.models, ""] }))
                    }
                  >
                    ＋ Add model
                  </button>
                </span>
                {/* 按行数而不是行内容切换空态：全空行的创建流程也要有输入行可打。 */}
                {form.models.length > 0 ? (
                  form.models.map((model, index) => (
                    <span
                      key={index}
                      className="provider-manager__model-row"
                    >
                      <input
                        type="text"
                        value={model}
                        placeholder="model id"
                        onChange={(event) =>
                          setForm((prev) => {
                            const models = [...prev.models];
                            models[index] = event.target.value;
                            return { ...prev, models };
                          })
                        }
                      />
                      <button
                        type="button"
                        className="provider-manager__model-remove"
                        aria-label={`Remove model ${model || index + 1}`}
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            models: prev.models.filter((_, i) => i !== index),
                          }))
                        }
                      >
                        ×
                      </button>
                    </span>
                  ))
                ) : (
                  <span className="provider-manager__models-empty">
                    ⓘ 尚未配置模型。添加一个模型才能在聊天中使用。
                  </span>
                )}
              </div>
              {detailError !== null && !creating ? (
                <p className="provider-manager__error" role="alert">
                  {detailError}
                </p>
              ) : null}
              {actionError !== null ? (
                <p className="provider-manager__error" role="alert">
                  {actionError}
                </p>
              ) : null}
              <div className="provider-manager__actions">
                <button
                  type="button"
                  className="provider-manager__save"
                  onClick={save}
                >
                  Save
                </button>
                {!creating ? (
                  <button
                    type="button"
                    className="provider-manager__delete"
                    disabled={isDefault}
                    title={
                      isDefault
                        ? "默认 provider 不可删除——先在聊天里切换到其他 provider"
                        : undefined
                    }
                    onClick={remove}
                  >
                    Delete
                  </button>
                ) : (
                  <button
                    type="button"
                    className="provider-manager__delete"
                    onClick={() => {
                      setCreating(false);
                      setForm(EMPTY_FORM);
                      setActionError(null);
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="provider-manager__placeholder">
              选择左侧 provider，或点击「Add provider」新建。
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/** provider monogram 头像（与弹框同款；这里无弹框的 hash 色板导入，独立小实现）。 */
function ProviderMonogram({ name }: { name: string }): ReactElement {
  const letter = (name.trim()[0] ?? "?").toUpperCase();
  return (
    <span className="provider-avatar" aria-hidden="true">
      {letter}
    </span>
  );
}
