import type { SourcePosition, SourceSpan } from "./ast.js";
import { diagnostic, type KlineScriptDiagnostic } from "./diagnostics.js";

export type KlineScriptTokenKind =
  | "identifier" | "number" | "string" | "newline" | "eof"
  | "operator" | "punctuation";

export interface KlineScriptToken {
  readonly kind: KlineScriptTokenKind;
  readonly value: string;
  readonly span: SourceSpan;
}

export interface LexResult {
  readonly tokens: readonly KlineScriptToken[];
  readonly diagnostics: readonly KlineScriptDiagnostic[];
}

export interface LexerOptions {
  readonly maxSourceLength?: number;
  readonly maxTokens?: number;
}

const DEFAULT_MAX_SOURCE_LENGTH = 64 * 1024;
const DEFAULT_MAX_TOKENS = 10_000;

export function lexKlineScript(source: string, options: LexerOptions = {}): LexResult {
  const diagnostics: KlineScriptDiagnostic[] = [];
  const tokens: KlineScriptToken[] = [];
  const maxSourceLength = options.maxSourceLength ?? DEFAULT_MAX_SOURCE_LENGTH;
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  if (source.length > maxSourceLength) {
    const end = positionAt(source, maxSourceLength);
    diagnostics.push(diagnostic("KS1001", `Source exceeds the ${maxSourceLength}-character limit`, {
      start: positionAt(source, 0), end,
    }));
    return { tokens: [{ kind: "eof", value: "", span: { start: end, end } }], diagnostics };
  }

  let offset = 0;
  let line = 1;
  let column = 1;
  const current = (): string | undefined => source[offset];
  const advance = (): string | undefined => {
    const value = source[offset];
    offset += 1;
    if (value === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
    return value;
  };
  const startPosition = (): SourcePosition => ({ offset, line, column });
  const add = (kind: KlineScriptTokenKind, value: string, start: SourcePosition): boolean => {
    if (tokens.length >= maxTokens) {
      diagnostics.push(diagnostic("KS1002", `Token count exceeds the ${maxTokens}-token limit`, {
        start, end: startPosition(),
      }));
      return false;
    }
    tokens.push({ kind, value, span: { start, end: startPosition() } });
    return true;
  };

  while (offset < source.length) {
    const value = current();
    if (value === undefined) break;
    if (value === " " || value === "\t" || value === "\r" || value === "\f") {
      advance();
      continue;
    }
    if (value === "#") {
      while (offset < source.length && current() !== "\n") advance();
      continue;
    }
    const start = startPosition();
    if (value === "\n") {
      advance();
      if (!add("newline", "\n", start)) break;
      continue;
    }
    if (isIdentifierStart(value)) {
      let text = "";
      while (isIdentifierPart(current())) text += advance() ?? "";
      if (!add("identifier", text, start)) break;
      continue;
    }
    if (isDigit(value) || (value === "." && isDigit(source[offset + 1]))) {
      const text = readNumber(source, offset);
      for (let index = 0; index < text.length; index += 1) advance();
      if (text.endsWith(".")) {
        diagnostics.push(diagnostic("KS1003", "Invalid numeric literal", { start, end: startPosition() }));
      } else if (!Number.isFinite(Number(text))) {
        diagnostics.push(diagnostic("KS1004", "Numeric literal must be finite", { start, end: startPosition() }));
      } else if (!add("number", text, start)) break;
      continue;
    }
    if (value === '"' || value === "'") {
      const quote = advance();
      let text = "";
      let closed = false;
      while (offset < source.length) {
        const character = current();
        if (character === quote) {
          advance();
          closed = true;
          break;
        }
        if (character === "\n" || character === undefined) break;
        if (character === "\\") {
          advance();
          const escaped = current();
          const escapeMap: Record<string, string> = { n: "\n", r: "\r", t: "\t", "\\": "\\", '"': '"', "'": "'" };
          if (escaped === undefined || escapeMap[escaped] === undefined) {
            diagnostics.push(diagnostic("KS1005", "Unsupported string escape", { start, end: startPosition() }));
            if (escaped !== undefined) advance();
          } else {
            text += escapeMap[escaped];
            advance();
          }
        } else {
          text += advance() ?? "";
        }
      }
      if (!closed) {
        diagnostics.push(diagnostic("KS1006", "Unterminated string literal", { start, end: startPosition() }));
      } else if (!add("string", text, start)) break;
      continue;
    }

    const two = source.slice(offset, offset + 2);
    if (["==", "!=", "<=", ">=", "//"].includes(two)) {
      advance();
      advance();
      if (!add("operator", two, start)) break;
      continue;
    }
    if (["+", "-", "*", "/", "%", "<", ">", "=", "?"].includes(value)) {
      advance();
      if (!add("operator", value, start)) break;
      continue;
    }
    if (["(", ")", "[", "]", ",", ".", ";"].includes(value)) {
      advance();
      if (!add("punctuation", value, start)) break;
      continue;
    }
    advance();
    diagnostics.push(diagnostic("KS1007", `Illegal character '${value}'`, { start, end: startPosition() }));
  }
  const end = startPosition();
  tokens.push({ kind: "eof", value: "", span: { start: end, end } });
  return { tokens, diagnostics };
}

function positionAt(source: string, offset: number): SourcePosition {
  let line = 1;
  let column = 1;
  for (let index = 0; index < offset && index < source.length; index += 1) {
    if (source[index] === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { offset, line, column };
}

function isDigit(value: string | undefined): boolean {
  return value !== undefined && value >= "0" && value <= "9";
}

function isIdentifierStart(value: string | undefined): boolean {
  return value !== undefined && /[A-Za-z_]/.test(value);
}

function isIdentifierPart(value: string | undefined): boolean {
  return value !== undefined && /[A-Za-z0-9_]/.test(value);
}

function readNumber(source: string, start: number): string {
  let index = start;
  if (source[index] === ".") index += 1;
  while (isDigit(source[index])) index += 1;
  if (source[index] === ".") {
    index += 1;
    while (isDigit(source[index])) index += 1;
  }
  if (source[index] === "e" || source[index] === "E") {
    index += 1;
    if (source[index] === "+" || source[index] === "-") index += 1;
    while (isDigit(source[index])) index += 1;
  }
  return source.slice(start, index);
}
