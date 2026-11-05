// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ModelSettingsDialog,
  type ModelSettingsDialogProps,
} from "./ModelSettingsDialog";

/**
 * Model·Effort 弹框（图1 双栏样式）：左栏 provider 头 + Models + Effort 渐变
 * slider；右栏 Providers 列表（点击 = 预览切换）+ 沉底 Manage 行；平铺回退
 * （老 daemon 无 catalog）单栏。当前打勾、目录外当前 model 并入。
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
        { id: "zhipu", name: "zhipu", type: "openai", models: ["glm-4.7", "glm-4.6"] },
        { id: "deepseek", name: "deepseek", models: ["deepseek-v3"] },
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

describe("ModelSettingsDialog 双栏", () => {
  it("左栏渲染 provider 头 + Models，右栏渲染 Providers；当前打勾", () => {
    const el = renderDialog({ ...baseProps(), onManage: () => {} });
    expect(el.querySelector(".provider-head__name")?.textContent).toBe("zhipu");
    expect(rowTexts(el, ".composer-model-dialog__left .model-row")).toEqual([
      "glm-4.7✓",
      "glm-4.6",
    ]);
    const providers = [
      ...el.querySelectorAll<HTMLButtonElement>(".provider-row"),
    ].map((node) => ({
      name: node.querySelector(".provider-row__name")?.textContent ?? "",
      checked: node.querySelector(".provider-row__check") !== null,
    }));
    expect(providers).toEqual([
      { name: "zhipu", checked: true },
      { name: "deepseek", checked: false },
    ]);
    const current = el.querySelector<HTMLButtonElement>(".provider-row--current");
    expect(current?.getAttribute("aria-selected")).toBe("true");
    // 右栏沉底 Manage 行。
    expect(
      el.querySelector(".composer-model-dialog__manage")?.textContent,
    ).toContain("Manage Provider");
  });

  it("目录外的当前 model 并入当前 provider 显示（仅当前 provider）", () => {
    const props = baseProps();
    props.currentModel = "glm-air-x";
    const el = renderDialog(props);
    expect(rowTexts(el, ".composer-model-dialog__left .model-row")).toEqual([
      "glm-4.7",
      "glm-4.6",
      "glm-air-x✓",
    ]);
  });

  it("右栏点 provider = 预览切换（左栏跟着切、无当前勾），点叶子提交 (provider, model)", () => {
    const onModelLeafPick = vi.fn();
    const el = renderDialog({ ...baseProps(), onModelLeafPick });
    const deepseek = [
      ...el.querySelectorAll<HTMLButtonElement>(".provider-row"),
    ].find((node) => node.querySelector(".provider-row__name")?.textContent === "deepseek");
    act(() => {
      deepseek?.click();
    });
    expect(el.querySelector(".provider-head__name")?.textContent).toBe(
      "deepseek",
    );
    expect(rowTexts(el, ".composer-model-dialog__left .model-row")).toEqual([
      "deepseek-v3",
    ]);
    const leaf = el.querySelector<HTMLButtonElement>(
      ".composer-model-dialog__left .model-row",
    );
    act(() => {
      leaf?.click();
    });
    expect(onModelLeafPick).toHaveBeenCalledWith("deepseek", "deepseek-v3");
    // 预览态不改变右栏的当前勾。
    expect(
      [
        ...el.querySelectorAll<HTMLButtonElement>(".provider-row--current"),
      ].map((node) => node.querySelector(".provider-row__name")?.textContent ?? ""),
    ).toEqual(["zhipu"]);
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

  it("Manage 行点击上行 onManage", () => {
    const onManage = vi.fn();
    const el = renderDialog({ ...baseProps(), onManage });
    const button = el.querySelector<HTMLButtonElement>(
      ".composer-model-dialog__manage",
    );
    act(() => {
      button?.click();
    });
    expect(onManage).toHaveBeenCalledTimes(1);
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
  it("catalog 为 null 单栏 provider 行（头像 + 当前勾）+ effort slider", () => {
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
    const rows = [
      ...el.querySelectorAll<HTMLButtonElement>(".provider-row"),
    ].map((node) => ({
      name: node.querySelector(".provider-row__name")?.textContent ?? "",
      checked: node.querySelector(".provider-row__check") !== null,
    }));
    expect(rows).toEqual([
      { name: "zhipu (glm-4.7)", checked: true },
      { name: "deepseek (deepseek-v3)", checked: false },
    ]);
    const deepseek = rows.findIndex((row) => row.name.includes("deepseek"));
    act(() => {
      el.querySelectorAll<HTMLButtonElement>(".provider-row")[deepseek]?.click();
    });
    expect(onProviderPick).toHaveBeenCalledWith("deepseek");
    expect(
      el.querySelector('.composer-effort-slider input[type="range"]'),
    ).toBeDefined();
  });
});
