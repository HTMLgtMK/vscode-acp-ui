import { describe, expect, it } from "vite-plus/test";
import {
  appendFileMentionsToDraft,
  collectPathsFromDataTransfer,
  dataTransferLooksLikePathDrop,
  pathForPrompt,
} from "./droppedFilePaths";

describe("dataTransferLooksLikePathDrop", () => {
  it("is true for VS Code Explorer text/uri-list drags", () => {
    const dt = {
      types: ["text/uri-list"],
    } as unknown as DataTransfer;
    expect(dataTransferLooksLikePathDrop(dt)).toBe(true);
  });

  it("is true for OS file manager Files drags", () => {
    const dt = {
      types: ["Files"],
    } as unknown as DataTransfer;
    expect(dataTransferLooksLikePathDrop(dt)).toBe(true);
  });
});

describe("collectPathsFromDataTransfer", () => {
  it("reads file URLs from text/uri-list (Explorer)", () => {
    const dt = {
      types: ["text/uri-list"],
      files: [],
      getData: (mime: string): string =>
        mime === "text/uri-list" ? "file:///project/src/a.ts\n" : "",
    } as unknown as DataTransfer;
    expect(collectPathsFromDataTransfer(dt, "/project")).toEqual(["/project/src/a.ts"]);
  });
});

describe("pathForPrompt", () => {
  it("returns relative path under workspace", () => {
    expect(pathForPrompt("/proj/src/a.ts", "/proj")).toBe("src/a.ts");
  });

  it("keeps absolute path outside workspace", () => {
    expect(pathForPrompt("/other/x.ts", "/proj")).toBe("/other/x.ts");
  });
});

describe("appendFileMentionsToDraft", () => {
  it("joins with space and uses @ prefix", () => {
    expect(appendFileMentionsToDraft("", ["/proj/a.ts"], "/proj")).toBe("@a.ts");
  });

  it("quotes paths with spaces", () => {
    expect(appendFileMentionsToDraft("", ["/p/a b.ts"], undefined)).toBe('@"/p/a b.ts"');
  });
});
