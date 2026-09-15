import type { ReactElement, ReactNode } from "react";

type TokenKind =
    | "plain"
    | "keyword"
    | "string"
    | "number"
    | "comment"
    | "operator"
    | "punctuation";

type Token = { kind: TokenKind; text: string };

function tokensToNodes(tokens: Token[]): ReactNode[] {
    return tokens.map((token, index) =>
        token.kind === "plain" ? (
            token.text
        ) : (
            <span key={`${token.kind}-${index}`} className={`code-token-${token.kind}`}>
                {token.text}
            </span>
        ),
    );
}

function tokenizeByRegex(text: string, expression: RegExp, kind: TokenKind): Token[] {
    const out: Token[] = [];
    let last = 0;
    let match = expression.exec(text);
    while (match !== null) {
        const start = match.index;
        const value = match[0] ?? "";
        if (start > last) {
            out.push({ kind: "plain", text: text.slice(last, start) });
        }
        out.push({ kind, text: value });
        last = start + value.length;
        match = expression.exec(text);
    }
    if (last < text.length) {
        out.push({ kind: "plain", text: text.slice(last) });
    }
    return out;
}

export function languageFromClassName(className: string | undefined): string | undefined {
    if (className === undefined) {
        return undefined;
    }
    const match = className.match(/language-([a-z0-9_-]+)/i);
    return match?.[1]?.toLowerCase();
}

function highlightCodeToNodes(
    language: string | undefined,
    code: string,
): ReactNode[] {
    if (language === "json") {
        const quoted = tokenizeByRegex(code, /"(?:\\.|[^"\\])*"/g, "string");
        return tokensToNodes(
            quoted.flatMap((token) => {
                if (token.kind !== "plain") {
                    return [token];
                }
                return tokenizeByRegex(token.text, /\b-?\d+(?:\.\d+)?\b/g, "number");
            }),
        );
    }
    if (language === "typescript" || language === "ts") {
        const comments = tokenizeByRegex(code, /\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "comment");
        const keywords = /\b(?:const|let|var|function|class|interface|type|return|if|else|for|while|import|export|from|extends|implements|new|async|await|try|catch|throw)\b/g;
        const numbers = /\b\d+(?:\.\d+)?\b/g;
        return tokensToNodes(
            comments.flatMap((token) => {
                if (token.kind !== "plain") {
                    return [token];
                }
                return tokenizeByRegex(token.text, keywords, "keyword").flatMap((kToken) => {
                    if (kToken.kind !== "plain") {
                        return [kToken];
                    }
                    return tokenizeByRegex(kToken.text, numbers, "number");
                });
            }),
        );
    }
    if (language === "markdown" || language === "md") {
        const headers = tokenizeByRegex(code, /^#{1,6}\s.*$/gm, "keyword");
        return tokensToNodes(
            headers.flatMap((token) => {
                if (token.kind !== "plain") {
                    return [token];
                }
                return tokenizeByRegex(token.text, /`[^`\n]+`/g, "string");
            }),
        );
    }
    return [code];
}

export function renderHighlightedCode(
    language: string | undefined,
    code: string,
): ReactElement {
    return <>{highlightCodeToNodes(language, code)}</>;
}
