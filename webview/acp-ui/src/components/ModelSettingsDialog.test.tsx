// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ModelSettingsDialog,
  type ModelSettingsDialogProps,
} from "./ModelSettingsDialog";

/**
 * Model·Effort 弹框（单栏设置项 + hover 浮出 provider 列表）：Provider head 行
 * 点击/hover → 右侧浮层；浮层条目点击 = 切 provider（onProviderPick，宿主配对
 * 当前 model 提交）；Models 叶子点击 = 提交 (provider, model)；Effort 渐变
 * slider；Manage 行；平铺回退（老 daemon 无 catalog）无 Models 区。
 */

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function baseProps(): ModelSettingsDialogProps {
  return {
    catalog: {
      currentProviderId: "zhipu",
      currentModel: "glm-4.7",
      currentEffort: "high",
      providers: [
        { id: "zhipu", name: "zhipu", type: "openai", model: "glm-4.7", models: ["glm-4.7", "glm-4.6"] },
        { id: "deepseek", name: "deepseek", model: "deepseek-v3", models: ["deepseek-v3"] },
      ],
    },
    currentProviderId: "zhipu",
    currentModel: "glm-4.7",
    flatChoices: [],
    effortValue: "high",
    effortChoices: ["low", "medium", "high", "max"],
    disabled: false,
    onClose: () => {},
    onModelLeafPick: () => {},
    onProviderPick: () => {},
    onEffortPick: () => {},
  };
}

function renderDialog(props: ModelSettingsDialogProps): HTMLDivElement {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root?.render(<ModelSettingsDialog {...props} />);
  });
  return host;
}

function rowTexts(el: HTMLElement, selector: string): string[] {
  return [...el.querySelectorAll<HTMLElement>(selector)].map(
    (node) => node.textContent ?? "",
  );
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  host?.remove();
  host = null;
});

describe("ModelSettingsDialog 单栏 + 浮出", () => {
  it("head 行显示当前 provider；Models 列表当前打勾；默认无浮层", () => {
    const el = renderDialog(baseProps());
    expect(el.querySelector(".provider-head__name")?.textContent).toBe("zhipu");
    expect(rowTexts(el, ".composer-model-dialog__scroll .model-row")).toEqual([
      "glm-4.7✓",
      "glm-4.6",
    ]);
    expect(el.querySelector(".provider-flyout")).toBeNull();
  });

  it("目录外的当前 model 并入当前 provider 显示", () => {
    const props = baseProps();
    props.currentModel = "glm-air-x";
    const el = renderDialog(props);
    expect(rowTexts(el, ".composer-model-dialog__scroll .model-row")).toEqual([
      "glm-4.7",
      "glm-4.6",
      "glm-air-x✓",
    ]);
  });

  it("点 head 行开浮层；浮层条目点击 = 切 provider 并收起浮层", () => {
    const onProviderPick = vi.fn();
    const el = renderDialog({ ...baseProps(), onProviderPick });
    const head = el.querySelector<HTMLButtonElement>(".provider-head");
    act(() => {
      head?.click();
    });
    const flyout = el.querySelector(".provider-flyout");
    expect(flyout).not.toBeNull();
    const rows = [
      ...(flyout?.querySelectorAll<HTMLButtonElement>(".provider-row") ?? []),
    ].map((node) => node.querySelector(".provider-row__name")?.textContent ?? "");
    expect(rows).toEqual(["zhipu", "deepseek"]);
    const deepseek = [
      ...(flyout?.querySelectorAll<HTMLButtonElement>(".provider-row") ?? []),
    ].find((node) => node.querySelector(".provider-row__name")?.textContent === "deepseek");
    act(() => {
      deepseek?.click();
    });
    expect(onProviderPick).toHaveBeenCalledWith("deepseek");
    expect(el.querySelector(".provider-flyout")).toBeNull();
  });

  it("Models 叶子点击提交 (provider, model)", () => {
    const onModelLeafPick = vi.fn();
    const el = renderDialog({ ...baseProps(), onModelLeafPick });
    const leaf = [
      ...el.querySelectorAll<HTMLButtonElement>(".model-row"),
    ].find((node) => node.textContent === "glm-4.6");
    act(() => {
      leaf?.click();
    });
    expect(onModelLeafPick).toHaveBeenCalledWith("zhipu", "glm-4.6");
  });

  it("effort 行显示当前值，slider 四档刻度且滑动上行档位", () => {
    const onEffortPick = vi.fn();
    const el = renderDialog({ ...baseProps(), onEffortPick });
    expect(el.querySelector(".composer-effort-head__value")?.textContent).toBe(
      "high",
    );
    const ticks = rowTexts(el, ".composer-effort-slider__tick");
    expect(ticks).toEqual(["low", "medium", "high", "max"]);
    const slider = el.querySelector<HTMLInputElement>(
      '.composer-effort-slider input[type="range"]',
    );
    expect(slider?.value).toBe("2");
    expect(slider?.style.getPropertyValue("--slider-fill")).toBe(
      `${(2 / 3) * 100}%`,
    );
    if (slider) {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      act(() => {
        setter?.call(slider, "3");
        slider.dispatchEvent(
          new Event("input", { bubbles: true }) as unknown as Event,
        );
      });
    }
    expect(onEffortPick).toHaveBeenCalledWith("max");
  });

  it("Manage 行按需渲染并上行", () => {
    const onManage = vi.fn();
    const el = renderDialog({ ...baseProps(), onManage });
    const button = el.querySelector<HTMLButtonElement>(
      ".composer-model-dialog__manage",
    );
    expect(button?.textContent).toContain("Manage Provider");
    act(() => {
      button?.click();
    });
    expect(onManage).toHaveBeenCalledTimes(1);
    act(() => {
      root?.unmount();
    });
    const withoutManage = renderDialog(baseProps());
    expect(
      withoutManage.querySelector(".composer-model-dialog__manage"),
    ).toBeNull();
  });

  it("Esc 与 backdrop 点击关闭；弹框自身 pointerdown 不关闭", () => {
    const onClose = vi.fn();
    const el = renderDialog({ ...baseProps(), onClose });
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => {
      el.querySelector(".composer-model-dialog-backdrop")?.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true }),
      );
    });
    expect(onClose).toHaveBeenCalledTimes(2);
    act(() => {
      el.querySelector(".composer-model-dialog")?.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true }),
      );
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("ModelSettingsDialog 平铺回退", () => {
  it("catalog 为 null：head 行退平铺当前项，浮层条目点击上行", () => {
    const onProviderPick = vi.fn();
    const props: ModelSettingsDialogProps = {
      ...baseProps(),
      catalog: null,
      currentModel: "",
      flatChoices: [
        { value: "zhipu", name: "zhipu (glm-4.7)" },
        { value: "deepseek", name: "deepseek (deepseek-v3)" },
      ],
      onProviderPick,
    };
    const el = renderDialog(props);
    // 平铺模式无 Models 区。
    expect(el.querySelector(".composer-model-tree")).toBeNull();
    expect(
      el.querySelector('.composer-effort-slider input[type="range"]'),
    ).not.toBeNull();
    const head = el.querySelector<HTMLButtonElement>(".provider-head");
    act(() => {
      head?.click();
    });
    const deepseek = [
      ...el.querySelectorAll<HTMLButtonElement>(".provider-flyout .provider-row"),
    ].find((node) => node.textContent?.includes("deepseek"));
    act(() => {
      deepseek?.click();
    });
    expect(onProviderPick).toHaveBeenCalledWith("deepseek");
  });
});
