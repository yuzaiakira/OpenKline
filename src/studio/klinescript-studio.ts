import { compileKlineScript, type KlineScriptCompileResult } from "../klinescript/compiler.js";
import type { KlineScriptDiagnostic } from "../klinescript/diagnostics.js";

/** Local/user script definition managed outside the built-in indicator registry. */
export interface StudioUserScriptDefinition {
  readonly id: string;
  readonly name: string;
  readonly source: string;
  readonly searchableText: string;
}

export interface StudioUserScriptCatalogFilter {
  readonly query?: string;
}

/** Applied chart indicator row with optional KlineScript provenance. */
export interface StudioAppliedIndicatorRef {
  readonly id: string;
  readonly indicatorId: string;
  readonly paneId: string;
  readonly script?: { readonly programId: string; readonly source: string };
}

export interface StudioScriptCompileRequest {
  readonly source: string;
  readonly generation: number;
}

export interface StudioScriptCompileSnapshot {
  readonly generation: number;
  readonly success: boolean;
  readonly diagnostics: readonly KlineScriptDiagnostic[];
  readonly programId: string | null;
  readonly overlay: boolean | null;
}

export type StudioScriptApplyFailureReason =
  | "stale-panel"
  | "stale-request"
  | "missing-chart"
  | "replay-active"
  | "empty-source"
  | "compile-failed";

export interface StudioScriptApplyTargetArgs {
  readonly activePanelId: string;
  readonly targetPanelId: string;
  readonly replayActive?: boolean;
  readonly getChart: (panelId: string) => StudioScriptTargetChart | null | undefined;
}

export interface StudioScriptTargetChart {
  addScriptIndicatorAsync(
    source: string,
    options?: {
      readonly id?: string;
      readonly pane?: string | "new" | "main";
      readonly signal?: AbortSignal;
      readonly parameters?: Readonly<Record<string, unknown>>;
      readonly timeoutMs?: number;
    },
  ): Promise<{ readonly id: string; readonly indicatorId: string }>;
  removeIndicator(id: string): void;
}

export type StudioScriptApplyTargetResult =
  | { readonly ok: true; readonly chart: StudioScriptTargetChart; readonly panelId: string }
  | { readonly ok: false; readonly reason: StudioScriptApplyFailureReason };

export interface StudioScriptCompileGateArgs {
  readonly source: string;
  readonly requestGeneration: number;
  readonly currentGeneration: number;
}

export type StudioScriptCompileGateResult =
  | { readonly ok: true; readonly snapshot: StudioScriptCompileSnapshot }
  | { readonly ok: false; readonly reason: "stale" | "compile-failed"; readonly snapshot: StudioScriptCompileSnapshot };

/** Built-in Studio starter templates (restricted grammar only). */
export const STUDIO_KLINESCRIPT_TEMPLATES: readonly StudioUserScriptDefinition[] = [
  {
    id: "template-ema-overlay",
    name: "EMA overlay",
    source: [
      'indicator("Studio EMA")',
      'period = input.int("Period", default=21, min=1, max=200)',
      "value = ta.ema(close, period)",
      'plot(value, title="EMA", color="#a78bfa")',
    ].join("\n"),
    searchableText: "ema overlay studio template",
  },
  {
    id: "template-rsi-pane",
    name: "RSI pane",
    source: [
      'indicator("Studio RSI", overlay=False)',
      "value = ta.rsi(close, 14)",
      'plot(value, title="RSI", color="#60a5fa")',
      'hline(70, color="#fb7185")',
      'hline(30, color="#34d399")',
    ].join("\n"),
    searchableText: "rsi pane studio template",
  },
  {
    id: "template-pointwise-close",
    name: "Pointwise close",
    source: [
      'indicator("Pointwise close")',
      'plot(close, title="Close", color="#fbbf24", width=2)',
    ].join("\n"),
    searchableText: "pointwise close studio template",
  },
];

/**
 * Normalize local/user scripts into a catalog that is never mixed with built-in
 * IndicatorRegistry entries.
 */
export function buildStudioUserScriptCatalog(
  scripts: readonly { readonly id?: string; readonly name: string; readonly source: string }[],
): readonly StudioUserScriptDefinition[] {
  const entries: StudioUserScriptDefinition[] = [];
  const seen = new Set<string>();
  for (const script of scripts) {
    const name = script.name.trim() || "Untitled KlineScript";
    const id = (script.id?.trim() || `script:${normalizeScriptKey(name)}`);
    if (seen.has(id)) continue;
    seen.add(id);
    const source = script.source;
    entries.push({
      id,
      name,
      source,
      searchableText: normalizeSearchQuery([id, name, source.slice(0, 240)].join(" ")),
    });
  }
  return entries;
}

/** Case-insensitive search over id, name, and source excerpt. */
export function filterStudioUserScriptCatalog(
  catalog: readonly StudioUserScriptDefinition[],
  filter: StudioUserScriptCatalogFilter = {},
): readonly StudioUserScriptDefinition[] {
  const query = normalizeSearchQuery(filter.query ?? "");
  if (query.length === 0) return catalog;
  return catalog.filter((entry) => entry.searchableText.includes(query) || normalizeSearchQuery(entry.source).includes(query));
}

/** Compile through the real host compiler and stamp a generation token. */
export function compileStudioKlineScript(request: StudioScriptCompileRequest): StudioScriptCompileSnapshot {
  const result = compileKlineScript(request.source);
  return toCompileSnapshot(result, request.generation);
}

/**
 * Reject stale compile responses when the editor generation advanced, and reject
 * failed compiles without exposing a program id.
 */
export function gateStudioKlineScriptCompile(args: StudioScriptCompileGateArgs): StudioScriptCompileGateResult {
  const snapshot = compileStudioKlineScript({
    source: args.source,
    generation: args.requestGeneration,
  });
  if (args.requestGeneration !== args.currentGeneration) {
    return { ok: false, reason: "stale", snapshot };
  }
  if (!snapshot.success) {
    return { ok: false, reason: "compile-failed", snapshot };
  }
  return { ok: true, snapshot };
}

/** Resolve the live chart that may receive a Worker-backed script apply. */
export function resolveStudioScriptApplyTarget(args: StudioScriptApplyTargetArgs): StudioScriptApplyTargetResult {
  if (args.targetPanelId !== args.activePanelId) {
    return { ok: false, reason: "stale-panel" };
  }
  if (args.replayActive === true) {
    return { ok: false, reason: "replay-active" };
  }
  const chart = args.getChart(args.targetPanelId);
  if (chart === null || chart === undefined) {
    return { ok: false, reason: "missing-chart" };
  }
  return { ok: true, chart, panelId: args.targetPanelId };
}

/**
 * Apply a validated script through the existing Worker path after a panel-scoped
 * compile gate. Returns the created instance id when successful.
 */
export async function applyStudioKlineScriptIndicator(args: {
  readonly source: string;
  readonly activePanelId: string;
  readonly targetPanelId: string;
  readonly requestGeneration: number;
  readonly getCurrentGeneration: () => number;
  readonly getActivePanelId: () => string;
  readonly instanceId: string;
  readonly replayActive?: boolean;
  readonly signal?: AbortSignal;
  readonly getChart: (panelId: string) => StudioScriptTargetChart | null | undefined;
}): Promise<
  | { readonly ok: true; readonly instanceId: string; readonly indicatorId: string; readonly panelId: string }
  | { readonly ok: false; readonly reason: StudioScriptApplyFailureReason; readonly diagnostics?: readonly KlineScriptDiagnostic[] }
> {
  const trimmed = args.source.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: "empty-source" };
  }
  const gated = gateStudioKlineScriptCompile({
    source: args.source,
    requestGeneration: args.requestGeneration,
    currentGeneration: args.getCurrentGeneration(),
  });
  if (!gated.ok) {
    return {
      ok: false,
      reason: gated.reason === "stale" ? "stale-request" : "compile-failed",
      diagnostics: gated.snapshot.diagnostics,
    };
  }
  const target = resolveStudioScriptApplyTarget({
    activePanelId: args.getActivePanelId(),
    targetPanelId: args.targetPanelId,
    ...(args.replayActive === undefined ? {} : { replayActive: args.replayActive }),
    getChart: args.getChart,
  });
  if (!target.ok) {
    return { ok: false, reason: target.reason };
  }
  const pane = gated.snapshot.overlay === true ? "main" : "new";
  try {
    const api = await target.chart.addScriptIndicatorAsync(args.source, {
      id: args.instanceId,
      pane,
      ...(args.signal === undefined ? {} : { signal: args.signal }),
    });
    const stillCurrent = args.requestGeneration === args.getCurrentGeneration();
    const stillActive = resolveStudioScriptApplyTarget({
      activePanelId: args.getActivePanelId(),
      targetPanelId: args.targetPanelId,
      ...(args.replayActive === undefined ? {} : { replayActive: args.replayActive }),
      getChart: args.getChart,
    });
    if (!stillCurrent || !stillActive.ok) {
      try {
        target.chart.removeIndicator(api.id);
      } catch {
        // Chart may already be disposed; ignore cleanup failure.
      }
      return { ok: false, reason: stillCurrent ? (stillActive.ok ? "stale-panel" : stillActive.reason) : "stale-request" };
    }
    return {
      ok: true,
      instanceId: api.id,
      indicatorId: api.indicatorId,
      panelId: target.panelId,
    };
  } catch {
    return { ok: false, reason: "compile-failed" };
  }
}

/** Partition applied indicators into built-ins versus KlineScript instances. */
export function partitionStudioAppliedIndicators(
  indicators: readonly StudioAppliedIndicatorRef[],
): {
  readonly builtIn: readonly StudioAppliedIndicatorRef[];
  readonly scripts: readonly StudioAppliedIndicatorRef[];
} {
  const builtIn: StudioAppliedIndicatorRef[] = [];
  const scripts: StudioAppliedIndicatorRef[] = [];
  for (const indicator of indicators) {
    if (indicator.script !== undefined) scripts.push(indicator);
    else builtIn.push(indicator);
  }
  return { builtIn, scripts };
}

export function isStudioAppliedScriptIndicator(
  indicator: StudioAppliedIndicatorRef,
): boolean {
  return indicator.script !== undefined;
}

export function allocateStudioScriptInstanceId(serial: number): string {
  return `studio-script-${serial}`;
}

export function allocateStudioUserScriptId(name: string, serial: number): string {
  return `user-script-${normalizeScriptKey(name)}-${serial}`;
}

function toCompileSnapshot(result: KlineScriptCompileResult, generation: number): StudioScriptCompileSnapshot {
  if (!result.success) {
    return {
      generation,
      success: false,
      diagnostics: result.diagnostics,
      programId: null,
      overlay: null,
    };
  }
  return {
    generation,
    success: true,
    diagnostics: [],
    programId: result.program.id,
    overlay: result.program.metadata.overlay === true,
  };
}

function normalizeScriptKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "untitled";
}

function normalizeSearchQuery(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
