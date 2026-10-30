"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import {
  createPortfolioBacktest,
  createPortfolioBacktestWorker,
  createPortfolioBacktestWorkspace,
  projectPortfolioBacktestAsOf,
  serializePortfolioBacktestResult,
  serializePortfolioEquityCsv,
  serializePortfolioOrdersCsv,
  serializePortfolioTradesCsv,
} from "openkline";
import type {
  Candle,
  PortfolioBacktestAsOfResult,
  PortfolioBacktestResult,
  PortfolioBacktestWorkerApi,
  PortfolioBacktestWorkerLike,
  PortfolioBacktestWorkerRunOptions,
  PortfolioBacktestWorkerStatus,
  PortfolioBacktestWorkspaceDocument,
  PortfolioPositionSizing,
} from "openkline";
import styles from "./studio.module.css";

interface PortfolioBacktestingPanelProps {
  readonly initialConfiguration: PortfolioBacktestWorkspaceDocument | null;
  readonly onConfigurationChange: (configuration: PortfolioBacktestWorkspaceDocument) => void;
  readonly onNotice: (message: string) => void;
}

type StrategyId = "EMA_TREND" | "EMA_CROSSOVER";
type SizingId = PortfolioPositionSizing["type"];
type CostId = "percent" | "fixed";

interface StrategyChoice {
  readonly id: StrategyId;
  readonly period: number;
  readonly fastPeriod: number;
  readonly slowPeriod: number;
}

const INSTRUMENTS = [
  { id: "BTC-USD", label: "BTC-USD", base: 64_000 },
  { id: "ETH-USD", label: "ETH-USD", base: 3_200 },
  { id: "AAPL", label: "AAPL", base: 190 },
] as const;
const DEFAULT_SELECTED = INSTRUMENTS.map((item) => item.id);
const DEFAULT_STRATEGIES: Record<string, StrategyChoice> = {
  "BTC-USD": { id: "EMA_CROSSOVER", period: 14, fastPeriod: 5, slowPeriod: 18 },
  "ETH-USD": { id: "EMA_TREND", period: 12, fastPeriod: 5, slowPeriod: 18 },
  AAPL: { id: "EMA_TREND", period: 16, fastPeriod: 5, slowPeriod: 18 },
};

function portfolioCandles(instrumentId: string, count = 240): Candle[] {
  const instrument = INSTRUMENTS.find((item) => item.id === instrumentId) ?? INSTRUMENTS[0]!;
  const seed = [...instrumentId].reduce((total, character) => total + character.charCodeAt(0), 0);
  const interval = 3_600_000;
  const start = Date.UTC(2025, 0, 1) + seed * interval;
  return Array.from({ length: count }, (_, index) => {
    const wave = Math.sin((index + seed) / 7) * instrument.base * 0.025 + Math.sin((index + seed) / 19) * instrument.base * 0.018;
    const trend = Math.sin((index + seed) / 43) * instrument.base * 0.025 + index * instrument.base * 0.00012;
    const close = instrument.base + wave + trend;
    const open = close - Math.sin((index + seed) / 3) * instrument.base * 0.004;
    const spread = instrument.base * (0.003 + ((index + seed) % 5) * 0.00035);
    return { time: start + index * interval, open, high: Math.max(open, close) + spread, low: Math.min(open, close) - spread, close, volume: 1_000 + ((index * 17 + seed) % 100) * 10 };
  });
}

function defaultStrategy(instrumentId: string): StrategyChoice { return { ...(DEFAULT_STRATEGIES[instrumentId] ?? DEFAULT_STRATEGIES["BTC-USD"]!) }; }
function defaultConfiguration(): PortfolioBacktestWorkspaceDocument | null {
  try {
    return createPortfolioBacktestWorkspace({
      accountCurrency: "USD",
      initialCapital: 100_000,
      instruments: DEFAULT_SELECTED.map((id) => ({ id, symbol: id, quoteCurrency: "USD", timeframe: "1h", strategy: defaultStrategy(id).id, parameters: strategyParameters(defaultStrategy(id)), calendar: { id: "UTC-24x7", version: "1" } })),
      positionSizing: { type: "fixed-notional", amount: 5_000 },
      commission: { type: "percent", value: 0.001 },
      slippage: { type: "percent", value: 0.0005 },
      risk: { maxTotalGrossExposure: 30_000, maxActivePositions: 3, minimumAvailableCash: 10_000, maxDrawdownPercent: 0.25, stopNewOrdersOnDrawdown: true },
      valuation: { policy: "last-known-price", maxAgeMs: 7 * 86_400_000, incomplete: "allow" },
    });
  } catch { return null; }
}

function strategyParameters(choice: StrategyChoice): Record<string, number> {
  return choice.id === "EMA_CROSSOVER" ? { fastPeriod: choice.fastPeriod, slowPeriod: choice.slowPeriod } : { period: choice.period };
}

function parseNumber(value: string, fallback = Number.NaN): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatNumber(value: number | null | undefined, digits = 2): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "—" : value.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "—" : `${(value * 100).toFixed(2)}%`;
}

function downloadText(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

const MAX_SYNCHRONOUS_FALLBACK_BARS = 3_000;

function createNextPortfolioBacktestWorker(): PortfolioBacktestWorkerLike {
  if (typeof Worker === "undefined") throw new Error("This browser does not provide Web Workers");
  return new Worker(new URL("./portfolio-backtest-worker.ts", import.meta.url), { type: "module" }) as unknown as PortfolioBacktestWorkerLike;
}

const MAX_EQUITY_POINTS = 800;

function sampleEquityCurve(points: readonly PortfolioBacktestResult["equityCurve"][number][]): readonly PortfolioBacktestResult["equityCurve"][number][] {
  if (points.length <= MAX_EQUITY_POINTS) return points;
  const selected = new Set<number>([0, points.length - 1]);
  const bucketCount = Math.max(1, MAX_EQUITY_POINTS - 2);
  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const start = Math.floor(bucket * points.length / bucketCount);
    const end = Math.max(start + 1, Math.min(points.length, Math.floor((bucket + 1) * points.length / bucketCount)));
    let minimumIndex = start;
    let maximumIndex = start;
    let drawdownIndex = start;
    for (let index = start + 1; index < end; index += 1) {
      const point = points[index]!;
      const minimum = points[minimumIndex]!;
      const maximum = points[maximumIndex]!;
      const drawdown = points[drawdownIndex]!;
      if ((point.equity ?? Number.POSITIVE_INFINITY) < (minimum.equity ?? Number.POSITIVE_INFINITY)) minimumIndex = index;
      if ((point.equity ?? Number.NEGATIVE_INFINITY) > (maximum.equity ?? Number.NEGATIVE_INFINITY)) maximumIndex = index;
      if (Math.abs(point.drawdownPercent ?? 0) > Math.abs(drawdown.drawdownPercent ?? 0)) drawdownIndex = index;
    }
    selected.add(minimumIndex); selected.add(maximumIndex); selected.add(drawdownIndex);
  }
  return [...selected].sort((left, right) => left - right).map((index) => points[index]!);
}

function PortfolioEquityCurve({ result }: { readonly result: PortfolioBacktestResult }): ReactElement {
  const width = 640;
  const height = 150;
  const points = sampleEquityCurve(result.equityCurve.filter((point) => point.equity !== null && Number.isFinite(point.equity)));
  const values = points.map((point) => point.equity as number);
  const minimum = values.reduce((current, value) => Math.min(current, value), Number.POSITIVE_INFINITY);
  const maximum = values.reduce((current, value) => Math.max(current, value), Number.NEGATIVE_INFINITY);
  const span = maximum - minimum || 1;
  const equityPoints = points.map((point, index) => `${(points.length <= 1 ? width / 2 : index / (points.length - 1) * width).toFixed(2)},${(height - ((point.equity as number - minimum) / span) * (height - 12) - 6).toFixed(2)}`).join(" ");
  const drawdownPoints = points.map((point, index) => `${(points.length <= 1 ? width / 2 : index / (points.length - 1) * width).toFixed(2)},${(6 + Math.min(1, Math.abs(point.drawdownPercent ?? 0)) * (height - 12)).toFixed(2)}`).join(" ");
  return <div className={styles.portfolioEquityChart} data-portfolio-equity-curve><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Portfolio equity and drawdown curve"><polyline points={equityPoints} fill="none" stroke="#34d399" strokeWidth="2" vectorEffect="non-scaling-stroke" /><polyline points={drawdownPoints} fill="none" stroke="#fb7185" strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg><small>Equity {formatNumber(minimum)} → {formatNumber(maximum)} · drawdown shown in red · visualized {points.length.toLocaleString()} of {result.equityCurve.length.toLocaleString()} snapshots</small></div>;
}

function choiceFromWorkspace(instrumentId: string, configuration: PortfolioBacktestWorkspaceDocument | null): StrategyChoice {
  const saved = configuration?.instruments.find((item) => item.id === instrumentId);
  const fallback = defaultStrategy(instrumentId);
  if (saved?.strategy === "EMA_CROSSOVER") return { ...fallback, id: "EMA_CROSSOVER", fastPeriod: Number(saved.parameters.fastPeriod) || fallback.fastPeriod, slowPeriod: Number(saved.parameters.slowPeriod) || fallback.slowPeriod };
  if (saved?.strategy === "EMA_TREND") return { ...fallback, id: "EMA_TREND", period: Number(saved.parameters.period) || fallback.period };
  return fallback;
}

export function PortfolioBacktestingPanel({ initialConfiguration, onConfigurationChange, onNotice }: PortfolioBacktestingPanelProps): ReactElement {
  const sessionRef = useRef<PortfolioBacktestWorkerApi | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const configurationKeyRef = useRef<string | null>(null);
  const lastPublishedConfigurationKeyRef = useRef<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>(() => initialConfiguration?.instruments.map((item) => item.id) ?? DEFAULT_SELECTED);
  const [strategies, setStrategies] = useState<Record<string, StrategyChoice>>(() => Object.fromEntries(INSTRUMENTS.map((item) => [item.id, choiceFromWorkspace(item.id, initialConfiguration)])));
  const [initialCapital, setInitialCapital] = useState("100000");
  const [sizingType, setSizingType] = useState<SizingId>("fixed-notional");
  const [sizingValue, setSizingValue] = useState("5000");
  const [commissionType, setCommissionType] = useState<CostId>("percent");
  const [commissionValue, setCommissionValue] = useState("0.001");
  const [slippageType, setSlippageType] = useState<CostId>("percent");
  const [slippageValue, setSlippageValue] = useState("0.0005");
  const [maxExposure, setMaxExposure] = useState("30000");
  const [maxActivePositions, setMaxActivePositions] = useState("3");
  const [minimumCash, setMinimumCash] = useState("10000");
  const [maxDrawdownPercent, setMaxDrawdownPercent] = useState("0.25");
  const [status, setStatus] = useState<PortfolioBacktestWorkerStatus["state"]>("idle");
  const [workerStatus, setWorkerStatus] = useState<PortfolioBacktestWorkerStatus | null>(null);
  const [result, setResult] = useState<PortfolioBacktestResult | null>(null);
  const [asOfResult, setAsOfResult] = useState<PortfolioBacktestAsOfResult | null>(null);
  const [asOfTime, setAsOfTime] = useState("");
  const [resultView, setResultView] = useState<"full" | "as-of">("full");
  const [error, setError] = useState<string | null>(null);
  const [execution, setExecution] = useState<"idle" | "worker" | "fallback">("idle");
  const [tab, setTab] = useState<"overview" | "orders" | "trades" | "equity">("overview");
  const [fractional, setFractional] = useState(false);

  useEffect(() => {
    const key = JSON.stringify(initialConfiguration);
    if (configurationKeyRef.current === key || lastPublishedConfigurationKeyRef.current === key) return;
    configurationKeyRef.current = key;
    if (initialConfiguration === null) return;
    setSelectedIds(initialConfiguration.instruments.map((item) => item.id));
    setStrategies(Object.fromEntries(INSTRUMENTS.map((item) => [item.id, choiceFromWorkspace(item.id, initialConfiguration)])));
    setInitialCapital(String(initialConfiguration.initialCapital));
    setSizingType(initialConfiguration.positionSizing.type);
    setSizingValue(String(initialConfiguration.positionSizing.type === "fixed-quantity" ? initialConfiguration.positionSizing.quantity : initialConfiguration.positionSizing.type === "fixed-notional" ? initialConfiguration.positionSizing.amount : initialConfiguration.positionSizing.type === "percent-equity" ? initialConfiguration.positionSizing.percent : initialConfiguration.positionSizing.weight));
    setCommissionType(initialConfiguration.commission.type); setCommissionValue(String(initialConfiguration.commission.value));
    setSlippageType(initialConfiguration.slippage.type); setSlippageValue(String(initialConfiguration.slippage.value));
    setMaxExposure(String(initialConfiguration.risk.maxTotalGrossExposure ?? "")); setMaxActivePositions(String(initialConfiguration.risk.maxActivePositions ?? "")); setMinimumCash(String(initialConfiguration.risk.minimumAvailableCash ?? "")); setMaxDrawdownPercent(String(initialConfiguration.risk.maxDrawdownPercent ?? ""));
    setFractional(initialConfiguration.instruments.some((item) => item.allowFractionalQuantity === true));
  }, [initialConfiguration]);

  const configuration = useMemo(() => {
    const capital = parseNumber(initialCapital);
    const value = parseNumber(sizingValue);
    if (selectedIds.length < 2 || selectedIds.length > 5 || !Number.isFinite(capital) || capital <= 0 || !Number.isFinite(value) || value <= 0) return null;
    const positionSizing: PortfolioPositionSizing = sizingType === "fixed-quantity" ? { type: "fixed-quantity", quantity: value } : sizingType === "fixed-notional" ? { type: "fixed-notional", amount: value } : sizingType === "percent-equity" ? { type: "percent-equity", percent: value } : { type: "target-weight", weight: value };
    try {
      return createPortfolioBacktestWorkspace({
        accountCurrency: "USD",
        initialCapital: capital,
        instruments: selectedIds.map((id) => { const choice = strategies[id] ?? defaultStrategy(id); return { id, symbol: id, quoteCurrency: "USD", timeframe: "1h", strategy: choice.id, parameters: strategyParameters(choice), calendar: { id: "UTC-24x7", version: "1" }, positionSizing, allowFractionalQuantity: fractional }; }),
        positionSizing,
        commission: { type: commissionType, value: parseNumber(commissionValue, -1) },
        slippage: { type: slippageType, value: parseNumber(slippageValue, -1) },
        risk: { maxTotalGrossExposure: parseNumber(maxExposure, 0), maxActivePositions: parseNumber(maxActivePositions, 0), minimumAvailableCash: parseNumber(minimumCash, 0), maxDrawdownPercent: parseNumber(maxDrawdownPercent, 0), stopNewOrdersOnDrawdown: true },
        valuation: { policy: "last-known-price", maxAgeMs: 7 * 86_400_000, incomplete: "allow" },
      });
    } catch { return null; }
  }, [commissionType, commissionValue, fractional, initialCapital, maxActivePositions, maxDrawdownPercent, maxExposure, minimumCash, selectedIds, sizingType, sizingValue, slippageType, slippageValue, strategies]);

  useEffect(() => {
    if (configuration === null) return;
    const key = JSON.stringify(configuration);
    lastPublishedConfigurationKeyRef.current = key;
    onConfigurationChange(configuration);
  }, [configuration, onConfigurationChange]);

  useEffect(() => () => { unsubscribeRef.current?.(); sessionRef.current?.dispose(); unsubscribeRef.current = null; sessionRef.current = null; }, []);

  const options = useMemo<PortfolioBacktestWorkerRunOptions | null>(() => {
    if (configuration === null) return null;
    return {
      accountCurrency: configuration.accountCurrency,
      initialCapital: configuration.initialCapital,
      instruments: configuration.instruments.map((instrument) => ({ id: instrument.id, symbol: instrument.symbol, quoteCurrency: instrument.quoteCurrency, timeframe: instrument.timeframe, candles: portfolioCandles(instrument.id), strategy: { strategy: instrument.strategy, parameters: instrument.parameters }, ...(instrument.calendar === undefined ? {} : { calendar: instrument.calendar }), execution: { positionSizing: instrument.positionSizing, allowFractionalQuantity: instrument.allowFractionalQuantity } })),
      positionSizing: configuration.positionSizing,
      commission: configuration.commission,
      slippage: configuration.slippage,
      risk: configuration.risk,
      valuation: configuration.valuation,
      allowFractionalQuantity: fractional,
    };
  }, [configuration, fractional]);

  const updateStrategies = (id: string, update: Partial<StrategyChoice>): void => setStrategies((current) => ({ ...current, [id]: { ...(current[id] ?? defaultStrategy(id)), ...update } }));
  const toggleInstrument = (id: string): void => setSelectedIds((current) => current.includes(id) ? current.length <= 2 ? current : current.filter((item) => item !== id) : current.length >= 5 ? current : [...current, id]);

  const run = (): void => {
    if (options === null) { setError("Choose at least two instruments and enter valid positive values before running."); return; }
    unsubscribeRef.current?.(); sessionRef.current?.dispose();
    const session = createPortfolioBacktestWorker(options, { factory: createNextPortfolioBacktestWorker });
    sessionRef.current = session;
    unsubscribeRef.current = session.subscribe((next) => { setWorkerStatus(next); setStatus(next.state); });
    setError(null); setResult(null); setExecution("worker");
    void session.run().then((next) => { setResult(next); setAsOfResult(null); setAsOfTime(""); setResultView("full"); setStatus("completed"); onNotice(`Portfolio backtest completed: ${next.trades.length} trades across ${next.instruments.length} instruments.`); }).catch((reason: unknown) => {
      const code = typeof reason === "object" && reason !== null && "code" in reason ? String((reason as { readonly code?: unknown }).code) : "";
      const totalBars = options.instruments.reduce((total, instrument) => total + instrument.candles.length, 0);
      if ((code === "WORKER_CRASHED" || code === "WORKER_UNAVAILABLE" || code === "TIMEOUT") && totalBars <= MAX_SYNCHRONOUS_FALLBACK_BARS && sessionRef.current === session) {
        try {
          setStatus("running");
          const fallback = createPortfolioBacktest(options);
          const next = fallback.run();
          fallback.dispose();
          setResult(next);
          setError(null);
          setExecution("fallback");
          setStatus("completed");
          onNotice(`Portfolio Worker was unavailable; completed this small deterministic demo on the main thread (${next.trades.length} trades across ${next.instruments.length} instruments).`);
          return;
        } catch (fallbackReason) {
          reason = fallbackReason;
        }
      }
      if ((code === "WORKER_CRASHED" || code === "WORKER_UNAVAILABLE" || code === "TIMEOUT") && totalBars > MAX_SYNCHRONOUS_FALLBACK_BARS) {
        reason = new Error(`Portfolio Worker is unavailable; synchronous fallback is disabled for runs larger than ${MAX_SYNCHRONOUS_FALLBACK_BARS.toLocaleString()} bars`);
      }
      const message = reason instanceof Error ? reason.message : String(reason);
      if (sessionRef.current === session) { setError(message); setStatus(session.getStatus().state); onNotice(`Portfolio backtest failed: ${message}`); }
    }).finally(() => { if (sessionRef.current === session) { unsubscribeRef.current?.(); unsubscribeRef.current = null; session.dispose(); sessionRef.current = null; } });
  };

  const cancel = (): void => { sessionRef.current?.cancel(); setStatus("cancelled"); };
  const viewAsOf = (): void => {
    if (result === null) return;
    const cutoff = Number(asOfTime);
    if (!Number.isSafeInteger(cutoff)) { setError("Enter a safe integer UTC timestamp for the as-of view."); return; }
    try {
      setAsOfResult(projectPortfolioBacktestAsOf(result, cutoff));
      setResultView("as-of");
      setError(null);
      onNotice(`Portfolio report projected causally through ${new Date(cutoff).toISOString()}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };
  const exportResult = (name: string, text: string, type: string): void => downloadText(name, text, type);
  const selectedCount = selectedIds.length;
  const isRunning = status === "running";
  const displayedResult = resultView === "as-of" ? asOfResult : result;
  const metrics = displayedResult?.metrics;
  const firstResultTime = result?.equityCurve.find((point) => point.time !== null)?.time ?? null;
  const lastResultTime = result?.equityCurve.at(-1)?.time ?? null;

  return <section className={styles.portfolioBacktestingPanel} aria-label="Portfolio Backtesting" data-portfolio-status={status} data-portfolio-execution={execution} data-portfolio-result-view={resultView} data-portfolio-instruments={selectedCount} data-portfolio-accepted-orders={displayedResult === null ? undefined : displayedResult.orders.filter((order) => order.status === "filled").length} data-portfolio-rejected-orders={displayedResult === null ? undefined : displayedResult.orders.filter((order) => order.status === "rejected").length} data-portfolio-final-equity={displayedResult?.finalAccount.equity ?? undefined}>
    <div className={styles.paperTradingHeader}><div><h2>Portfolio Backtesting</h2><p>Deterministic shared-capital simulation across multiple instruments. Historical data never leaves this browser.</p></div><span className={styles.portfolioBadge}>LONG-ONLY · NO LEVERAGE</span></div>
    <div className={styles.portfolioControls}>
      <fieldset><legend>Instruments ({selectedCount}/5)</legend>{INSTRUMENTS.map((instrument) => <label className={styles.check} key={instrument.id}><input aria-label={`Portfolio instrument ${instrument.id}`} type="checkbox" checked={selectedIds.includes(instrument.id)} onChange={() => toggleInstrument(instrument.id)} disabled={isRunning || (selectedIds.includes(instrument.id) && selectedCount <= 2)} />{instrument.label}</label>)}</fieldset>
      <fieldset><legend>Capital and sizing</legend><label>Initial capital<input aria-label="Portfolio initial capital" type="number" min="1" value={initialCapital} disabled={isRunning} onChange={(event) => setInitialCapital(event.target.value)} /></label><label>Position sizing<select aria-label="Portfolio position sizing" value={sizingType} disabled={isRunning} onChange={(event) => setSizingType(event.target.value as SizingId)}><option value="fixed-quantity">Fixed quantity</option><option value="fixed-notional">Fixed notional</option><option value="percent-equity">Percent equity</option><option value="target-weight">Target weight</option></select></label><label>Value<input aria-label="Portfolio sizing value" type="number" min="0.000001" step="any" value={sizingValue} disabled={isRunning} onChange={(event) => setSizingValue(event.target.value)} /></label><label className={styles.check}><input aria-label="Allow fractional portfolio quantities" type="checkbox" checked={fractional} disabled={isRunning} onChange={(event) => setFractional(event.target.checked)} />Fractional quantity</label></fieldset>
      <fieldset><legend>Execution costs</legend><label>Commission<select aria-label="Portfolio commission type" value={commissionType} disabled={isRunning} onChange={(event) => setCommissionType(event.target.value as CostId)}><option value="percent">Percent</option><option value="fixed">Fixed</option></select><input aria-label="Portfolio commission value" type="number" min="0" step="any" value={commissionValue} disabled={isRunning} onChange={(event) => setCommissionValue(event.target.value)} /></label><label>Slippage<select aria-label="Portfolio slippage type" value={slippageType} disabled={isRunning} onChange={(event) => setSlippageType(event.target.value as CostId)}><option value="percent">Percent</option><option value="fixed">Fixed</option></select><input aria-label="Portfolio slippage value" type="number" min="0" step="any" value={slippageValue} disabled={isRunning} onChange={(event) => setSlippageValue(event.target.value)} /></label></fieldset>
      <fieldset><legend>Risk limits</legend><label>Max gross exposure<input aria-label="Portfolio max gross exposure" type="number" min="0" step="any" value={maxExposure} disabled={isRunning} onChange={(event) => setMaxExposure(event.target.value)} /></label><label>Max active positions<input aria-label="Portfolio max active positions" type="number" min="1" step="1" value={maxActivePositions} disabled={isRunning} onChange={(event) => setMaxActivePositions(event.target.value)} /></label><label>Minimum cash<input aria-label="Portfolio minimum cash" type="number" min="0" step="any" value={minimumCash} disabled={isRunning} onChange={(event) => setMinimumCash(event.target.value)} /></label><label>Max drawdown<input aria-label="Portfolio max drawdown percent" type="number" min="0" max="1" step="0.01" value={maxDrawdownPercent} disabled={isRunning} onChange={(event) => setMaxDrawdownPercent(event.target.value)} /></label></fieldset>
    </div>
    <div className={styles.portfolioStrategies}><strong>Strategy assignments</strong>{INSTRUMENTS.filter((instrument) => selectedIds.includes(instrument.id)).map((instrument) => { const choice = strategies[instrument.id] ?? defaultStrategy(instrument.id); return <div className={styles.portfolioStrategyRow} key={instrument.id}><span>{instrument.label}</span><select aria-label={`Portfolio strategy ${instrument.id}`} value={choice.id} disabled={isRunning} onChange={(event) => updateStrategies(instrument.id, { id: event.target.value as StrategyId })}><option value="EMA_TREND">EMA trend</option><option value="EMA_CROSSOVER">EMA crossover</option></select>{choice.id === "EMA_CROSSOVER" ? <><label>Fast<input aria-label={`${instrument.id} fast EMA`} type="number" min="1" value={choice.fastPeriod} disabled={isRunning} onChange={(event) => updateStrategies(instrument.id, { fastPeriod: Math.max(1, parseNumber(event.target.value, 1)) })} /></label><label>Slow<input aria-label={`${instrument.id} slow EMA`} type="number" min="2" value={choice.slowPeriod} disabled={isRunning} onChange={(event) => updateStrategies(instrument.id, { slowPeriod: Math.max(2, parseNumber(event.target.value, 2)) })} /></label></> : <label>Period<input aria-label={`${instrument.id} EMA period`} type="number" min="1" value={choice.period} disabled={isRunning} onChange={(event) => updateStrategies(instrument.id, { period: Math.max(1, parseNumber(event.target.value, 1)) })} /></label>}</div>; })}</div>
    <div className={styles.strategyActions}><button type="button" onClick={run} disabled={isRunning || options === null}>Run portfolio backtest</button><button type="button" onClick={cancel} disabled={!isRunning}>Cancel</button><span className={styles.strategyStatus} data-portfolio-progress>{status}{workerStatus === null ? "" : ` · ${workerStatus.processed}/${workerStatus.total} bars · ${workerStatus.filledOrderCount} fills`}</span>{error === null ? null : <p className={styles.strategyError} role="alert">{error}</p>}</div>
    {displayedResult === null ? <p className={styles.strategyEmpty}>Run the offline deterministic scenario to inspect the shared ledger, causal fills, risk rejections, and portfolio-level metrics.</p> : <>
      <div className={styles.portfolioExports}><button type="button" onClick={() => exportResult("openkline-portfolio-result.json", serializePortfolioBacktestResult(displayedResult), "application/json")}>Export JSON</button><button type="button" onClick={() => exportResult("openkline-portfolio-orders.csv", serializePortfolioOrdersCsv(displayedResult), "text/csv")}>Orders CSV</button><button type="button" onClick={() => exportResult("openkline-portfolio-trades.csv", serializePortfolioTradesCsv(displayedResult), "text/csv")}>Trades CSV</button><button type="button" onClick={() => exportResult("openkline-portfolio-equity.csv", serializePortfolioEquityCsv(displayedResult), "text/csv")}>Equity CSV</button></div>
      <div className={styles.strategyFootnote}>Portfolio report timeline is independent from chart replay. Replay does not silently alter these results.</div>
      <div className={styles.portfolioControls}><fieldset><legend>Result presentation</legend><label>As-of UTC timestamp<input aria-label="Portfolio as-of timestamp" type="number" min={firstResultTime ?? undefined} max={lastResultTime ?? undefined} step="1" value={asOfTime} placeholder={firstResultTime === null ? "timestamp" : String(firstResultTime)} onChange={(event) => setAsOfTime(event.target.value)} /></label><button type="button" onClick={viewAsOf} disabled={asOfTime.length === 0}>View causal as-of</button><button type="button" onClick={() => setResultView("full")} disabled={resultView === "full"}>View full run</button><span>{resultView === "as-of" && asOfResult !== null ? `Causal through ${new Date(asOfResult.asOfTime).toISOString()}` : "Complete run"}</span></fieldset></div>
      <div className={styles.strategyMetricGrid} data-portfolio-metrics><div><small>Net profit</small><strong>{formatNumber(metrics?.netProfit)}</strong></div><div><small>Return</small><strong>{formatPercent(metrics?.totalReturn)}</strong></div><div><small>Max drawdown</small><strong>{formatPercent(metrics?.maxDrawdownPercent)}</strong></div><div><small>Trades</small><strong>{metrics?.completedTradeCount ?? 0}</strong></div><div><small>Win rate</small><strong>{formatPercent(metrics?.winRate)}</strong></div><div><small>Fees</small><strong>{formatNumber(metrics?.totalCommissions)}</strong></div></div>
      <PortfolioEquityCurve result={displayedResult} />
      <div className={styles.portfolioTabs} role="tablist" aria-label="Portfolio results"><button type="button" role="tab" aria-selected={tab === "overview"} onClick={() => setTab("overview")}>Overview</button><button type="button" role="tab" aria-selected={tab === "orders"} onClick={() => setTab("orders")}>Orders ({displayedResult.orders.length})</button><button type="button" role="tab" aria-selected={tab === "trades"} onClick={() => setTab("trades")}>Trades ({displayedResult.trades.length})</button><button type="button" role="tab" aria-selected={tab === "equity"} onClick={() => setTab("equity")}>Equity ({displayedResult.equityCurve.length})</button></div>
      {tab === "overview" ? <div className={styles.portfolioTableWrap}><table className={styles.strategyTable}><caption>Per-instrument contribution</caption><thead><tr><th>Instrument</th><th>Realized</th><th>Unrealized</th><th>Fees</th><th>Trades</th><th>Allocation return</th></tr></thead><tbody>{displayedResult.metrics.perInstrument.map((item) => <tr key={item.instrumentId}><td>{item.instrumentId}</td><td>{formatNumber(item.realizedPnl)}</td><td>{formatNumber(item.unrealizedPnl)}</td><td>{formatNumber(item.fees)}</td><td>{item.tradeCount}</td><td>{formatPercent(item.returnOnAllocatedCapital)}</td></tr>)}</tbody></table><p className={styles.strategyFootnote}>Final account: {formatNumber(displayedResult.finalAccount.equity)} {displayedResult.accountCurrency} · {displayedResult.finalAccount.valuationStatus} valuation · fingerprint <code>{displayedResult.inputFingerprint}</code></p></div> : null}
      {tab === "orders" ? <div className={styles.portfolioTableWrap}><table className={styles.strategyTable}><caption>Deterministic order ledger (showing at most 100 rows)</caption><thead><tr><th>Instrument</th><th>Action</th><th>Status</th><th>Quantity</th><th>Fill</th><th>Reason</th></tr></thead><tbody>{displayedResult.orders.slice(0, 100).map((order) => <tr key={order.id}><td>{order.instrumentId}</td><td>{order.action}</td><td>{order.status}</td><td>{formatNumber(order.quantity, 6)}</td><td>{formatNumber(order.executionPrice)}</td><td>{order.reason ?? "—"}</td></tr>)}</tbody></table></div> : null}
      {tab === "trades" ? <div className={styles.portfolioTableWrap}><table className={styles.strategyTable}><caption>Completed trade ledger (showing at most 100 rows)</caption><thead><tr><th>Instrument</th><th>Entry</th><th>Exit</th><th>Quantity</th><th>Net P&amp;L</th><th>Fees</th></tr></thead><tbody>{displayedResult.trades.slice(0, 100).map((trade) => <tr key={trade.id}><td>{trade.instrumentId}</td><td>{formatNumber(trade.entryPrice)}</td><td>{formatNumber(trade.exitPrice)}</td><td>{formatNumber(trade.quantity, 6)}</td><td>{formatNumber(trade.netPnl)}</td><td>{formatNumber(trade.fees)}</td></tr>)}</tbody></table></div> : null}
      {tab === "equity" ? <div className={styles.portfolioTableWrap}><table className={styles.strategyTable}><caption>Shared account equity snapshots (showing the latest 100 rows)</caption><thead><tr><th>Time</th><th>Cash</th><th>Equity</th><th>Gross</th><th>Positions</th><th>Status</th></tr></thead><tbody>{displayedResult.equityCurve.slice(-100).map((point, index) => <tr key={`${point.time ?? "end"}-${index}`}><td>{point.time === null ? "end" : new Date(point.time).toISOString()}</td><td>{formatNumber(point.cash)}</td><td>{formatNumber(point.equity)}</td><td>{formatNumber(point.grossExposure)}</td><td>{point.activePositionCount}</td><td>{point.valuationStatus}</td></tr>)}</tbody></table></div> : null}
    </>}
  </section>;
}

export { defaultConfiguration as createDefaultPortfolioBacktestWorkspace };
