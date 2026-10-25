import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { CSSProperties, ForwardedRef, ReactElement } from "react";
import { createChart } from "openkline";
import type {
  Candle,
  Chart,
  ChartIndicatorApi,
  ChartOptions,
  CrosshairMoveEvent,
  DrawingApi,
  DrawingOptions,
  IndicatorAddOptions,
  KlineScriptCompiledProgram,
  OpenKlinePlugin,
  PluginHandle,
  WorkspaceDocument,
} from "openkline";

export interface FinancialChartIndicator {
  /** Stable declarative identity. Prefer this over array position. */
  id?: string;
  indicatorId: string;
  options?: IndicatorAddOptions;
}

export interface FinancialChartDrawing {
  type: string;
  options: DrawingOptions;
}

export interface FinancialChartScriptIndicator {
  /** Stable declarative identity. Prefer this over array position. */
  id?: string;
  program: KlineScriptCompiledProgram;
  options?: IndicatorAddOptions;
}

export interface FinancialChartProps extends ChartOptions {
  /** Omit to preserve chart/workspace data; pass `[]` to clear it. */
  candles?: readonly Candle[];
  /** Omit to preserve unmanaged/workspace indicators; pass `[]` to clear declarative indicators. */
  indicators?: readonly FinancialChartIndicator[];
  /** Omit to preserve unmanaged/workspace script indicators; pass `[]` to clear declarative script indicators. */
  scriptIndicators?: readonly FinancialChartScriptIndicator[];
  /** Omit to preserve unmanaged/workspace drawings; pass `[]` to clear declarative drawings. */
  drawings?: readonly FinancialChartDrawing[];
  /** Omit to preserve adapter-managed plugins; pass `[]` to dispose them. */
  plugins?: readonly OpenKlinePlugin[];
  workspace?: WorkspaceDocument;
  className?: string;
  onCrosshairMove?: (event: CrosshairMoveEvent) => void;
  onChartReady?: (chart: Chart) => void;
  style?: CSSProperties;
}

export interface FinancialChartHandle {
  getChart(): Chart | null;
}

type ManagedIndicatorKind = "indicator" | "script";

interface ManagedIndicator {
  readonly kind: ManagedIndicatorKind;
  readonly signature: string;
  readonly api: ChartIndicatorApi;
}

interface ManagedDrawing {
  readonly signature: string;
  readonly api: DrawingApi;
}

interface ManagedPlugin {
  readonly plugin: OpenKlinePlugin;
  readonly handle: PluginHandle;
}

interface AdapterState {
  chart: Chart | null;
  readonly indicators: Map<string, ManagedIndicator>;
  readonly drawings: Map<string, ManagedDrawing>;
  readonly plugins: Map<string, ManagedPlugin>;
  candles: readonly Candle[] | undefined;
  optionsSignature: string | null;
  workspaceSignature: string | null;
  indicatorsControlled: boolean;
  scriptIndicatorsControlled: boolean;
  drawingsControlled: boolean;
}

interface DeclarativeIndicator {
  readonly id: string;
  readonly kind: ManagedIndicatorKind;
  readonly signature: string;
  create(chart: Chart): ChartIndicatorApi;
}

const FinancialChartImpl = (
  props: FinancialChartProps,
  ref: ForwardedRef<FinancialChartHandle>,
): ReactElement => {
  const {
    candles,
    indicators,
    scriptIndicators,
    drawings,
    plugins,
    workspace,
    className,
    onCrosshairMove,
    onChartReady,
    style,
    ...options
  } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const crosshairHandlerRef = useRef(onCrosshairMove);
  const readyHandlerRef = useRef(onChartReady);
  const stateRef = useRef<AdapterState | null>(null);
  crosshairHandlerRef.current = onCrosshairMove;
  readyHandlerRef.current = onChartReady;

  if (stateRef.current === null) {
    stateRef.current = {
      chart: null,
      indicators: new Map(),
      drawings: new Map(),
      plugins: new Map(),
      candles: undefined,
      optionsSignature: null,
      workspaceSignature: null,
      indicatorsControlled: false,
      scriptIndicatorsControlled: false,
      drawingsControlled: false,
    };
  }

  useImperativeHandle(ref, () => ({
    getChart: () => chartRef.current,
  }), []);

  useEffect(() => {
    if (containerRef.current === null) return undefined;

    const chart = createChart(containerRef.current, options);
    const state = stateRef.current;
    if (state === null) return undefined;
    chartRef.current = chart;
    state.chart = chart;
    state.optionsSignature = stableSignature(options);
    readyHandlerRef.current?.(chart);
    const unsubscribe = chart.subscribe("crosshairMove", (event) => {
      crosshairHandlerRef.current?.(event);
    });

    return () => {
      if (state.chart !== chart) return;
      disposeDeclarativeResources(state);
      unsubscribe();
      chart.destroy();
      chartRef.current = null;
      state.chart = null;
      state.candles = undefined;
      state.optionsSignature = null;
      state.workspaceSignature = null;
      state.indicatorsControlled = false;
      state.scriptIndicatorsControlled = false;
      state.drawingsControlled = false;
    };
  }, []);

  /*
   * Reconciliation intentionally runs after every committed render. It uses
   * stable declarative identities and compact signatures instead of an
   * array-reference dependency, so newly allocated equivalent arrays do not
   * destroy editable chart resources. Candle arrays use their reference as the
   * change signal: comparing a large market-data array deeply on every React
   * render would be a costly and surprising policy.
   */
  useEffect(() => {
    const chart = chartRef.current;
    const state = stateRef.current;
    if (chart === null || state === null || state.chart !== chart) return;

    const nextOptionsSignature = stableSignature(options);
    if (nextOptionsSignature !== state.optionsSignature) {
      chart.setOptions(options);
      state.optionsSignature = nextOptionsSignature;
    }

    if (plugins !== undefined) reconcilePlugins(chart, state, plugins);

    const nextWorkspaceSignature = workspace === undefined ? null : stableSignature(workspace);
    const workspaceChanged = nextWorkspaceSignature !== state.workspaceSignature;
    if (workspace !== undefined && workspaceChanged) {
      chart.restoreWorkspace(workspace);
      // A later explicit reuse of the same candle array must still override
      // the newly restored workspace data.
      state.candles = undefined;
      state.indicators.clear();
      state.drawings.clear();
    }
    state.workspaceSignature = nextWorkspaceSignature;

    if (candles !== undefined && (workspaceChanged || candles !== state.candles)) {
      chart.setData(candles);
      state.candles = candles;
    }

    reconcileIndicators(chart, state, indicators, "indicator", workspaceChanged);
    reconcileIndicators(chart, state, scriptIndicators, "script", workspaceChanged);
    reconcileDrawings(chart, state, drawings, workspaceChanged);
  });

  return <div ref={containerRef} className={className} style={style} />;
};

function reconcilePlugins(chart: Chart, state: AdapterState, plugins: readonly OpenKlinePlugin[]): void {
  const desired = new Map<string, OpenKlinePlugin>();
  for (const plugin of plugins) {
    const id = plugin.metadata.id;
    if (desired.has(id)) throw new Error(`Duplicate FinancialChart plugin id: ${id}`);
    desired.set(id, plugin);
  }

  const installedIds = new Set(chart.getPlugins().map((plugin) => plugin.id));
  for (const [id, managed] of [...state.plugins]) {
    if (desired.get(id) === managed.plugin && installedIds.has(id)) continue;
    if (installedIds.has(id)) managed.handle.dispose();
    state.plugins.delete(id);
  }
  for (const [id, plugin] of desired) {
    if (!state.plugins.has(id)) state.plugins.set(id, { plugin, handle: chart.installPlugin(plugin) });
  }
}

function reconcileIndicators(
  chart: Chart,
  state: AdapterState,
  prop: readonly FinancialChartIndicator[] | readonly FinancialChartScriptIndicator[] | undefined,
  kind: ManagedIndicatorKind,
  workspaceChanged: boolean,
): void {
  if (prop === undefined) return;
  const wasControlled = kind === "indicator" ? state.indicatorsControlled : state.scriptIndicatorsControlled;
  const desired = kind === "indicator"
    ? createIndicators(prop as readonly FinancialChartIndicator[])
    : createScriptIndicators(prop as readonly FinancialChartScriptIndicator[]);
  const desiredIds = new Set(desired.map((item) => item.id));

  if (workspaceChanged || !wasControlled) {
    for (const indicator of chart.serializeWorkspace().indicators) {
      const isScript = indicator.script !== undefined;
      if ((kind === "script") === isScript) chart.removeIndicator(indicator.id);
    }
  }

  for (const [id, managed] of [...state.indicators]) {
    if (managed.kind !== kind || desiredIds.has(id)) continue;
    managed.api.remove();
    state.indicators.delete(id);
  }

  const existingIds = new Set(chart.serializeWorkspace().indicators.map((indicator) => indicator.id));
  for (const item of desired) {
    const managed = state.indicators.get(item.id);
    if (managed?.kind === kind && managed.signature === item.signature && existingIds.has(item.id)) continue;
    if (managed !== undefined) {
      if (existingIds.has(item.id)) managed.api.remove();
      state.indicators.delete(item.id);
      existingIds.delete(item.id);
    }
    if (existingIds.has(item.id)) {
      chart.removeIndicator(item.id);
      existingIds.delete(item.id);
    }
    state.indicators.set(item.id, { kind, signature: item.signature, api: item.create(chart) });
  }

  if (kind === "indicator") state.indicatorsControlled = true;
  else state.scriptIndicatorsControlled = true;
}

function reconcileDrawings(
  chart: Chart,
  state: AdapterState,
  drawings: readonly FinancialChartDrawing[] | undefined,
  workspaceChanged: boolean,
): void {
  if (drawings === undefined) return;
  const desired = new Map<string, { signature: string; type: string; options: DrawingOptions }>();
  drawings.forEach((drawing, index) => {
    const id = drawing.options.id ?? `react-drawing-${index}`;
    if (desired.has(id)) throw new Error(`Duplicate FinancialChart drawing id: ${id}`);
    desired.set(id, {
      signature: stableSignature({ type: drawing.type, options: drawing.options }),
      type: drawing.type,
      options: { ...drawing.options, id },
    });
  });

  if (workspaceChanged || !state.drawingsControlled) {
    for (const drawing of chart.getDrawings()) chart.removeDrawing(drawing.id);
  }
  for (const [id, managed] of [...state.drawings]) {
    if (desired.has(id)) continue;
    managed.api.remove();
    state.drawings.delete(id);
  }

  const existingIds = new Set(chart.getDrawings().map((drawing) => drawing.id));
  for (const [id, drawing] of desired) {
    const managed = state.drawings.get(id);
    if (managed?.signature === drawing.signature && existingIds.has(id)) continue;
    if (managed !== undefined) {
      if (existingIds.has(id)) managed.api.remove();
      state.drawings.delete(id);
      existingIds.delete(id);
    }
    if (existingIds.has(id)) {
      chart.removeDrawing(id);
      existingIds.delete(id);
    }
    state.drawings.set(id, {
      signature: drawing.signature,
      api: chart.addDrawing(drawing.type, drawing.options),
    });
  }
  state.drawingsControlled = true;
}

function createIndicators(indicators: readonly FinancialChartIndicator[]): DeclarativeIndicator[] {
  const ids = new Set<string>();
  return indicators.map((indicator, index) => {
    const id = getIndicatorId(indicator.id, indicator.options, `react-indicator-${indicator.indicatorId}-${index}`);
    if (ids.has(id)) throw new Error(`Duplicate FinancialChart indicator id: ${id}`);
    ids.add(id);
    const options = { ...indicator.options, id };
    return {
      id,
      kind: "indicator",
      signature: stableSignature({ indicatorId: indicator.indicatorId, options }),
      create: (chart) => chart.addIndicator(indicator.indicatorId, options),
    };
  });
}

function createScriptIndicators(indicators: readonly FinancialChartScriptIndicator[]): DeclarativeIndicator[] {
  const ids = new Set<string>();
  return indicators.map((indicator, index) => {
    const id = getIndicatorId(indicator.id, indicator.options, `react-script-${indicator.program.id}-${index}`);
    if (ids.has(id)) throw new Error(`Duplicate FinancialChart script indicator id: ${id}`);
    ids.add(id);
    const options = { ...indicator.options, id };
    return {
      id,
      kind: "script",
      signature: stableSignature({ programId: indicator.program.id, source: indicator.program.source, options }),
      create: (chart) => chart.addScriptIndicator(indicator.program, options),
    };
  });
}

function getIndicatorId(explicitId: string | undefined, options: IndicatorAddOptions | undefined, fallback: string): string {
  if (explicitId !== undefined) return explicitId;
  return typeof options?.id === "string" ? options.id : fallback;
}

function disposeDeclarativeResources(state: AdapterState): void {
  const chart = state.chart;
  const indicatorIds = chart === null
    ? new Set<string>()
    : new Set(chart.serializeWorkspace().indicators.map((indicator) => indicator.id));
  for (const [id, managed] of state.indicators) {
    if (indicatorIds.has(id)) managed.api.remove();
  }
  state.indicators.clear();
  const drawingIds = chart === null ? new Set<string>() : new Set(chart.getDrawings().map((drawing) => drawing.id));
  for (const [id, managed] of state.drawings) {
    if (drawingIds.has(id)) managed.api.remove();
  }
  state.drawings.clear();
  const pluginIds = chart === null ? new Set<string>() : new Set(chart.getPlugins().map((plugin) => plugin.id));
  for (const [id, managed] of state.plugins) {
    if (pluginIds.has(id)) managed.handle.dispose();
  }
  state.plugins.clear();
}

function stableSignature(value: unknown): string {
  return serialize(value, new WeakSet<object>());
}

function serialize(value: unknown, seen: WeakSet<object>): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "undefined") return "undefined";
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "function" || typeof value === "symbol") return `${typeof value}:${String(value)}`;
  if (Array.isArray(value)) return `[${value.map((item) => serialize(item, seen)).join(",")}]`;
  if (typeof value === "object") {
    if (seen.has(value)) throw new TypeError("FinancialChart declarative props cannot contain circular values");
    seen.add(value);
    const record = value as Record<string, unknown>;
    const result = `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${serialize(record[key], seen)}`).join(",")}}`;
    seen.delete(value);
    return result;
  }
  return String(value);
}

export const FinancialChart = forwardRef(FinancialChartImpl);

export const FinancialChartComponent = FinancialChart;
