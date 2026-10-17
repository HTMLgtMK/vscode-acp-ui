import { afterEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("vscode", () => ({
    workspace: {
        fs: {},
    },
}));

vi.mock("./acpUiSessionJsonl", () => ({
    createSessionFile: vi.fn(),
    deleteSessionFile: vi.fn(),
    ensureSessionFileNameMatchesTitle: vi.fn(),
    listSessionHeaders: vi.fn(async () => []),
    migrateFlatSessionFilesToFolderLayout: vi.fn(async () => {}),
    setAcpUiSessionJsonlLogger: vi.fn(),
    updateSessionHeader: vi.fn(async () => null),
}));

const { getAcpUiSession, replaceAcpUiSessionsForTests, setAcpUiSessionTitleInMemory } =
    await import("./acpUiSessionsStore");

describe("setAcpUiSessionTitleInMemory", () => {
    afterEach(() => {
        replaceAcpUiSessionsForTests([]);
    });

    it("updates the in-memory title for deferred persistence while prompting", () => {
        replaceAcpUiSessionsForTests([
            {
                id: "session-1",
                title: "Chat 1",
                updatedAt: 10,
                uri: { fsPath: "/chats/session-1/Chat 1.acp" } as never,
            },
        ]);
        expect(setAcpUiSessionTitleInMemory("session-1", "Hello There")).toBe(true);
        expect(getAcpUiSession("session-1")?.title).toBe("Hello There");
    });
});
