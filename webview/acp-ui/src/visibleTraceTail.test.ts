import { describe, expect, it } from "vite-plus/test";
import type { TraceItem } from "./chatReducer";
import { visibleTraceTail } from "./visibleTraceTail";

const items: TraceItem[] = [
  { type: "user", text: "older" },
  { type: "agent", text: "older reply" },
  { type: "user", text: "hi" },
  { type: "thought", text: "greeting" },
  { type: "agent", text: "Hi – what do you want to work on?" },
];

describe("visibleTraceTail", () => {
  it("keeps rows from the bottom until they cover the viewport", () => {
    const tail = visibleTraceTail(
      items,
      [
        { start: 0, end: 0, height: 40 },
        { start: 1, end: 1, height: 80 },
        { start: 2, end: 2, height: 30 },
        { start: 3, end: 3, height: 50 },
        { start: 4, end: 4, height: 40 },
      ],
      100,
    );
    expect(tail.map((item) => item.type === "user" || item.type === "agent" || item.type === "thought" ? item.text : "")).toEqual([
      "hi",
      "greeting",
      "Hi – what do you want to work on?",
    ]);
  });

  it("returns the tail when there are no measured rows", () => {
    const many = Array.from({ length: 45 }, (_, index): TraceItem => ({
      type: "user",
      text: `m-${index}`,
    }));
    const tail = visibleTraceTail(many, [], 0);
    expect(tail).toHaveLength(40);
    expect(tail[0]).toEqual({ type: "user", text: "m-5" });
  });
});
