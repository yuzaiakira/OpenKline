"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import {
  createDefaultStrategyRegistry,
  createOptimizationWorker,
  listOptimizationObjectives,
  runWalkForward,
  serializeOptimizationLeaderboardCsv,
  serializeOptimizationReportJson,
  serializeWalkForwardFoldCsv,
  serializeWalkForwardReportJson,
} from "openkline";
import type {
  Candle,
  Chart,
  OptimizationCandidateResult,
  OptimizationObjectiveName,
  OptimizationParameterDefinition,
  OptimizationProgress,
  OptimizationResult,
  OptimizationWorkerApi,
  OptimizationWorkerStatus,
  PositionSizing,
  TransactionCost,
  WalkForwardMode,
  WalkForwardProgress,
  WalkForwardResult,
} from "openkline";
import styles from "./studio.module.css";

interface StrategyOptimizerProps {
  readonly panelId: string;
  readonly symbol: string;
  readonly timeframe: string;
  readonly chart: Chart | null;
  readonly onApplyParameters: (strategyId: string, parameters: Readonly<Record<string, unknown>>) => void;
  readonly onNotice: (message: string) => void;
}

type DatasetMode = "chart" | "deterministic-100k" | "deterministic-500k";
type SizingType = PositionSizing["type"];
type CostType = TransactionCost["type"];
type OptimizerTab = "optimize" | "walk-forward";
type OptimizerStatus = "idle" | "initializing" | "running" | "completed" | "cancelled" | "failed" | "disposed";
type RangeValue = { readonly start: string; readonly end: string; readonly step: string };
type RangeState = Readonly<Record<string, RangeValue>>;

const strategyRegistry = createDefaultStrategyRegistry();
const strategyMetadata = strategyRegistry.listMetadata();
const objectives = listOptimizationObjectives();

function deterministicCandles(count: number): Candle[] {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + Math.sin(index / 23) * 3 + Math.cos(index / 71) * 2 + index * 0.002;
    return { time: Date.UTC(2020, 0, 1) + index * 60_000, open: close - 0.35, high: close + 0.8, low: close - 0.8, close, volume: 1_000 + (index % 97) * 10 };
  });
}

function defaultRange(strategyId: string, name: string): RangeValue {
  const ranges: Record<string, Record<string, RangeValue>> = {
    EMA_CROSSOVER: { fastPeriod: { start: "5", end: "15", step: "5" }, slowPeriod: { start: "20", end: "40", step: "10" } },
    RSI_REVERSAL: { period: { start: "7", end: "21", step: "7" }, oversold: { start: "20", end: "40", step: "10" }, overbought: { start: "60", end: "80", step: "10" } },
    DONCHIAN_BREAKOUT: { period: { start: "10", end: "40", step: "10" } },
    EMA_TREND: { period: { start: "10", end: "40", step: "10" } },
  };
  return ranges[strategyId]?.[name] ?? { start: "1", end: "20", step: "1" };
}

function defaultRanges(strategyId: string): RangeState {
  const metadata = strategyMetadata.find((item) => item.id === strategyId) ?? strategyMetadata[0]!;
  return Object.fromEntries(metadata.parameters.map((parameter) => [parameter.name, defaultRange(strategyId, parameter.name)]));
}

function parameterSpace(strategyId: string, ranges: RangeState): readonly OptimizationParameterDefinition[] {
  const metadata = strategyMetadata.find((item) => item.id === strategyId) ?? strategyMetadata[0]!;
  return metadata.parameters.map((parameter) => {
    const range = ranges[parameter.name] ?? defaultRange(strategyId, parameter.name);
    const integer = parameter.type === "integer";
    const parse = integer ? Number.parseInt : Number.parseFloat;
    return { name: parameter.name, type: integer ? "integer-range" : "number-range", start: parse(range.start, 10), end: parse(range.end, 10), step: parse(range.step, 10) } as OptimizationParameterDefinition;
  });
}

function readNumber(value: string): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : Number.NaN;
}

function formatNumber(value: number | null | undefined, digits = 2): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "—" : value.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "—" : `${(value * 100).toFixed(2)}%`;
}

function downloadText(name: string, text: string, type: string): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function datasetFor(mode: DatasetMode, chart: Chart | null): readonly Candle[] {
  return mode === "chart" ? chart?.getData() ?? [] : deterministicCandles(mode === "deterministic-100k" ? 100_000 : 500_000);
}

function executionSettings(initialCapital: string, sizingType: SizingType, sizingValue: string, commissionType: CostType, commissionValue: string, slippageType: CostType, slippageValue: string): { readonly initialCapital: number; readonly positionSizing: PositionSizing; readonly commission: TransactionCost; readonly slippage: TransactionCost } {
  const capital = readNumber(initialCapital);
  const value = readNumber(sizingValue);
  return {
    initialCapital: capital,
    positionSizing: sizingType === "fixed-quantity" ? { type: sizingType, quantity: value } : sizingType === "fixed-notional" ? { type: sizingType, amount: value } : { type: sizingType, percent: value },
    commission: { type: commissionType, value: readNumber(commissionValue) },
    slippage: { type: slippageType, value: readNumber(slippageValue) },
  };
}

function progressLabel(progress: OptimizationProgress | null): string {
  if (progress === null) return "Waiting";
  return `${progress.phase} · ${progress.evaluatedCandidates}/${progress.totalCandidates} candidates · ${progress.percentage.toFixed(0)}%`;
}

function wfaProgressLabel(progress: WalkForwardProgress | null): string {
  if (progress === null) return "Waiting";
  return `${progress.phase} · fold ${Math.min(progress.foldIndex + 1, progress.foldCount)}/${progress.foldCount} · ${progress.percentage.toFixed(0)}%`;
}

function resultValue(result: OptimizationCandidateResult, sort: "objective" | "net-profit" | "drawdown" | "trades"): number {
  if (sort === "objective") return result.objective.value ?? Number.NEGATIVE_INFINITY;
  if (sort === "net-profit") return result.metrics?.netProfit ?? Number.NEGATIVE_INFINITY;
  if (sort === "drawdown") return result.metrics?.maxDrawdown === undefined ? Number.POSITIVE_INFINITY : -result.metrics.maxDrawdown;
  return result.tradeCount;
}

function FoldPerformanceChart({ report }: { readonly report: WalkForwardResult }): ReactElement {
  const width = 560;
  const height = 130;
  const values = report.folds.map((fold) => fold.outOfSampleMetrics?.totalReturn ?? 0);
  const maximum = Math.max(0.01, ...values.map((value) => Math.abs(value)));
  const zero = height / 2;
  return <div className={styles.strategyChartStack} data-testid="wfa-fold-chart">
    <svg className={styles.strategyCurve} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Walk-Forward out-of-sample fold returns">
      <line x1="0" x2={width} y1={zero} y2={zero} stroke="#64748b" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      {values.map((value, index) => { const x = (index + 0.5) * (width / Math.max(1, values.length)); const barHeight = Math.min(height / 2 - 8, Math.abs(value) / maximum * (height / 2 - 8)); return <rect key={index} x={x - 12} y={value >= 0 ? zero - barHeight : zero} width="24" height={barHeight} fill={value >= 0 ? "#34d399" : "#fb7185"}><title>{`Fold ${index + 1}: ${formatPercent(value)}`}</title></rect>; })}
    </svg>
    <div className={styles.strategyCurveLegend}><span><i className={styles.equityLegend} />Out-of-sample return</span><small>Independent reset-per-fold observations</small></div>
  </div>;
}

export function StrategyOptimizer({ panelId, symbol, timeframe, chart, onApplyParameters, onNotice }: StrategyOptimizerProps): ReactElement {
  const mountedRef = useRef(true);
  const sessionRef = useRef<OptimizationWorkerApi | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const wfaAbortRef = useRef<AbortController | null>(null);
  const wfaTimerRef = useRef<number | null>(null);
  const runTokenRef = useRef(0);
  const [tab, setTab] = useState<OptimizerTab>("optimize");
  const [strategyId, setStrategyId] = useState("EMA_CROSSOVER");
  const [ranges, setRanges] = useState<RangeState>(() => defaultRanges("EMA_CROSSOVER"));
  const [objective, setObjective] = useState<OptimizationObjectiveName>("net-profit");
  const [datasetMode, setDatasetMode] = useState<DatasetMode>("chart");
  const [initialCapital, setInitialCapital] = useState("10000");
  const [sizingType, setSizingType] = useState<SizingType>("fixed-quantity");
  const [sizingValue, setSizingValue] = useState("1");
  const [commissionType, setCommissionType] = useState<CostType>("percent");
  const [commissionValue, setCommissionValue] = useState("0.001");
  const [slippageType, setSlippageType] = useState<CostType>("percent");
  const [slippageValue, setSlippageValue] = useState("0.0005");
  const [maxCandidates, setMaxCandidates] = useState("64");
  const [status, setStatus] = useState<OptimizerStatus>("idle");
  const [progress, setProgress] = useState<OptimizationProgress | null>(null);
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [wfaStatus, setWfaStatus] = useState<OptimizerStatus>("idle");
  const [wfaProgress, setWfaProgress] = useState<WalkForwardProgress | null>(null);
  const [wfaReport, setWfaReport] = useState<WalkForwardResult | null>(null);
  const [wfaMode, setWfaMode] = useState<WalkForwardMode>("anchored");
  const [trainingLength, setTrainingLength] = useState("80");
  const [testLength, setTestLength] = useState("40");
  const [stepSize, setStepSize] = useState("40");
  const [validationLength, setValidationLength] = useState("0");
  const [gapBars, setGapBars] = useState("2");
  const [warmupBars, setWarmupBars] = useState("25");
  const [sort, setSort] = useState<"objective" | "net-profit" | "drawdown" | "trades">("objective");
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const metadata = useMemo(() => strategyMetadata.find((item) => item.id === strategyId) ?? strategyMetadata[0]!, [strategyId]);
  const isOptimizationRunning = status === "initializing" || status === "running";
  const isWfaRunning = wfaStatus === "initializing" || wfaStatus === "running";

  useEffect(() => setRanges(defaultRanges(strategyId)), [strategyId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      runTokenRef.current += 1;
      unsubscribeRef.current?.();
      sessionRef.current?.dispose();
      wfaAbortRef.current?.abort();
      if (wfaTimerRef.current !== null) window.clearTimeout(wfaTimerRef.current);
      unsubscribeRef.current = null;
      sessionRef.current = null;
      wfaAbortRef.current = null;
    };
  }, []);

  const updateRange = (name: string, key: keyof RangeValue, value: string): void => setRanges((current) => ({ ...current, [name]: { ...(current[name] ?? defaultRange(strategyId, name)), [key]: value } }));

  const startOptimization = (): void => {
    if (isOptimizationRunning) return;
    const candles = datasetFor(datasetMode, chart);
    const settings = executionSettings(initialCapital, sizingType, sizingValue, commissionType, commissionValue, slippageType, slippageValue);
    const limit = Number.parseInt(maxCandidates, 10);
    if (candles.length === 0) { setError("The selected dataset is empty or the active chart is not ready."); return; }
    if (!Number.isSafeInteger(limit) || limit < 1) { setError("Maximum candidates must be a positive integer."); return; }
    setError(null); setResult(null); setPage(0); setProgress(null); setStatus("initializing");
    unsubscribeRef.current?.(); sessionRef.current?.dispose();
    const runToken = ++runTokenRef.current;
    try {
      const session = createOptimizationWorker({ strategy: strategyId, candles, searchSpace: parameterSpace(strategyId, ranges), objective, ...settings, limits: { maxCandidates: limit, maxRetainedResults: 0, maxTotalExecutionTimeMs: 120_000 } }, { workerCount: Math.min(2, navigator.hardwareConcurrency ?? 2), candidateTimeoutMs: 30_000, overallTimeoutMs: 120_000 });
      sessionRef.current = session;
      unsubscribeRef.current = session.subscribe((nextStatus: OptimizationWorkerStatus) => { if (!mountedRef.current || runTokenRef.current !== runToken || sessionRef.current !== session) return; setStatus(nextStatus.state); setProgress(nextStatus.progress); if (nextStatus.error !== undefined) setError(nextStatus.error); });
      setStatus("running");
      void session.run().then((nextResult) => { if (!mountedRef.current || runTokenRef.current !== runToken || sessionRef.current !== session) return; setResult(nextResult); setStatus("completed"); setProgress(session.getStatus().progress); onNotice(`${panelId}: optimization ranked ${nextResult.counts.evaluated} candidates on ${nextResult.dataset.barCount} bars.`); }).catch((nextError: unknown) => { if (!mountedRef.current || runTokenRef.current !== runToken || sessionRef.current !== session) return; setStatus(session.getStatus().state); setError(nextError instanceof Error ? nextError.message : String(nextError)); });
    } catch (nextError) { setStatus("failed"); setError(nextError instanceof Error ? nextError.message : String(nextError)); }
  };

  const cancelOptimization = (): void => { sessionRef.current?.cancel(); if (isOptimizationRunning) { setStatus("cancelled"); setError("Optimization cancelled; no partial ranking was retained."); } };

  const startWalkForward = (): void => {
    if (isWfaRunning) return;
    const candles = datasetFor(datasetMode, chart);
    const settings = executionSettings(initialCapital, sizingType, sizingValue, commissionType, commissionValue, slippageType, slippageValue);
    const parseIntField = (value: string): number => Number.parseInt(value, 10);
    const split = { mode: wfaMode, trainingWindowLength: parseIntField(trainingLength), testWindowLength: parseIntField(testLength), stepSize: parseIntField(stepSize), validationWindowLength: parseIntField(validationLength), gapBars: parseIntField(gapBars), warmupBars: parseIntField(warmupBars) } as const;
    const limit = parseIntField(maxCandidates);
    if (candles.length === 0) { setError("The selected dataset is empty or the active chart is not ready."); return; }
    if (![split.trainingWindowLength, split.testWindowLength, split.stepSize, split.validationWindowLength, split.gapBars, split.warmupBars, limit].every(Number.isSafeInteger)) { setError("Walk-Forward window values must be integers."); return; }
    setError(null); setWfaReport(null); setWfaProgress(null); setWfaStatus("initializing");
    wfaAbortRef.current?.abort();
    const abort = new AbortController(); wfaAbortRef.current = abort;
    const runToken = ++runTokenRef.current;
    wfaTimerRef.current = window.setTimeout(() => {
      wfaTimerRef.current = null;
      if (abort.signal.aborted) return;
      try {
        setWfaStatus("running");
        const report = runWalkForward({ strategy: strategyId, candles, searchSpace: parameterSpace(strategyId, ranges), objective, ...settings, limits: { maxCandidates: limit }, split, signal: abort.signal, onProgress: (nextProgress) => { if (mountedRef.current && runTokenRef.current === runToken) setWfaProgress(nextProgress); } });
        if (!mountedRef.current || runTokenRef.current !== runToken) return;
        setWfaReport(report); setWfaStatus("completed"); onNotice(`${panelId}: Walk-Forward evaluated ${report.aggregate.evaluatedFoldCount} out-of-sample folds.`);
      } catch (nextError) {
        if (!mountedRef.current || runTokenRef.current !== runToken) return;
        setWfaStatus(abort.signal.aborted ? "cancelled" : "failed"); setError(nextError instanceof Error ? nextError.message : String(nextError));
      }
    }, 0);
  };

  const cancelWalkForward = (): void => { wfaAbortRef.current?.abort(); if (wfaTimerRef.current !== null) { window.clearTimeout(wfaTimerRef.current); wfaTimerRef.current = null; } if (isWfaRunning) { setWfaStatus("cancelled"); setError("Walk-Forward cancelled; no partial report was retained."); } };

  const visibleCandidates = useMemo(() => {
    if (result === null) return [];
    const filtered = result.rankedCandidates.filter((candidate) => showUnavailable || candidate.objective.available).sort((left, right) => resultValue(right, sort) - resultValue(left, sort));
    return filtered.slice(page * 20, page * 20 + 20);
  }, [page, result, showUnavailable, sort]);
  const selectedCandidate = result?.rankedCandidates.find((candidate) => candidate.objective.available) ?? null;

  return <section className={styles.strategyOptimizer} aria-label={`Strategy Optimizer for ${panelId}`} data-testid="strategy-optimizer">
    <div className={styles.strategyTesterHeading}><div><h2>Strategy Optimizer</h2><small>{panelId} · {symbol} · {timeframe} · deterministic historical analysis</small></div><span className={isOptimizationRunning || isWfaRunning ? styles.strategyRunning : styles.strategyStatus}>{tab === "optimize" ? status : wfaStatus}</span></div>
    <div className={styles.strategyTabs} role="tablist" aria-label="Strategy optimization modes"><button type="button" role="tab" aria-selected={tab === "optimize"} onClick={() => setTab("optimize")}>Grid optimization</button><button type="button" role="tab" aria-selected={tab === "walk-forward"} onClick={() => setTab("walk-forward")}>Walk-Forward</button></div>
    <div className={styles.strategyControls}>
      <fieldset><legend>Strategy and data</legend><label>Strategy<select aria-label="Optimizer strategy" value={strategyId} disabled={isOptimizationRunning || isWfaRunning} onChange={(event) => { setStrategyId(event.target.value); setResult(null); setWfaReport(null); }} >{strategyMetadata.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Dataset<select aria-label="Optimizer dataset" value={datasetMode} disabled={isOptimizationRunning || isWfaRunning} onChange={(event) => setDatasetMode(event.target.value as DatasetMode)}><option value="chart">Active chart history</option><option value="deterministic-100k">Deterministic 100,000 bars</option><option value="deterministic-500k">Deterministic 500,000 bars</option></select></label><p className={styles.strategyDescription}>{metadata.description}</p></fieldset>
      <fieldset><legend>Parameter ranges</legend>{metadata.parameters.map((parameter) => { const range = ranges[parameter.name] ?? defaultRange(strategyId, parameter.name); return <div className={styles.optimizerRange} key={parameter.name}><strong>{parameter.name}</strong><label>Start<input aria-label={`Optimizer ${parameter.name} start`} type="number" value={range.start} min={parameter.min} max={parameter.max} step={parameter.type === "integer" ? 1 : "any"} disabled={isOptimizationRunning || isWfaRunning} onChange={(event) => updateRange(parameter.name, "start", event.target.value)} /></label><label>End<input aria-label={`Optimizer ${parameter.name} end`} type="number" value={range.end} min={parameter.min} max={parameter.max} step={parameter.type === "integer" ? 1 : "any"} disabled={isOptimizationRunning || isWfaRunning} onChange={(event) => updateRange(parameter.name, "end", event.target.value)} /></label><label>Step<input aria-label={`Optimizer ${parameter.name} step`} type="number" min="0.000001" value={range.step} step={parameter.type === "integer" ? 1 : "any"} disabled={isOptimizationRunning || isWfaRunning} onChange={(event) => updateRange(parameter.name, "step", event.target.value)} /></label></div>; })}<small>Every candidate is validated by the built-in StrategyRegistry; invalid and duplicate candidates remain visible in diagnostics.</small></fieldset>
      <fieldset><legend>Objective and execution</legend><label>Objective<select aria-label="Optimizer objective" value={objective} disabled={isOptimizationRunning || isWfaRunning} onChange={(event) => setObjective(event.target.value as OptimizationObjectiveName)}>{objectives.map((item) => <option key={item.name} value={item.name}>{item.label}</option>)}</select></label><label>Max candidates<input aria-label="Optimizer max candidates" type="number" min="1" max="10000" value={maxCandidates} disabled={isOptimizationRunning || isWfaRunning} onChange={(event) => setMaxCandidates(event.target.value)} /></label><label>Initial capital<input aria-label="Optimizer initial capital" type="number" min="0.01" step="0.01" value={initialCapital} disabled={isOptimizationRunning || isWfaRunning} onChange={(event) => setInitialCapital(event.target.value)} /></label><label>Position sizing<select aria-label="Optimizer position sizing" value={sizingType} disabled={isOptimizationRunning || isWfaRunning} onChange={(event) => setSizingType(event.target.value as SizingType)}><option value="fixed-quantity">Fixed quantity</option><option value="fixed-notional">Fixed notional</option><option value="percent-equity">Percent equity</option></select><input aria-label="Optimizer position size" type="number" min="0.000001" step="any" value={sizingValue} disabled={isOptimizationRunning || isWfaRunning} onChange={(event) => setSizingValue(event.target.value)} /></label><label>Commission<select aria-label="Optimizer commission type" value={commissionType} disabled={isOptimizationRunning || isWfaRunning} onChange={(event) => setCommissionType(event.target.value as CostType)}><option value="percent">Percent</option><option value="fixed">Fixed</option></select><input aria-label="Optimizer commission value" type="number" min="0" step="any" value={commissionValue} disabled={isOptimizationRunning || isWfaRunning} onChange={(event) => setCommissionValue(event.target.value)} /></label><label>Slippage<select aria-label="Optimizer slippage type" value={slippageType} disabled={isOptimizationRunning || isWfaRunning} onChange={(event) => setSlippageType(event.target.value as CostType)}><option value="percent">Percent</option><option value="fixed">Fixed</option></select><input aria-label="Optimizer slippage value" type="number" min="0" step="any" value={slippageValue} disabled={isOptimizationRunning || isWfaRunning} onChange={(event) => setSlippageValue(event.target.value)} /></label></fieldset>
      {tab === "walk-forward" ? <fieldset><legend>Walk-Forward split</legend><label>Mode<select aria-label="Walk-Forward mode" value={wfaMode} disabled={isWfaRunning || isOptimizationRunning} onChange={(event) => setWfaMode(event.target.value as WalkForwardMode)}><option value="anchored">Anchored training</option><option value="rolling">Rolling training</option></select></label><label>Training bars<input aria-label="Walk-Forward training bars" type="number" min="1" value={trainingLength} disabled={isWfaRunning || isOptimizationRunning} onChange={(event) => setTrainingLength(event.target.value)} /></label><label>Test bars<input aria-label="Walk-Forward test bars" type="number" min="1" value={testLength} disabled={isWfaRunning || isOptimizationRunning} onChange={(event) => setTestLength(event.target.value)} /></label><label>Step bars<input aria-label="Walk-Forward step bars" type="number" min="1" value={stepSize} disabled={isWfaRunning || isOptimizationRunning} onChange={(event) => setStepSize(event.target.value)} /></label><label>Validation bars<input aria-label="Walk-Forward validation bars" type="number" min="0" value={validationLength} disabled={isWfaRunning || isOptimizationRunning} onChange={(event) => setValidationLength(event.target.value)} /></label><label>Gap bars<input aria-label="Walk-Forward gap bars" type="number" min="0" value={gapBars} disabled={isWfaRunning || isOptimizationRunning} onChange={(event) => setGapBars(event.target.value)} /></label><label>Warmup bars<input aria-label="Walk-Forward warmup bars" type="number" min="0" value={warmupBars} disabled={isWfaRunning || isOptimizationRunning} onChange={(event) => setWarmupBars(event.target.value)} /></label></fieldset> : null}
      <div className={styles.strategyActions}>{tab === "optimize" ? <><button type="button" onClick={startOptimization} disabled={isOptimizationRunning || isWfaRunning || chart === null}>Start optimization</button><button type="button" onClick={cancelOptimization} disabled={!isOptimizationRunning}>Cancel optimization</button></> : <><button type="button" onClick={startWalkForward} disabled={isWfaRunning || isOptimizationRunning || chart === null}>Run Walk-Forward</button><button type="button" onClick={cancelWalkForward} disabled={!isWfaRunning}>Cancel Walk-Forward</button></>} {error === null ? null : <span className={styles.strategyError} role="alert">{error}</span>}</div>
      {tab === "optimize" && progress !== null ? <><progress aria-label="Optimization progress" max="100" value={progress.percentage} /><small>{progressLabel(progress)} · active workers {sessionRef.current?.getStatus().activeWorkers ?? 0}</small></> : null}
      {tab === "walk-forward" && wfaProgress !== null ? <><progress aria-label="Walk-Forward progress" max="100" value={wfaProgress.percentage} /><small>{wfaProgressLabel(wfaProgress)}</small></> : null}
    </div>
    {tab === "optimize" && result !== null ? <div className={styles.strategyResults} data-testid="optimization-results"><div className={styles.strategyActions}><strong>{result.counts.evaluated} evaluated · {result.counts.invalid} invalid · dataset {result.dataset.barCount} bars</strong><label>Sort<select aria-label="Optimization result sort" value={sort} onChange={(event) => { setSort(event.target.value as typeof sort); setPage(0); }}><option value="objective">Objective</option><option value="net-profit">Net profit</option><option value="drawdown">Drawdown</option><option value="trades">Trades</option></select></label><label className={styles.check}><input type="checkbox" aria-label="Show unavailable optimization candidates" checked={showUnavailable} onChange={(event) => setShowUnavailable(event.target.checked)} />Show unavailable</label><button type="button" onClick={() => downloadText(`openkline-${panelId}-optimization.json`, serializeOptimizationReportJson(result, { analysisCompletedAt: new Date().toISOString(), engineVersion: "optimization-v1" }), "application/json")}>Export JSON</button><button type="button" onClick={() => downloadText(`openkline-${panelId}-optimization.csv`, serializeOptimizationLeaderboardCsv(result), "text/csv")}>Export CSV</button></div><div className={styles.strategyTableWrap}><table className={styles.strategyTable}><caption>Ranked candidates (page {page + 1})</caption><thead><tr><th>Rank</th><th>Parameters</th><th>Score</th><th>Net profit</th><th>Drawdown</th><th>Trades</th><th>Action</th></tr></thead><tbody>{visibleCandidates.map((candidate, index) => <tr key={candidate.candidate.candidateId}><td>{page * 20 + index + 1}</td><td><code>{JSON.stringify(candidate.candidate.parameters)}</code></td><td>{candidate.objective.available ? formatNumber(candidate.objective.value) : "Unavailable"}</td><td>{formatNumber(candidate.metrics?.netProfit)}</td><td>{formatNumber(candidate.metrics?.maxDrawdown)}</td><td>{candidate.tradeCount}</td><td>{candidate.objective.available ? <button type="button" onClick={() => onApplyParameters(result.strategyId, candidate.candidate.parameters)}>Apply to Strategy Tester</button> : null}</td></tr>)}</tbody></table></div><div className={styles.strategyActions}><button type="button" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>Previous results</button><button type="button" disabled={(page + 1) * 20 >= result.rankedCandidates.filter((candidate) => showUnavailable || candidate.objective.available).length} onClick={() => setPage((current) => current + 1)}>Next results</button>{selectedCandidate === null ? <small>No candidate met the objective filters.</small> : <small>Best available candidate: {JSON.stringify(selectedCandidate.candidate.parameters)}</small>}</div></div> : tab === "optimize" ? <p className={styles.strategyEmpty}>Configure a bounded search and start a real Worker-backed grid optimization. Results are scoped to this chart panel.</p> : null}
    {tab === "walk-forward" && wfaReport !== null ? <div className={styles.strategyResults} data-testid="walk-forward-results"><div className={styles.strategyMetricGrid}><div><small>Evaluated folds</small><strong>{wfaReport.aggregate.evaluatedFoldCount} / {wfaReport.aggregate.foldCount}</strong></div><div><small>Profitable OOS folds</small><strong>{wfaReport.aggregate.profitableOutOfSampleFoldCount}</strong></div><div><small>Average OOS return</small><strong>{formatPercent(wfaReport.aggregate.averageOutOfSampleReturn)}</strong></div><div><small>Average OOS drawdown</small><strong>{formatNumber(wfaReport.aggregate.averageOutOfSampleDrawdown)}</strong></div><div><small>Mode</small><strong>{wfaReport.aggregate.mode}</strong></div><div><small>Test overlap</small><strong>{wfaReport.aggregate.overlappingTestWindows ? "Yes" : "No"}</strong></div></div><FoldPerformanceChart report={wfaReport} /><div className={styles.strategyActions}><button type="button" onClick={() => downloadText(`openkline-${panelId}-walk-forward.json`, serializeWalkForwardReportJson(wfaReport, { analysisCompletedAt: new Date().toISOString(), engineVersion: "walk-forward-v1" }), "application/json")}>Export WFA JSON</button><button type="button" onClick={() => downloadText(`openkline-${panelId}-walk-forward.csv`, serializeWalkForwardFoldCsv(wfaReport), "text/csv")}>Export fold CSV</button></div><div className={styles.strategyTableWrap}><table className={styles.strategyTable}><caption>Walk-Forward fold timeline and out-of-sample diagnostics</caption><thead><tr><th>Fold</th><th>Train</th><th>Test</th><th>Selected parameters</th><th>Train return</th><th>OOS return</th><th>OOS drawdown</th><th>OOS trades</th></tr></thead><tbody>{wfaReport.folds.map((fold) => <tr key={fold.definition.foldId}><td>{fold.definition.foldId}</td><td>{fold.definition.trainingStartIndex}–{fold.definition.trainingEndIndex}</td><td>{fold.definition.testStartIndex}–{fold.definition.testEndIndex}</td><td><code>{JSON.stringify(fold.selectedCandidate?.parameters ?? null)}</code></td><td>{formatPercent(fold.trainingMetrics?.totalReturn)}</td><td>{formatPercent(fold.outOfSampleMetrics?.totalReturn)}</td><td>{formatNumber(fold.outOfSampleMetrics?.maxDrawdown)}</td><td>{fold.outOfSampleMetrics?.closedTradeCount ?? 0}</td></tr>)}</tbody></table></div>{wfaReport.warnings.map((warning) => <p className={styles.strategyFootnote} key={warning}>Warning: {warning}</p>)}</div> : tab === "walk-forward" ? <p className={styles.strategyEmpty}>Walk-Forward uses strict chronological training and frozen out-of-sample parameters. Its reset-per-fold report is not an executable portfolio equity curve.</p> : null}
  </section>;
}
