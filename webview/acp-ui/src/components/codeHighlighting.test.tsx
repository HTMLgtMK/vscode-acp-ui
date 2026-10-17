import { describe, expect, it } from "vite-plus/test";
import { highlightCodeToNodes, languageFromClassName } from "./codeHighlighting";

describe("languageFromClassName", () => {
  it("extracts fenced code language", () => {
    expect(languageFromClassName("language-typescript")).toBe("typescript");
    expect(languageFromClassName(undefined)).toBeUndefined();
  });
});

describe("highlightCodeToNodes", () => {
  it("highlights json, markdown, and typescript deterministically", () => {
    expect(highlightCodeToNodes("json", '{"a":1}').length).toBeGreaterThan(1);
    expect(highlightCodeToNodes("markdown", "# title").length).toBeGreaterThan(1);
    expect(highlightCodeToNodes("typescript", "const value = 2;").length).toBeGreaterThan(1);
  });

  it("falls back to plain text for unknown language", () => {
    expect(highlightCodeToNodes("ruby", "puts :ok")).toEqual(["puts :ok"]);
  });
});
