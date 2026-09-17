export function shouldOpenNewChatOnCtrlT(args: {
    key: string;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
}): boolean {
    return (
        args.key.toLowerCase() === "t" &&
        (args.ctrlKey || args.metaKey) &&
        !args.altKey &&
        !args.shiftKey
    );
}

export function shouldCycleSessionModeOnShiftTab(args: {
    key: string;
    shiftKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
}): boolean {
    return (
        args.key === "Tab" &&
        args.shiftKey &&
        !args.ctrlKey &&
        !args.metaKey &&
        !args.altKey
    );
}

/**
 * True when Enter means "confirm" — submit the draft, or accept the highlighted
 * autocomplete suggestion — rather than "newline".
 *
 * IME guard: while a composition is active (e.g. typing English with a Chinese
 * IME turned on) Enter commits the candidate and must NOT send. Chromium — the
 * VS Code webview runtime — fires that keydown with `isComposing: true`, so it
 * is the reliable signal; matching on `key` alone sends the pre-edit text.
 */
export function shouldConfirmOnEnter(args: {
    key: string;
    shiftKey: boolean;
    isComposing: boolean;
}): boolean {
    return args.key === "Enter" && !args.shiftKey && !args.isComposing;
}

export function shouldCancelRunOnCtrlC(args: {
    key: string;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    hasSelection: boolean;
    promptInFlight: boolean;
}): boolean {
    return (
        args.key.toLowerCase() === "c" &&
        args.ctrlKey &&
        !args.metaKey &&
        !args.altKey &&
        !args.shiftKey &&
        !args.hasSelection &&
        args.promptInFlight
    );
}
