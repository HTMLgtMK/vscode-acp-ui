import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const writeFile = vi.fn(async () => {});
const applyEdit = vi.fn(async () => true);
const save = vi.fn(async () => {});

type MockDoc = {
    uri: { toString(): string };
    getText(): string;
    positionAt(offset: number): { line: number; character: number };
    save(): Promise<void>;
};

let textDocuments: MockDoc[] = [];

vi.mock("vscode", () => ({
    Range: class Range {
        constructor(
            public start: unknown,
            public end: unknown,
        ) {}
    },
    WorkspaceEdit: class WorkspaceEdit {
        replace = vi.fn();
    },
    workspace: {
        get textDocuments() {
            return textDocuments;
        },
        applyEdit,
        fs: {
            writeFile,
        },
    },
}));

const { writeSessionFileUtf8 } = await import("./acpUiSessionJsonl");

describe("writeSessionFileUtf8", () => {
    beforeEach(() => {
        textDocuments = [];
        writeFile.mockClear();
        applyEdit.mockClear();
        save.mockClear();
    });

    it("writes through WorkspaceEdit when the session file is open", async () => {
        const uri = { toString: () => "/chats/id/Chat.acp" };
        const doc: MockDoc = {
            uri,
            getText: () => '{"title":"Chat"}',
            positionAt: (offset: number) => ({
                line: 0,
                character: offset,
            }),
            save,
        };
        textDocuments = [doc];
        await writeSessionFileUtf8(uri as never, '{"title":"Hello There"}');
        expect(applyEdit).toHaveBeenCalledTimes(1);
        expect(save).toHaveBeenCalledTimes(1);
        expect(writeFile).not.toHaveBeenCalled();
    });

    it("falls back to fs.writeFile when the document is not open", async () => {
        const uri = { toString: () => "/chats/id/Chat.acp" };
        await writeSessionFileUtf8(uri as never, '{"title":"Chat"}');
        expect(writeFile).toHaveBeenCalledTimes(1);
        expect(applyEdit).not.toHaveBeenCalled();
    });
});
