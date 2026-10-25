import type { SourceSpan } from "./ast.js";

export type KlineScriptDiagnosticSeverity = "error" | "warning";

export interface KlineScriptDiagnostic {
  readonly code: string;
  readonly severity: KlineScriptDiagnosticSeverity;
  readonly message: string;
  readonly span: SourceSpan;
}

export class KlineScriptCompileError extends Error {
  public readonly diagnostics: readonly KlineScriptDiagnostic[];

  public constructor(diagnostics: readonly KlineScriptDiagnostic[]) {
    super(diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`).join("\n"));
    this.name = "KlineScriptCompileError";
    this.diagnostics = diagnostics;
  }
}

export function diagnostic(
  code: string,
  message: string,
  span: SourceSpan,
  severity: KlineScriptDiagnosticSeverity = "error",
): KlineScriptDiagnostic {
  return { code, severity, message, span };
}

export function zeroSpan(): SourceSpan {
  const position = { offset: 0, line: 1, column: 1 };
  return { start: position, end: position };
}
