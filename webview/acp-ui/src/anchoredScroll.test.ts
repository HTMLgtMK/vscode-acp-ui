import { describe, expect, it } from "vite-plus/test";
import { anchoredScrollTop } from "./anchoredScroll";

describe("anchoredScrollTop", () => {
  it("stays at the bottom when the view is pinned", () => {
    expect(
      anchoredScrollTop({
        stickToBottom: true,
        previousScrollHeight: 400,
        previousScrollTop: 100,
        nextScrollHeight: 900,
      }),
    ).toBe(900);
  });

  it("adds the prepended height when the user has scrolled up", () => {
    expect(
      anchoredScrollTop({
        stickToBottom: false,
        previousScrollHeight: 400,
        previousScrollTop: 40,
        nextScrollHeight: 900,
      }),
    ).toBe(540);
  });
});
