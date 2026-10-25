import type { IndicatorDefinition } from "../indicators/types.js";
import type { Candle } from "../types.js";
import { checkKlineScript, type CheckOptions, type KlineScriptIndicatorMetadata } from "./checker.js";
import { type KlineScriptDiagnostic } from "./diagnostics.js";
import { lexKlineScript, type LexerOptions } from "./lexer.js";
import { parseKlineScript } from "./parser.js";
import { createKlineScriptDefinition, executeKlineScript, type KlineScriptExecutionResult, type KlineScriptRuntimeLimits, type KlineScriptRuntimeOptions } from "./runtime.js";

export interface KlineScriptCompileOptions extends LexerOptions, CheckOptions {}

export interface KlineScriptCompiledProgram {
  readonly language: "KlineScript";
  readonly version: 1;
  readonly id: string;
  readonly source: string;
  readonly metadata: KlineScriptIndicatorMetadata;
  createIndicatorDefinition(limits?: KlineScriptRuntimeLimits): IndicatorDefinition;
  execute(input: readonly Candle[], parameters?: Record<string, unknown>, options?: KlineScriptRuntimeOptions): KlineScriptExecutionResult;
}

export type KlineScriptCompileResult =
  | { readonly success: true; readonly program: KlineScriptCompiledProgram; readonly diagnostics: readonly KlineScriptDiagnostic[] }
  | { readonly success: false; readonly diagnostics: readonly KlineScriptDiagnostic[] };

export function compileKlineScript(source: string, options: KlineScriptCompileOptions = {}): KlineScriptCompileResult {
  if (typeof source !== "string") {
    throw new TypeError("KlineScript source must be a string");
  }
  const lexed = lexKlineScript(source, options);
  const parsed = parseKlineScript(lexed.tokens);
  const checked = checkKlineScript(parsed.program, options);
  const diagnostics = [...lexed.diagnostics, ...parsed.diagnostics, ...checked.diagnostics];
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error") || checked.program === null) return { success: false, diagnostics };
  const id = `KLINESCRIPT-${hashSource(source)}`;
  const checkedProgram = deepFreeze(checked.program);
  const metadata = deepFreeze(cloneMetadata(checkedProgram.metadata));
  const program: KlineScriptCompiledProgram = {
    language: "KlineScript",
    version: 1,
    id,
    source,
    metadata,
    createIndicatorDefinition: (limits = {}) => createKlineScriptDefinition(checkedProgram, id, limits),
    execute: (input, parameters = {}, options = {}) => executeKlineScript(checkedProgram, input, parameters, options, id),
  };
  return { success: true, program: Object.freeze(program), diagnostics };
}

function cloneMetadata(metadata: KlineScriptIndicatorMetadata): KlineScriptIndicatorMetadata {
  return {
    name: metadata.name,
    overlay: metadata.overlay,
    maxLookback: metadata.maxLookback,
    inputs: metadata.inputs.map((input) => ({ ...input })),
    outputs: metadata.outputs.map((output) => ({ ...output })),
  };
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function hashSource(source: string): string {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).toUpperCase().padStart(8, "0");
}
