// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ModelSettingsDialog,
  type ModelSettingsDialogProps,
} from "./ModelSettingsDialog";

/**
 * Model·Effort 弹框：树渲染（provider 分组 + model 叶子 + 当前打勾）、叶子选择
 * 上行、effort slider 四档、MANAGE 入口、平铺回退（老 daemon 无 catalog）、
 * Esc / backdrop 关闭。
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

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  host?.remove();
  host = null;
});

describe("ModelSettingsDialog", () => {
  it("按 provider 分组渲染模型树，当前 model 打勾", () => {
    const el = renderDialog(baseProps());
    const providers = [
      ...el.querySelectorAll<HTMLElement>(".composer-model-tree__provider"),
    ].map((node) => node.textContent);
    expect(providers).toEqual(["zhipu", "deepseek"]);
    const leaves = [
      ...el.querySelectorAll<HTMLButtonElement>(".composer-model-tree__leaf"),
    ].map((node) => node.textContent);
    expect(leaves).toEqual(["glm-4.7✓", "glm-4.6", "deepseek-v3"]);
    const current = el.querySelector<HTMLButtonElement>(
      ".composer-model-tree__leaf--current",
    );
    expect(current?.getAttribute("aria-selected")).toBe("true");
  });

  it("目录外的当前 model 并入当前 provider 显示（仅当前 provider）", () => {
    const props = baseProps();
    props.currentModel = "glm-air-x";
    const el = renderDialog(props);
    const leaves = [
      ...el.querySelectorAll<HTMLButtonElement>(".composer-model-tree__leaf"),
    ].map((node) => node.textContent);
    expect(leaves).toEqual(["glm-4.7", "glm-4.6", "glm-air-x✓", "deepseek-v3"]);
  });

  it("点叶子上行 provider + model", () => {
    const onModelLeafPick = vi.fn();
    const el = renderDialog({ ...baseProps(), onModelLeafPick });
    const leaf = [
      ...el.querySelectorAll<HTMLButtonElement>(".composer-model-tree__leaf"),
    ].find((node) => node.textContent === "glm-4.6");
    expect(leaf).toBeDefined();
    act(() => {
      leaf?.click();
    });
    expect(onModelLeafPick).toHaveBeenCalledWith("zhipu", "glm-4.6");
  });

  it("effort slider 四档刻度，滑动上行档位值", () => {
    const onEffortPick = vi.fn();
    const el = renderDialog({ ...baseProps(), onEffortPick });
    const ticks = [
      ...el.querySelectorAll<HTMLElement>(".composer-effort-slider__tick"),
    ].map((node) => node.textContent);
    expect(ticks).toEqual(["low", "medium", "high", "max"]);
    const slider = el.querySelector<HTMLInputElement>(
      '.composer-effort-slider input[type="range"]',
    );
    expect(slider).toBeDefined();
    expect(slider?.value).toBe("2"); // effortValue=high
    act(() => {
      slider?.dispatchEvent(
        new Event("input", { bubbles: true }) as unknown as Event,
      );
    });
    // 原生 input 事件不带 value 变化；直接走受控属性模拟 React onChange。
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

  it("MANAGE PROVIDER 按钮按需渲染并上行", () => {
    const onManage = vi.fn();
    const withManage = renderDialog({ ...baseProps(), onManage });
    const button = withManage.querySelector<HTMLButtonElement>(
      ".composer-model-dialog__manage",
    );
    expect(button?.textContent).toContain("MANAGE PROVIDER");
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

  it("catalog 为 null 退平铺 provider 行（老 daemon）", () => {
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
    const leaves = [
      ...el.querySelectorAll<HTMLButtonElement>(".composer-model-tree__leaf"),
    ].map((node) => node.textContent);
    expect(leaves).toEqual(["zhipu (glm-4.7)✓", "deepseek (deepseek-v3)"]);
    const deepseek = leaves.findIndex((text) => text?.includes("deepseek"));
    act(() => {
      el.querySelectorAll<HTMLButtonElement>(".composer-model-tree__leaf")[
        deepseek
      ]?.click();
    });
    expect(onProviderPick).toHaveBeenCalledWith("deepseek");
  });

  it("Esc 与 backdrop 点击关闭", () => {
    const onClose = vi.fn();
    const el = renderDialog({ ...baseProps(), onClose });
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    const backdrop = el.querySelector(".composer-model-dialog-backdrop");
    expect(backdrop).toBeDefined();
    act(() => {
      backdrop?.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true }),
      );
    });
    expect(onClose).toHaveBeenCalledTimes(2);
    // 弹框自身的 pointerdown 不冒泡成关闭。
    act(() => {
      el.querySelector(".composer-model-dialog")?.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true }),
      );
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
