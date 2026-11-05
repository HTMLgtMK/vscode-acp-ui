// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ProviderManagerPage,
  type ProviderManagerPageProps,
} from "./ProviderManagerPage";
import type { AcpUiProviderDetail } from "../../../../src/protocol/extensionHostMessages";

/**
 * Provider 管理页（图2）：列表选择 → detail 灌表单；Save/Delete 上行字段
 * （apiKey 仅在输入时携带、anthropic 新建补 maxTokens 缺省）；默认 provider
 * 禁删；manage 结果应答内联展示。
 */

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

const CATALOG = {
  currentProviderId: "zhipu",
  currentModel: "glm-4.7",
  currentEffort: "high",
  providers: [
    { id: "zhipu", name: "zhipu", type: "openai", models: ["glm-4.7", "glm-4.6"] },
    { id: "deepseek", name: "deepseek", models: ["deepseek-v3"] },
  ],
};

const ZHIPU_DETAIL: AcpUiProviderDetail = {
  id: "zhipu",
  name: "zhipu",
  type: "openai",
  endpoint: "https://api.example.com/v1",
  apiKeySet: true,
  models: ["glm-4.7", "glm-4.6"],
  contextWindow: 256000,
  isDefault: true,
};

function baseProps(): ProviderManagerPageProps {
  return {
    catalog: CATALOG,
    detail: null,
    detailError: null,
    onDetailRequest: vi.fn(),
    onUpsert: vi.fn(),
    onRemove: vi.fn(),
    onManageResult: vi.fn(),
    onClose: vi.fn(),
  };
}

function renderPage(
  props: ProviderManagerPageProps = baseProps(),
): HTMLDivElement {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root?.render(<ProviderManagerPage {...props} />);
  });
  return host;
}

function inputIn(el: HTMLElement, index: number): HTMLInputElement {
  const nodes = el.querySelectorAll<HTMLInputElement>(
    ".provider-manager__form input",
  );
  const node = nodes[index];
  if (node === undefined) {
    throw new Error(`form input #${index} 不存在`);
  }
  return node;
}

function setNativeValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  host?.remove();
  host = null;
});

describe("ProviderManagerPage", () => {
  it("渲染 provider 列表；默认选中 currentProviderId 并请求 detail", () => {
    const onDetailRequest = vi.fn();
    renderPage({ ...baseProps(), onDetailRequest });
    const rows = [
      ...document.querySelectorAll<HTMLElement>(".provider-manager__row-name"),
    ].map((node) => node.textContent);
    expect(rows).toEqual(["zhipu", "deepseek"]);
    expect(onDetailRequest).toHaveBeenCalledWith("zhipu");
  });

  it("detail 到达灌表单；apiKey 只给占位提示不回填", () => {
    const props = baseProps();
    renderPage(props);
    act(() => {
      root?.render(
        <ProviderManagerPage {...props} detail={ZHIPU_DETAIL} />,
      );
    });
    const name = inputIn(document.body, 0);
    const endpoint = inputIn(document.body, 1);
    expect(name.value).toBe("zhipu");
    expect(name.disabled).toBe(true); // 编辑态 Name 只读
    expect(endpoint.value).toBe("https://api.example.com/v1");
    const key = document.querySelector<HTMLInputElement>(
      '.provider-manager__key-row input',
    );
    expect(key?.placeholder).toContain("留空保持不变");
    expect(key?.value).toBe("");
    const modelInputs = [
      ...document.querySelectorAll<HTMLInputElement>(
        ".provider-manager__model-row input",
      ),
    ].map((node) => node.value);
    expect(modelInputs).toEqual(["glm-4.7", "glm-4.6"]);
  });

  it("Save 上行 merge 字段：未输入 apiKey 不携带；模型列表去空行", () => {
    const onUpsert = vi.fn();
    const props = { ...baseProps(), onUpsert, detail: ZHIPU_DETAIL };
    renderPage(props);
    const save = [
      ...document.querySelectorAll<HTMLButtonElement>(
        ".provider-manager__actions button",
      ),
    ].find((node) => node.textContent === "Save");
    act(() => {
      save?.click();
    });
    expect(onUpsert).toHaveBeenCalledTimes(1);
    const payload = onUpsert.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.id).toBe("zhipu");
    expect(payload.name).toBe("zhipu");
    expect(payload.endpoint).toBe("https://api.example.com/v1");
    expect(payload.models).toEqual(["glm-4.7", "glm-4.6"]);
    expect("apiKey" in payload).toBe(false);
    expect("maxTokens" in payload).toBe(false); // openai 不带
  });

  it("Add provider 新建流程：上行不带 id；anthropic 补 maxTokens 缺省", () => {
    const onUpsert = vi.fn();
    const props = { ...baseProps(), onUpsert };
    renderPage(props);
    const add = document.querySelector<HTMLButtonElement>(
      ".provider-manager__add",
    );
    act(() => {
      add?.click();
    });
    const name = inputIn(document.body, 0);
    expect(name.disabled).toBe(false);
    setNativeValue(name, "claude");
    const endpoint = inputIn(document.body, 1);
    setNativeValue(endpoint, "https://api.anthropic.com");
    const key = document.querySelector<HTMLInputElement>(
      ".provider-manager__key-row input",
    );
    setNativeValue(key!, "sk-1");
    // 创建表单初始是空态（图2），先 Add model 出现输入行。
    const addModel = document.querySelector<HTMLButtonElement>(
      ".provider-manager__add-model",
    );
    act(() => {
      addModel?.click();
    });
    const modelInput = document.querySelector<HTMLInputElement>(
      ".provider-manager__model-row input",
    );
    setNativeValue(modelInput!, "claude-4");
    // 切 API format 为 anthropic。
    const select = document.querySelector<HTMLSelectElement>(
      ".provider-manager__form select",
    );
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype,
        "value",
      )?.set;
      setter?.call(select!, "anthropic");
      select?.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const save = [
      ...document.querySelectorAll<HTMLButtonElement>(
        ".provider-manager__actions button",
      ),
    ].find((node) => node.textContent === "Save");
    act(() => {
      save?.click();
    });
    expect(onUpsert).toHaveBeenCalledTimes(1);
    const payload = onUpsert.mock.calls[0]![0] as Record<string, unknown>;
    expect("id" in payload).toBe(false);
    expect(payload.name).toBe("claude");
    expect(payload.providerType).toBe("anthropic");
    expect(payload.apiKey).toBe("sk-1");
    expect(payload.maxTokens).toBe(8192);
  });

  it("必填缺失时内联报错，不上行", () => {
    const onUpsert = vi.fn();
    const props = { ...baseProps(), onUpsert, detail: ZHIPU_DETAIL };
    renderPage(props);
    const endpoint = inputIn(document.body, 1);
    setNativeValue(endpoint, "");
    const save = [
      ...document.querySelectorAll<HTMLButtonElement>(
        ".provider-manager__actions button",
      ),
    ].find((node) => node.textContent === "Save");
    act(() => {
      save?.click();
    });
    expect(onUpsert).not.toHaveBeenCalled();
    expect(document.querySelector(".provider-manager__error")?.textContent).toContain(
      "必填",
    );
  });

  it("默认 provider 禁删；manage 失败结果内联展示", () => {
    const onRemove = vi.fn();
    const props = { ...baseProps(), onRemove, detail: ZHIPU_DETAIL };
    renderPage(props);
    const remove = document.querySelector<HTMLButtonElement>(
      ".provider-manager__delete",
    );
    expect(remove?.disabled).toBe(true); // isDefault
    // 模拟失败应答。
    const registrar = props.onManageResult as ReturnType<typeof vi.fn>;
    expect(registrar).toHaveBeenCalled();
    const handler = registrar.mock.calls.at(-1)![0] as (r: {
      ok: boolean;
      message: string;
    }) => void;
    act(() => {
      handler({ ok: false, message: "provider 已存在" });
    });
    expect(document.querySelector(".provider-manager__error")?.textContent).toContain(
      "已存在",
    );
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("Esc 关闭；Back 按钮关闭", () => {
    const onClose = vi.fn();
    renderPage({ ...baseProps(), onClose });
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => {
      document
        .querySelector<HTMLButtonElement>(".provider-manager__back")
        ?.click();
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
