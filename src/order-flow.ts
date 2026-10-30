import { MarketTradeStore, normalizeMarketTrade, type MarketTrade, type MarketTradeDataset, type MarketTradeInput } from "./market-trades.js";
import type { TradingCalendarEngine } from "./trading-calendar.js";

export const OPENKLINE_ORDER_FLOW_VERSION = 1 as const;

export type TradeFlowCoverage = "empty" | "complete-known-side" | "partial-known-side" | "unknown-coverage";
export type TradeFlowResetPolicy = "continuous" | "session";
export type TradeFlowOffTickPolicy = "reject" | "round" | "allow";

export interface TradeFlowInterval {
  readonly from: number;
  readonly to: number;
}

export interface TradeFlowOptions extends TradeFlowInterval {
  readonly asOfTime?: number;
  readonly includeEstimated?: boolean;
  readonly sourceCoverage?: "complete" | "partial" | "unknown";
}

export interface TradeFlowResult extends TradeFlowInterval {
  readonly version: typeof OPENKLINE_ORDER_FLOW_VERSION;
  readonly buyVolume: number;
  readonly sellVolume: number;
  readonly unknownSideVolume: number;
  readonly estimatedSideVolume: number;
  readonly totalVolume: number;
  readonly delta: number;
  readonly tradeCount: number;
  readonly knownSideTradeCount: number;
  readonly unknownSideTradeCount: number;
  readonly coverage: TradeFlowCoverage;
  readonly instrumentId: string | null;
  readonly venueIds: readonly string[];
  readonly sourceIds: readonly string[];
}

export interface CvdOptions extends TradeFlowOptions {
  readonly intervalMs?: number;
  readonly reset?: TradeFlowResetPolicy;
  readonly calendar?: TradingCalendarEngine;
}

export interface CvdObservation {
  readonly time: number;
  readonly bucketStart: number;
  readonly bucketEnd: number;
  readonly delta: number;
  readonly value: number;
  readonly buyVolume: number;
  readonly sellVolume: number;
  readonly unknownSideVolume: number;
  readonly coverage: TradeFlowCoverage;
  readonly sessionId: string | null;
  readonly reset: boolean;
}

export interface CvdResult extends TradeFlowInterval {
  readonly version: typeof OPENKLINE_ORDER_FLOW_VERSION;
  readonly reset: TradeFlowResetPolicy;
  readonly observations: readonly CvdObservation[];
  readonly currentValue: number | null;
  readonly totalDelta: number;
  readonly buyVolume: number;
  readonly sellVolume: number;
  readonly unknownSideVolume: number;
  readonly tradeCount: number;
  readonly coverage: TradeFlowCoverage;
  readonly sessionIds: readonly string[];
}

export interface FootprintCell {
  readonly bucketStart: number;
  readonly bucketEnd: number;
  readonly price: number;
  readonly tickIndex: number | null;
  readonly buyVolume: number;
  readonly sellVolume: number;
  readonly unknownSideVolume: number;
  readonly totalVolume: number;
  readonly delta: number;
  readonly tradeCount: number;
  readonly imbalance: number | null;
}

export interface FootprintBucket {
  readonly start: number;
  readonly end: number;
  readonly buyVolume: number;
  readonly sellVolume: number;
  readonly unknownSideVolume: number;
  readonly totalVolume: number;
  readonly delta: number;
  readonly tradeCount: number;
  readonly coverage: TradeFlowCoverage;
  readonly cells: readonly FootprintCell[];
}

export interface FootprintOptions extends TradeFlowOptions {
  readonly intervalMs?: number;
  readonly tickSize: number;
  readonly offTickPolicy?: TradeFlowOffTickPolicy;
  readonly maxBuckets?: number;
  readonly maxCells?: number;
  readonly imbalanceThreshold?: number;
}

export interface FootprintResult extends TradeFlowInterval {
  readonly version: typeof OPENKLINE_ORDER_FLOW_VERSION;
  readonly tickSize: number;
  readonly offTickPolicy: TradeFlowOffTickPolicy;
  readonly buckets: readonly FootprintBucket[];
  readonly totalBuyVolume: number;
  readonly totalSellVolume: number;
  readonly totalUnknownSideVolume: number;
  readonly totalDelta: number;
  readonly tradeCount: number;
  readonly coverage: TradeFlowCoverage;
}

export interface TimeAndSalesOptions extends TradeFlowInterval {
  readonly asOfTime?: number;
  readonly limit?: number;
}

export interface FootprintDisplayOptions {
  readonly visible?: boolean;
  readonly intervalMs?: number;
  readonly tickSize?: number;
  readonly offTickPolicy?: TradeFlowOffTickPolicy;
  readonly showLabels?: boolean;
  readonly opacity?: number;
  readonly buyColor?: string;
  readonly sellColor?: string;
  readonly unknownColor?: string;
  readonly maxCells?: number;
}

export interface CvdDisplayOptions {
  readonly visible?: boolean;
  readonly intervalMs?: number;
  readonly reset?: TradeFlowResetPolicy;
  readonly pane?: string | "new";
  readonly color?: string;
  readonly lineWidth?: number;
  readonly baselineColor?: string;
  readonly sourceCoverage?: "complete" | "partial" | "unknown";
}

export interface DepthDisplayOptions {
  readonly visible?: boolean;
  readonly maxLevels?: number;
  readonly showLabels?: boolean;
  readonly showHeatmap?: boolean;
  readonly opacity?: number;
  readonly bidColor?: string;
  readonly askColor?: string;
  readonly maxHistory?: number;
}

export interface OrderFlowState {
  readonly tradeCount: number;
  readonly tradeCoverage: TradeFlowCoverage;
  readonly footprint: FootprintResult | null;
  readonly cvd: CvdResult | null;
  readonly depth: import("./order-book.js").OrderBookState | null;
  readonly depthMetrics: import("./market-depth.js").OrderBookDepthMetrics | null;
}

export class OrderFlowValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "OrderFlowValidationError";
  }
}

function safeTime(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new OrderFlowValidationError(`${label} must be a non-negative safe integer timestamp`);
  return value;
}

function range(options: TradeFlowInterval): TradeFlowInterval {
  const from = safeTime(options.from, "from");
  const to = safeTime(options.to, "to");
  if (to <= from) throw new OrderFlowValidationError("Order-flow interval must be non-empty and uses [from, to) semantics");
  return { from, to };
}

function positiveInteger(value: number | undefined, fallback: number, label: string, maximum: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new OrderFlowValidationError(`${label} must be between 1 and ${maximum}`);
  return value;
}

function coverageFor(trades: readonly MarketTrade[], options: TradeFlowOptions, unknownSideVolume: number, estimatedSideVolume: number): TradeFlowCoverage {
  if (trades.length === 0) return "empty";
  if (options.sourceCoverage === "unknown") return "unknown-coverage";
  if (unknownSideVolume > 0 || estimatedSideVolume > 0 || options.sourceCoverage === "partial") return "partial-known-side";
  if (options.sourceCoverage === "complete") return "complete-known-side";
  return "unknown-coverage";
}

function sourceCoverage(dataset: MarketTradeDataset | undefined): "complete" | "partial" | "unknown" | undefined {
  if (dataset === undefined) return undefined;
  return dataset.coverage.complete ? "complete" : dataset.coverage.unknownSideVolume > 0 ? "partial" : "unknown";
}

function canonicalTrades(values: readonly MarketTrade[] | MarketTradeDataset, options: TradeFlowInterval & { readonly asOfTime?: number }): MarketTrade[] {
  const dataset = Array.isArray(values) ? undefined : values as MarketTradeDataset;
  const raw: readonly MarketTrade[] = dataset === undefined ? values as readonly MarketTrade[] : dataset.trades;
  const store = new MarketTradeStore({ maxTrades: Math.max(1, Math.min(1_000_000, raw.length || 1)) });
  if (dataset !== undefined) store.setData(dataset); else store.setData(raw);
  return store.getRange(options.from, options.to, options.asOfTime);
}

function childFlowOptions(options: TradeFlowOptions, from: number, to: number): TradeFlowOptions {
  return {
    from,
    to,
    ...(options.includeEstimated === undefined ? {} : { includeEstimated: options.includeEstimated }),
    ...(options.sourceCoverage === undefined ? {} : { sourceCoverage: options.sourceCoverage }),
  };
}

function cloneTradeInput(value: MarketTradeInput): MarketTrade {
  return normalizeMarketTrade(value);
}

/** Calculate executed trade volume; unknown side is never signed. */
export function calculateTradeFlow(values: readonly MarketTrade[] | MarketTradeDataset, options: TradeFlowOptions): TradeFlowResult {
  const interval = range(options);
  const dataset = Array.isArray(values) ? undefined : values as MarketTradeDataset;
  const trades = canonicalTrades(values, { ...interval, ...(options.asOfTime === undefined ? {} : { asOfTime: safeTime(options.asOfTime, "asOfTime") }) });
  const includeEstimated = options.includeEstimated ?? false;
  let buyVolume = 0;
  let sellVolume = 0;
  let unknownSideVolume = 0;
  let estimatedSideVolume = 0;
  let knownSideTradeCount = 0;
  let unknownSideTradeCount = 0;
  for (const trade of trades) {
    if (trade.aggressorSide === "unknown") {
      unknownSideVolume += trade.quantity;
      unknownSideTradeCount += 1;
    } else if (trade.sideQuality === "estimated" && !includeEstimated) {
      unknownSideVolume += trade.quantity;
      estimatedSideVolume += trade.quantity;
      unknownSideTradeCount += 1;
    } else if (trade.aggressorSide === "buy") {
      buyVolume += trade.quantity;
      knownSideTradeCount += 1;
      if (trade.sideQuality === "estimated") estimatedSideVolume += trade.quantity;
    } else {
      sellVolume += trade.quantity;
      knownSideTradeCount += 1;
      if (trade.sideQuality === "estimated") estimatedSideVolume += trade.quantity;
    }
  }
  const sourceCoverageOption = options.sourceCoverage ?? sourceCoverage(dataset);
  const coverageOptions = sourceCoverageOption === undefined ? options : { ...options, sourceCoverage: sourceCoverageOption };
  return {
    version: OPENKLINE_ORDER_FLOW_VERSION,
    ...interval,
    buyVolume,
    sellVolume,
    unknownSideVolume,
    estimatedSideVolume,
    totalVolume: buyVolume + sellVolume + unknownSideVolume,
    delta: buyVolume - sellVolume,
    tradeCount: trades.length,
    knownSideTradeCount,
    unknownSideTradeCount,
    coverage: coverageFor(trades, coverageOptions, unknownSideVolume, estimatedSideVolume),
    instrumentId: trades[0]?.instrumentId ?? (dataset?.instrumentId ?? null),
    venueIds: [...new Set(trades.map((trade) => trade.venueId).filter((venue): venue is string => venue !== undefined))].sort(),
    sourceIds: [...new Set(trades.map((trade) => `${trade.source.id}@${trade.source.version}`))].sort(),
  };
}

export function calculateCumulativeVolumeDelta(values: readonly MarketTrade[] | MarketTradeDataset, options: CvdOptions): CvdResult {
  const interval = range(options);
  const intervalMs = positiveInteger(options.intervalMs, 60_000, "intervalMs", 86_400_000);
  const reset = options.reset ?? "continuous";
  if (reset === "session" && options.calendar === undefined) throw new OrderFlowValidationError("Session-reset CVD requires an explicit trading calendar");
  const trades = canonicalTrades(values, { ...interval, ...(options.asOfTime === undefined ? {} : { asOfTime: safeTime(options.asOfTime, "asOfTime") }) });
  const buckets = new Map<number, MarketTrade[]>();
  for (const trade of trades) {
    const bucketStart = interval.from + Math.floor((trade.time - interval.from) / intervalMs) * intervalMs;
    const current = buckets.get(bucketStart) ?? [];
    current.push(trade);
    buckets.set(bucketStart, current);
  }
  let value = 0;
  let buyVolume = 0;
  let sellVolume = 0;
  let unknownSideVolume = 0;
  let totalDelta = 0;
  const observations: CvdObservation[] = [];
  const sessionIds = new Set<string>();
  let previousSession: string | null = null;
  const orderedBuckets = [...buckets.keys()].sort((left, right) => left - right);
  for (const bucketStart of orderedBuckets) {
    const bucketTrades = buckets.get(bucketStart)!;
    const flow = calculateTradeFlow(bucketTrades, childFlowOptions(options, bucketStart, Math.min(interval.to, bucketStart + intervalMs)));
    const session = reset === "session" ? options.calendar!.findSessionContaining(bucketTrades[0]!.time) : null;
    const sessionId = session?.id ?? null;
    const didReset = reset === "session" && previousSession !== null && sessionId !== null && previousSession !== sessionId;
    if (didReset) value = 0;
    value += flow.delta;
    buyVolume += flow.buyVolume;
    sellVolume += flow.sellVolume;
    unknownSideVolume += flow.unknownSideVolume;
    totalDelta += flow.delta;
    if (sessionId !== null) sessionIds.add(sessionId);
    previousSession = sessionId ?? previousSession;
    observations.push({
      time: bucketTrades.at(-1)!.time,
      bucketStart,
      bucketEnd: Math.min(interval.to, bucketStart + intervalMs),
      delta: flow.delta,
      value,
      buyVolume: flow.buyVolume,
      sellVolume: flow.sellVolume,
      unknownSideVolume: flow.unknownSideVolume,
      coverage: flow.coverage,
      sessionId,
      reset: didReset,
    });
  }
  const coverage = observations.length === 0 ? "empty" : observations.some((item) => item.coverage === "unknown-coverage") ? "unknown-coverage" : observations.some((item) => item.coverage === "partial-known-side") ? "partial-known-side" : "complete-known-side";
  return {
    version: OPENKLINE_ORDER_FLOW_VERSION,
    ...interval,
    reset,
    observations,
    currentValue: observations.at(-1)?.value ?? null,
    totalDelta,
    buyVolume,
    sellVolume,
    unknownSideVolume,
    tradeCount: trades.length,
    coverage,
    sessionIds: [...sessionIds],
  };
}

export function calculateFootprint(values: readonly MarketTrade[] | MarketTradeDataset, options: FootprintOptions): FootprintResult {
  const interval = range(options);
  const tickSize = options.tickSize;
  if (!Number.isFinite(tickSize) || tickSize <= 0) throw new OrderFlowValidationError("Footprint tickSize must be finite and positive");
  const intervalMs = positiveInteger(options.intervalMs, 60_000, "intervalMs", 86_400_000);
  const maxBuckets = positiveInteger(options.maxBuckets, 10_000, "maxBuckets", 100_000);
  const maxCells = positiveInteger(options.maxCells, 100_000, "maxCells", 1_000_000);
  const offTickPolicy = options.offTickPolicy ?? "reject";
  const trades = canonicalTrades(values, { ...interval, ...(options.asOfTime === undefined ? {} : { asOfTime: safeTime(options.asOfTime, "asOfTime") }) });
  const buckets = new Map<number, Map<string, { price: number; tickIndex: number | null; trades: MarketTrade[] }>>();
  for (const trade of trades) {
    const rawIndex = trade.price / tickSize;
    const tickIndex = Math.round(rawIndex);
    const normalized = tickIndex * tickSize;
    const tolerance = Math.max(Number.EPSILON * Math.max(1, Math.abs(trade.price)), tickSize * 1e-9);
    if (Math.abs(normalized - trade.price) > tolerance && offTickPolicy === "reject") throw new OrderFlowValidationError(`Trade ${trade.id} price ${trade.price} is off tick ${tickSize}`);
    const price = offTickPolicy === "round" ? normalized : trade.price;
    const index = offTickPolicy === "allow" ? null : tickIndex;
    const bucketStart = interval.from + Math.floor((trade.time - interval.from) / intervalMs) * intervalMs;
    if (buckets.size >= maxBuckets && !buckets.has(bucketStart)) throw new OrderFlowValidationError("Footprint bucket limit exceeded");
    const bucket = buckets.get(bucketStart) ?? new Map<string, { price: number; tickIndex: number | null; trades: MarketTrade[] }>();
    const key = index === null ? price.toPrecision(15) : String(index);
    const cell = bucket.get(key) ?? { price, tickIndex: index, trades: [] };
    if (bucket.get(key) === undefined && [...buckets.values()].reduce((sum, item) => sum + item.size, 0) >= maxCells) throw new OrderFlowValidationError("Footprint cell limit exceeded");
    cell.trades.push(trade);
    bucket.set(key, cell);
    buckets.set(bucketStart, bucket);
  }
  const results: FootprintBucket[] = [];
  let totalBuyVolume = 0;
  let totalSellVolume = 0;
  let totalUnknownSideVolume = 0;
  let totalDelta = 0;
  let tradeCount = 0;
  for (const bucketStart of [...buckets.keys()].sort((left, right) => left - right)) {
    const cells: FootprintCell[] = [];
    const bucket = buckets.get(bucketStart)!;
    for (const cell of [...bucket.values()].sort((left, right) => left.price - right.price)) {
      const flow = calculateTradeFlow(cell.trades, childFlowOptions(options, bucketStart, Math.min(interval.to, bucketStart + intervalMs)));
      const denominator = flow.buyVolume + flow.sellVolume;
      cells.push({
        bucketStart,
        bucketEnd: Math.min(interval.to, bucketStart + intervalMs),
        price: cell.price,
        tickIndex: cell.tickIndex,
        buyVolume: flow.buyVolume,
        sellVolume: flow.sellVolume,
        unknownSideVolume: flow.unknownSideVolume,
        totalVolume: flow.totalVolume,
        delta: flow.delta,
        tradeCount: flow.tradeCount,
        imbalance: denominator === 0 ? null : (flow.buyVolume - flow.sellVolume) / denominator,
      });
      totalBuyVolume += flow.buyVolume;
      totalSellVolume += flow.sellVolume;
      totalUnknownSideVolume += flow.unknownSideVolume;
      totalDelta += flow.delta;
      tradeCount += flow.tradeCount;
    }
    const bucketFlow = calculateTradeFlow(cellTrades(bucket), childFlowOptions(options, bucketStart, Math.min(interval.to, bucketStart + intervalMs)));
    results.push({ start: bucketStart, end: Math.min(interval.to, bucketStart + intervalMs), buyVolume: bucketFlow.buyVolume, sellVolume: bucketFlow.sellVolume, unknownSideVolume: bucketFlow.unknownSideVolume, totalVolume: bucketFlow.totalVolume, delta: bucketFlow.delta, tradeCount: bucketFlow.tradeCount, coverage: bucketFlow.coverage, cells });
  }
  const coverage = results.length === 0 ? "empty" : results.some((bucket) => bucket.coverage === "unknown-coverage") ? "unknown-coverage" : results.some((bucket) => bucket.coverage === "partial-known-side") ? "partial-known-side" : "complete-known-side";
  return { version: OPENKLINE_ORDER_FLOW_VERSION, ...interval, tickSize, offTickPolicy, buckets: results, totalBuyVolume, totalSellVolume, totalUnknownSideVolume, totalDelta, tradeCount, coverage };
}

/** Stable event-time ordering for bounded Time & Sales consumers. */
export function getTimeAndSales(values: readonly MarketTrade[] | MarketTradeDataset, options: TimeAndSalesOptions): MarketTrade[] {
  const interval = range(options);
  const limit = positiveInteger(options.limit, 200, "limit", 10_000);
  return canonicalTrades(values, { ...interval, ...(options.asOfTime === undefined ? {} : { asOfTime: safeTime(options.asOfTime, "asOfTime") }) }).slice(-limit).map((trade) => ({ ...trade, source: { ...trade.source } }));
}

export class CumulativeVolumeDeltaCalculator {
  private readonly store: MarketTradeStore;
  private options: CvdOptions;
  private disposed = false;

  public constructor(options: CvdOptions, values: readonly MarketTrade[] | MarketTradeDataset = []) {
    this.options = { ...options };
    this.store = new MarketTradeStore({ maxTrades: 1_000_000 });
    this.store.setData(values);
  }

  public setData(values: readonly MarketTrade[] | MarketTradeDataset): void {
    this.assertAlive();
    this.store.setData(values);
  }

  public update(value: MarketTrade): void {
    this.assertAlive();
    this.store.update(value);
  }

  public setOptions(options: CvdOptions): void {
    this.assertAlive();
    this.options = { ...options };
  }

  public getResult(): CvdResult {
    this.assertAlive();
    return calculateCumulativeVolumeDelta(this.store.getAll(), this.options);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.store.dispose();
  }

  private assertAlive(): void {
    if (this.disposed) throw new OrderFlowValidationError("CumulativeVolumeDeltaCalculator is disposed");
  }
}

export class FootprintCalculator {
  private readonly store: MarketTradeStore;
  private options: FootprintOptions;
  private disposed = false;

  public constructor(options: FootprintOptions, values: readonly MarketTrade[] | MarketTradeDataset = []) {
    this.options = { ...options };
    this.store = new MarketTradeStore({ maxTrades: 1_000_000 });
    this.store.setData(values);
  }

  public setData(values: readonly MarketTrade[] | MarketTradeDataset): void {
    this.assertAlive();
    this.store.setData(values);
  }

  public update(value: MarketTrade): void {
    this.assertAlive();
    this.store.update(value);
  }

  public setOptions(options: FootprintOptions): void {
    this.assertAlive();
    this.options = { ...options };
  }

  public getResult(): FootprintResult {
    this.assertAlive();
    return calculateFootprint(this.store.getAll(), this.options);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.store.dispose();
  }

  private assertAlive(): void {
    if (this.disposed) throw new OrderFlowValidationError("FootprintCalculator is disposed");
  }
}

function cellTrades(bucket: Map<string, { price: number; tickIndex: number | null; trades: MarketTrade[] }>): MarketTrade[] {
  return [...bucket.values()].flatMap((cell) => cell.trades);
}

export function toMarketTradeInput(value: MarketTradeInput): MarketTrade {
  return cloneTradeInput(value);
}

