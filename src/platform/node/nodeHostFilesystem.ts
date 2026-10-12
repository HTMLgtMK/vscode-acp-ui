import { readFile, writeFile } from "node:fs/promises";
import type { AcpHostFilesystem } from "../../acp/ports/hostFilesystem";

/** Node `fs` implementation of {@link AcpHostFilesystem} for playground dev servers. */
export function createNodeAcpHostFilesystem(): AcpHostFilesystem {
    return {
        async readTextFile(path: string): Promise<string> {
            return readFile(path, "utf-8");
        },
        async writeTextFile(path: string, content: string): Promise<void> {
            await writeFile(path, content, "utf-8");
        },
    };
}
