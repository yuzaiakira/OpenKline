import type { OrderBookPriceLevel, OrderBookState } from "./order-book.js";

export type OrderBookMetricQuality = "available" | "empty" | "stale" | "locked" | "crossed" | "insufficient";

export interface OrderBookDepthMetrics {
  readonly quality: OrderBookMetricQuality;
  readonly reason?: string;
  readonly integrity: OrderBookState["integrity"];
  readonly bestBid: number | null;
  readonly bestAsk: number | null;
  readonly spread: number | null;
  readonly midPrice: number | null;
  readonly topN: number;
  readonly bidDepth: number | null;
  readonly askDepth: number | null;
  /** (bidDepth - askDepth) / (bidDepth + askDepth), or null when unavailable. */
  readonly imbalance: number | null;
  readonly bidConcentration: number | null;
  readonly askConcentration: number | null;
  readonly lastEventTime: number | null;
}

export interface OrderBookDepthMetricOptions {
  readonly topN?: number;
}

export interface OrderBookHeatmapObservation {
  readonly time: number;
  readonly levels: readonly OrderBookPriceLevel[];
  readonly side: "bid" | "ask";
  readonly integrity: OrderBookState["integrity"];
  readonly status: OrderBookState["status"];
}

export interface OrderBookHeatmapOptions {
  readonly maxObservations?: number;
  readonly maxLevels?: number;
  readonly sampleEveryMs?: number;
}

export class MarketDepthValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "MarketDepthValidationError";
  }
}

function limit(value: number | undefined, fallback: number, label: string, maximum: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new MarketDepthValidationError(`${label} must be between 1 and ${maximum}`);
  return value;
}

/**
 * Calculates depth only from a synchronized live book. Stale, empty, locked,
 * and crossed books are explicit quality states rather than ordinary numbers.
 */
export function calculateOrderBookDepthMetrics(state: OrderBookState, options: OrderBookDepthMetricOptions = {}): OrderBookDepthMetrics {
  const topN = limit(options.topN, 5, "topN", 10_000);
  const bids = state.bids.slice(0, topN);
  const asks = state.asks.slice(0, topN);
  const bestBid = bids[0]?.price ?? null;
  const bestAsk = asks[0]?.price ?? null;
  const base = {
    integrity: state.integrity,
    bestBid,
    bestAsk,
    topN,
    lastEventTime: state.lastEventTime,
  } as const;
  if (state.status === "stale" || state.status === "recovering" || state.status === "synchronizing" || state.status === "error") {
    return { ...base, quality: "stale", spread: null, midPrice: null, bidDepth: null, askDepth: null, imbalance: null, bidConcentration: null, askConcentration: null, ...(state.reason === undefined ? {} : { reason: state.reason }) };
  }
  if (bestBid === null || bestAsk === null) return { ...base, quality: "empty", spread: null, midPrice: null, bidDepth: null, askDepth: null, imbalance: null, bidConcentration: null, askConcentration: null, reason: "Both a bid and ask are required" };
  const spread = bestAsk - bestBid;
  if (spread < 0) return { ...base, quality: "crossed", spread, midPrice: null, bidDepth: null, askDepth: null, imbalance: null, bidConcentration: null, askConcentration: null, reason: "Best bid is above best ask" };
  if (spread === 0) return { ...base, quality: "locked", spread, midPrice: bestBid, bidDepth: null, askDepth: null, imbalance: null, bidConcentration: null, askConcentration: null, reason: "Best bid equals best ask" };
  const bidDepth = sumQuantity(bids);
  const askDepth = sumQuantity(asks);
  const denominator = bidDepth + askDepth;
  if (denominator <= 0) return { ...base, quality: "insufficient", spread, midPrice: (bestBid + bestAsk) / 2, bidDepth: null, askDepth: null, imbalance: null, bidConcentration: null, askConcentration: null, reason: "Depth quantities are empty" };
  return {
    ...base,
    quality: "available",
    spread,
    midPrice: (bestBid + bestAsk) / 2,
    bidDepth,
    askDepth,
    imbalance: (bidDepth - askDepth) / denominator,
    bidConcentration: bids[0] === undefined ? null : bids[0].quantity / bidDepth,
    askConcentration: asks[0] === undefined ? null : asks[0].quantity / askDepth,
  };
}

/** Bounded, non-interpolating samples for a displayed-liquidity heatmap. */
export class OrderBookHeatmapStore {
  private readonly maxObservations: number;
  private readonly maxLevels: number;
  private readonly sampleEveryMs: number | undefined;
  private observations: OrderBookHeatmapObservation[] = [];
  private sortedObservations: OrderBookHeatmapObservation[] = [];
  private sortedObservationsDirty = true;
  private disposed = false;

  public constructor(options: OrderBookHeatmapOptions = {}) {
    this.maxObservations = limit(options.maxObservations, 2_000, "maxObservations", 100_000);
    this.maxLevels = limit(options.maxLevels, 100, "maxLevels", 10_000);
    if (options.sampleEveryMs !== undefined && (!Number.isSafeInteger(options.sampleEveryMs) || options.sampleEveryMs < 1)) throw new MarketDepthValidationError("sampleEveryMs must be a positive safe integer");
    this.sampleEveryMs = options.sampleEveryMs;
  }

  public add(state: OrderBookState, time = state.lastEventTime): boolean {
    this.assertAlive();
    if (time === null) return false;
    if (!Number.isSafeInteger(time) || time < 0) throw new MarketDepthValidationError("Heatmap time must be a non-negative safe integer");
    const previous = this.observations.at(-1);
    if (this.sampleEveryMs !== undefined && previous !== undefined && time - previous.time < this.sampleEveryMs) return false;
    const addSide = (side: "bid" | "ask", levels: readonly OrderBookPriceLevel[]): void => {
      this.observations.push({ time, side, levels: levels.slice(0, this.maxLevels).map((level) => ({ ...level })), integrity: state.integrity, status: state.status });
    };
    this.sortedObservationsDirty = true;
    addSide("bid", state.bids);
    addSide("ask", state.asks);
    if (this.observations.length > this.maxObservations) {
      this.observations.splice(0, this.observations.length - this.maxObservations);
      this.sortedObservationsDirty = true;
    }
    return true;
  }

  public getAll(): OrderBookHeatmapObservation[] {
    this.assertAlive();
    return this.observations.map((observation) => ({ ...observation, levels: observation.levels.map((level) => ({ ...level })) }));
  }

  public getRange(from: number, to: number): OrderBookHeatmapObservation[] {
    this.assertAlive();
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from > to) throw new MarketDepthValidationError("Heatmap range must be ascending safe timestamps");
    const ordered = this.getSortedObservations();
    const start = lowerBoundTime(ordered, from);
    const end = upperBoundTime(ordered, to);
    return ordered.slice(start, end).map(cloneObservation);
  }

  public clear(): void {
    this.assertAlive();
    this.observations = [];
    this.sortedObservations = [];
    this.sortedObservationsDirty = false;
  }

  public dispose(): void {
    this.disposed = true;
    this.observations = [];
    this.sortedObservations = [];
    this.sortedObservationsDirty = false;
  }

  private getSortedObservations(): readonly OrderBookHeatmapObservation[] {
    if (this.sortedObservationsDirty) {
      this.sortedObservations = [...this.observations].sort((left, right) => left.time - right.time || (left.side === right.side ? 0 : left.side === "bid" ? -1 : 1));
      this.sortedObservationsDirty = false;
    }
    return this.sortedObservations;
  }

  private assertAlive(): void {
    if (this.disposed) throw new MarketDepthValidationError("OrderBookHeatmapStore is disposed");
  }
}

function sumQuantity(levels: readonly OrderBookPriceLevel[]): number {
  return levels.reduce((sum, level) => sum + level.quantity, 0);
}

function cloneObservation(observation: OrderBookHeatmapObservation): OrderBookHeatmapObservation {
  return { ...observation, levels: observation.levels.map((level) => ({ ...level })) };
}

function lowerBoundTime(values: readonly OrderBookHeatmapObservation[], time: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (values[middle]!.time < time) low = middle + 1;
    else high = middle;
  }
  return low;
}

function upperBoundTime(values: readonly OrderBookHeatmapObservation[], time: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (values[middle]!.time <= time) low = middle + 1;
    else high = middle;
  }
  return low;
}

