/**
 * Whether we should treat this drag as droppable file paths and call `preventDefault`
 * on dragover (so VS Code does not open the resource in an editor instead).
 *
 * VS Code Explorer → webview: often exposes `text/uri-list` but **not** `Files`.
 * OS file manager → webview: typically includes `Files` (and Electron `File.path`).
 */
export function dataTransferLooksLikePathDrop(dt: DataTransfer): boolean {
  for (const raw of Array.from(dt.types)) {
    const t = raw.toLowerCase();
    if (t === "files") {
      return true;
    }
    if (t === "text/uri-list") {
      return true;
    }
    if (t === "text/x-moz-url") {
      return true;
    }
  }
  return false;
}

/**
 * Collects local filesystem paths from a browser/Electron file drop.
 * VS Code webviews run on Electron: `File` often exposes a non-standard `path`.
 * Explorer drops: `files` is usually empty; use `getData("text/uri-list")` on `drop`.
 */
export function collectPathsFromDataTransfer(
  dt: DataTransfer,
  workspaceRoot: string | undefined,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const push = (p: string): void => {
    if (p.length === 0 || seen.has(p)) {
      return;
    }
    seen.add(p);
    out.push(p);
  };

  const files = dt.files;
  if (files.length > 0) {
    for (let i = 0; i < files.length; i++) {
      const f = files[i]!;
      const p = (f as File & { path?: string }).path;
      if (p !== undefined && p.trim().length > 0) {
        push(p.trim());
        continue;
      }
      if (f.name.length > 0) {
        push(f.name);
      }
    }
  }

  const tryUriList = (raw: string): void => {
    if (raw.trim().length === 0) {
      return;
    }
    for (const line of raw.split(/\r?\n/)) {
      if (line.startsWith("#") || line.trim().length === 0) {
        continue;
      }
      try {
        const url = new URL(line);
        if (url.protocol !== "file:") {
          continue;
        }
        const local = fileUrlToLocalPath(url);
        if (local.length > 0) {
          push(local);
        }
      } catch {
        /* ignore invalid URIs */
      }
    }
  };

  tryUriList(dt.getData("text/uri-list"));
  tryUriList(dt.getData("text/x-moz-url"));

  const plain = dt.getData("text/plain");
  if (plain.trim().length > 0) {
    for (const p of pathsFromPlainTextDrop(plain, workspaceRoot)) {
      push(p);
    }
  }

  return out;
}

function fileUrlToLocalPath(url: URL): string {
  let pathname = decodeURIComponent(url.pathname.replace(/\+/g, "%20"));
  const win = pathname.match(/^\/([A-Za-z]):\/*(.*)$/);
  if (win !== null) {
    const drive = win[1]!;
    const rest = win[2] ?? "";
    return rest.length > 0 ? `${drive}:/${rest}` : `${drive}:/`;
  }
  return pathname;
}

/** Lines from `text/plain` when Explorer sends relative paths or plain paths. */
function pathsFromPlainTextDrop(
  raw: string,
  workspaceRoot: string | undefined,
): string[] {
  const out: string[] = [];
  for (let line of raw.split(/\r?\n/)) {
    line = line.trim();
    if (line.length === 0) {
      continue;
    }
    if (line.startsWith("file:")) {
      try {
        out.push(fileUrlToLocalPath(new URL(line)));
      } catch {
        /* ignore */
      }
      continue;
    }
    if (
      workspaceRoot !== undefined &&
      workspaceRoot.trim().length > 0 &&
      (line.startsWith("./") || line.startsWith(".\\"))
    ) {
      const rest = line.replace(/^\.\//, "").replace(/^\.\\/, "");
      const base = normalizeSlashes(workspaceRoot.trim()).replace(/\/+$/, "");
      out.push(`${base}/${normalizeSlashes(rest)}`);
      continue;
    }
    if (line.startsWith("/") || /^[A-Za-z]:[\\/]/.test(line)) {
      out.push(normalizeSlashes(line));
    }
  }
  return out;
}

function normalizeSlashes(p: string): string {
  return p.replace(/\\/g, "/");
}

/**
 * If `absolutePath` is under `workspaceRoot`, returns a relative path; otherwise the original.
 */
export function pathForPrompt(
  absolutePath: string,
  workspaceRoot: string | undefined,
): string {
  if (workspaceRoot === undefined || workspaceRoot.trim().length === 0) {
    return absolutePath;
  }
  const abs = normalizeSlashes(absolutePath);
  const root = normalizeSlashes(workspaceRoot.trim()).replace(/\/+$/, "");
  const prefix = `${root}/`;
  const absLower = abs.toLowerCase();
  const rootLower = root.toLowerCase();
  const prefixLower = `${rootLower}/`;
  if (absLower === rootLower) {
    return ".";
  }
  if (absLower.startsWith(prefixLower)) {
    return abs.slice(prefix.length);
  }
  return absolutePath;
}

/** Formats one path as an @-mention, quoting when needed. */
function formatFileMention(pathForPrompt: string): string {
  if (/[\s\n"]/.test(pathForPrompt)) {
    return `@"${pathForPrompt.replace(/"/g, '\\"')}"`;
  }
  return `@${pathForPrompt}`;
}

/** Appends @-mentions for paths to the composer draft. */
export function appendFileMentionsToDraft(
  draft: string,
  paths: string[],
  workspaceRoot: string | undefined,
): string {
  if (paths.length === 0) {
    return draft;
  }
  const tokens = paths.map((p) =>
    formatFileMention(pathForPrompt(p, workspaceRoot)),
  );
  const addition = tokens.join(" ");
  if (draft.length === 0) {
    return addition;
  }
  const sep =
    draft.endsWith(" ") || draft.endsWith("\n") ? "" : " ";
  return draft + sep + addition;
}
