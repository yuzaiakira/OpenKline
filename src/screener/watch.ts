import { validateCandle } from "../core/candle-store.js";
import { createDefaultIndicatorRegistry, type IndicatorInstance, type IndicatorRegistry, type IndicatorResult } from "../indicators/index.js";
import { canonicalInstrumentIdentity } from "./identity.js";
import { evaluateScreenerRuleSet, screenerIndicatorReferenceKey, validateScreenerRuleSet } from "./rules.js";
import type { ScreenerIndicatorReference, ScreenerRuleNode, ScreenerRuleSet, ScreenerSeriesReference } from "./rule-types.js";
import {
  runScreenerSnapshot,
  type ScreenerSnapshotLimits,
  type ScreenerSnapshotOptions,
  type ScreenerSnapshotResult,
  type ScreenerSymbolSnapshot,
} from "./snapshot.js";
import type { ScreenerBar, ScreenerInstrument, ScreenerMarketDataProvider, ScreenerUniverse } from "./types.js";

export type ScreenerWatchStatus = "idle" | "loading" | "watching" | "paused" | "error" | "disposed";
export type ScreenerWatchEvent = "append" | "correction";

export interface ScreenerWatchUpdate {
  readonly event: ScreenerWatchEvent;
  readonly instrument: ScreenerInstrument;
  readonly bar: ScreenerBar;
  readonly result: ScreenerSymbolSnapshot;
}

export interface ScreenerWatchOptions {
  readonly provider: ScreenerMarketDataProvider;
  readonly universe: ScreenerUniverse;
  readonly ruleSet: ScreenerRuleSet;
  readonly timeframe: string;
  readonly limits?: Partial<ScreenerSnapshotLimits>;
  readonly registry?: IndicatorRegistry;
  readonly onUpdate?: (update: ScreenerWatchUpdate) => void;
  readonly onError?: (instrument: ScreenerInstrument, error: Error) => void;
  readonly onStatus?: (status: ScreenerWatchStatus) => void;
}

export class ScreenerWatchUnavailableError extends Error {
  public constructor(message = "The screener provider does not support realtime subscriptions") {
    super(message);
    this.name = "ScreenerWatchUnavailableError";
  }
}

export class ScreenerWatchLifecycleError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ScreenerWatchLifecycleError";
  }
}

interface InstrumentCache {
  readonly instrument: ScreenerInstrument;
  readonly bars: ScreenerBar[];
  readonly byTime: Map<number, ScreenerBar>;
  readonly indicators: Map<string, IndicatorInstance>;
  readonly indicatorResults: Map<string, IndicatorResult>;
}

/** Incremental screener session. Appends update indicator instances; corrections recalculate only one instrument. */
export class ScreenerWatchSession {
  private options: ScreenerWatchOptions;
  private readonly registry: IndicatorRegistry;
  private status: ScreenerWatchStatus = "idle";
  private generation = 0;
  private controller: AbortController | null = null;
  private readonly subscriptions = new Map<string, () => void>();
  private readonly caches = new Map<string, InstrumentCache>();
  private readonly latestResults = new Map<string, ScreenerSymbolSnapshot>();
  private disposed = false;

  public constructor(options: ScreenerWatchOptions) {
    this.options = options;
    this.registry = options.registry ?? createDefaultIndicatorRegistry();
    validateScreenerRuleSet(options.ruleSet, { registry: this.registry });
  }

  public getStatus(): ScreenerWatchStatus { return this.status; }

  public getResults(): readonly ScreenerSymbolSnapshot[] {
    this.assertAlive();
    return this.options.universe.instruments.map((instrument) => this.latestResults.get(canonicalInstrumentIdentity(instrument))).filter((result): result is ScreenerSymbolSnapshot => result !== undefined);
  }

  public async start(): Promise<ScreenerSnapshotResult> {
    this.assertAlive();
    this.stopSubscriptions();
    this.clearCaches();
    this.controller = new AbortController();
    this.generation = Math.max(1, this.generation + 1);
    this.setStatus("loading");
    try {
      const snapshotOptions: ScreenerSnapshotOptions = {
        provider: this.options.provider,
        universe: this.options.universe,
        ruleSet: this.options.ruleSet,
        timeframe: this.options.timeframe,
        generation: this.generation,
        signal: this.controller.signal,
        ...(this.options.limits === undefined ? {} : { limits: this.options.limits }),
        onInstrumentData: (instrument, bars) => this.seedCache(instrument, bars),
      };
      const snapshot = await runScreenerSnapshot(snapshotOptions);
      if (this.options.provider.subscribeBars === undefined) throw new ScreenerWatchUnavailableError();
      this.subscribeAll();
      this.setStatus("watching");
      return snapshot;
    } catch (error) {
      if (error instanceof ScreenerWatchLifecycleError || error instanceof ScreenerWatchUnavailableError) this.setStatus("error");
      else if (this.controller.signal.aborted) this.setStatus("idle");
      else this.setStatus("error");
      throw error;
    }
  }

  public pause(): void {
    this.assertAlive();
    this.stopSubscriptions();
    if (this.status === "watching" || this.status === "loading") this.setStatus("paused");
  }

  public resume(): void {
    this.assertAlive();
    if (this.options.provider.subscribeBars === undefined) throw new ScreenerWatchUnavailableError();
    this.subscribeAll();
    this.setStatus("watching");
  }

  public async refresh(): Promise<ScreenerSnapshotResult> {
    this.assertAlive();
    return this.start();
  }

  public async changeRuleSet(ruleSet: ScreenerRuleSet): Promise<ScreenerSnapshotResult> {
    this.assertAlive();
    validateScreenerRuleSet(ruleSet, { registry: this.registry });
    this.options = { ...this.options, ruleSet };
    return this.start();
  }

  public async changeUniverse(universe: ScreenerUniverse): Promise<ScreenerSnapshotResult> {
    this.assertAlive();
    this.options = { ...this.options, universe };
    return this.start();
  }

  public cancel(): void {
    this.assertAlive();
    this.controller?.abort();
    this.stopSubscriptions();
    if (this.status !== "idle") this.setStatus("idle");
  }

  public dispose(): void {
    if (this.disposed) return;
    this.controller?.abort();
    this.stopSubscriptions();
    this.clearCaches();
    this.disposed = true;
    this.setStatus("disposed");
  }

  private seedCache(instrument: ScreenerInstrument, bars: readonly ScreenerBar[]): void {
    const identity = canonicalInstrumentIdentity(instrument);
    const cache = this.createCache(instrument);
    for (const bar of bars) {
      cache.byTime.set(bar.candle.time, { ...bar, candle: { ...bar.candle } });
    }
    cache.bars.push(...[...cache.byTime.values()].sort((left, right) => left.candle.time - right.candle.time));
    this.recalculateIndicators(cache);
    this.caches.set(identity, cache);
    const initial = this.evaluateCache(cache);
    if (initial !== null) this.latestResults.set(identity, initial);
  }

  private subscribeAll(): void {
    const subscribe = this.options.provider.subscribeBars;
    if (subscribe === undefined) throw new ScreenerWatchUnavailableError();
    for (const instrument of this.options.universe.instruments) {
      const identity = canonicalInstrumentIdentity(instrument);
      if (this.subscriptions.has(identity)) continue;
      const request = { instrument, timeframe: this.options.timeframe, ...(this.controller === null ? {} : { signal: this.controller.signal }) };
      const unsubscribe = subscribe.call(this.options.provider, request, (bar) => this.handleBar(instrument, bar), (error) => this.handleProviderError(instrument, error));
      this.subscriptions.set(identity, unsubscribe);
    }
  }

  private handleBar(instrument: ScreenerInstrument, bar: ScreenerBar): void {
    if (this.disposed || this.status === "paused" || this.status === "idle") return;
    if (bar.finality !== "confirmed") return;
    try {
      validateCandle(bar.candle);
      if (!Number.isInteger(bar.revision) || bar.revision < 0 || typeof bar.source !== "string" || !Number.isFinite(bar.receivedAt)) throw new Error("Invalid screener bar envelope");
      const identity = canonicalInstrumentIdentity(instrument);
      const cache = this.caches.get(identity) ?? this.createCache(instrument);
      const existing = cache.byTime.get(bar.candle.time);
      if (existing !== undefined && (bar.revision < existing.revision || (bar.revision === existing.revision && sameBar(existing, bar)))) return;
      const previousLatest = cache.bars[cache.bars.length - 1];
      const append = previousLatest === undefined || bar.candle.time > previousLatest.candle.time;
      cache.byTime.set(bar.candle.time, { ...bar, candle: { ...bar.candle } });
      cache.bars.length = 0;
      cache.bars.push(...[...cache.byTime.values()].sort((left, right) => left.candle.time - right.candle.time));
      const maximum = this.options.limits?.maxBarsPerInstrument;
      if (maximum !== undefined && cache.bars.length > maximum) {
        const removed = cache.bars.splice(0, cache.bars.length - maximum);
        for (const old of removed) cache.byTime.delete(old.candle.time);
        this.recalculateIndicators(cache);
      } else if (append && existing === undefined) {
        for (const [key, instance] of cache.indicators) {
          instance.update(bar.candle);
          cache.indicatorResults.set(key, instance.getResult());
        }
      } else {
        this.recalculateIndicators(cache);
      }
      this.caches.set(identity, cache);
      const result = this.evaluateCache(cache);
      if (result === null) return;
      this.latestResults.set(identity, result);
      this.options.onUpdate?.({ event: append && existing === undefined ? "append" : "correction", instrument, bar: { ...bar, candle: { ...bar.candle } }, result });
    } catch (error) {
      this.handleProviderError(instrument, error instanceof Error ? error : new Error(String(error)));
    }
  }

  private evaluateCache(cache: InstrumentCache): ScreenerSymbolSnapshot | null {
    const candles = cache.bars.map((bar) => bar.candle);
    const evaluation = evaluateScreenerRuleSet(this.options.ruleSet, candles, { latestFinality: "confirmed", indicatorResults: cache.indicatorResults, registry: this.registry });
    const latest = cache.bars[cache.bars.length - 1];
    if (latest === undefined) return null;
    const match = evaluation.state === "matched" ? "matched" : evaluation.state === "not-matched" ? "unmatched" : "unavailable";
    const resultId = JSON.stringify({ instrument: canonicalInstrumentIdentity(cache.instrument), ruleSet: this.options.ruleSet.id, timeframe: this.options.timeframe, sourceBarTime: latest.candle.time, sourceBarRevision: latest.revision, generation: this.generation, match, dataStatus: evaluation.state === "unavailable" ? "partial" : "complete", value: evaluation.value, previousValue: evaluation.previousValue, diagnostics: evaluation.diagnostics });
    return {
      resultId,
      instrument: cache.instrument,
      instrumentIdentity: canonicalInstrumentIdentity(cache.instrument),
      ruleSetId: this.options.ruleSet.id,
      timeframe: this.options.timeframe,
      generation: this.generation,
      match,
      dataStatus: evaluation.state === "unavailable" ? "partial" : "complete",
      evaluated: evaluation.state !== "unavailable",
      sourceBarTime: latest.candle.time,
      sourceBarRevision: latest.revision,
      barsEvaluated: cache.bars.length,
      evaluation,
      diagnostics: evaluation.diagnostics.map((diagnostic) => diagnostic.message),
    };
  }

  private recalculateIndicators(cache: InstrumentCache): void {
    const references = collectIndicatorReferences(this.options.ruleSet.root);
    const candles = cache.bars.map((bar) => bar.candle);
    const nextKeys = new Set(references.map(screenerIndicatorReferenceKey));
    for (const [key, instance] of cache.indicators) {
      if (!nextKeys.has(key)) { instance.dispose(); cache.indicators.delete(key); cache.indicatorResults.delete(key); }
    }
    for (const reference of references) {
      const key = screenerIndicatorReferenceKey(reference);
      const instance = cache.indicators.get(key) ?? this.registry.create(reference.indicatorId, reference.parameters);
      if (!cache.indicators.has(key)) cache.indicators.set(key, instance);
      instance.setInput(candles);
      cache.indicatorResults.set(key, instance.getResult());
    }
  }

  private createCache(instrument: ScreenerInstrument): InstrumentCache {
    return { instrument, bars: [], byTime: new Map(), indicators: new Map(), indicatorResults: new Map() };
  }

  private clearCaches(): void {
    for (const cache of this.caches.values()) for (const instance of cache.indicators.values()) instance.dispose();
    this.caches.clear();
    this.latestResults.clear();
  }

  private stopSubscriptions(): void {
    for (const unsubscribe of this.subscriptions.values()) unsubscribe();
    this.subscriptions.clear();
  }

  private handleProviderError(instrument: ScreenerInstrument, error: Error): void {
    this.setStatus("error");
    this.options.onError?.(instrument, error);
  }

  private setStatus(status: ScreenerWatchStatus): void { this.status = status; this.options.onStatus?.(status); }
  private assertAlive(): void { if (this.disposed) throw new ScreenerWatchLifecycleError("Screener watch session has been disposed"); }
}

function collectIndicatorReferences(node: ScreenerRuleNode): ScreenerIndicatorReference[] {
  const references: ScreenerIndicatorReference[] = [];
  const add = (reference: ScreenerIndicatorReference): void => { if (!references.some((item) => screenerIndicatorReferenceKey(item) === screenerIndicatorReferenceKey(reference))) references.push(reference); };
  const series = (reference: ScreenerSeriesReference | { readonly kind: "threshold"; readonly value: number }): void => { if (reference.kind === "indicator") add(reference.reference); };
  switch (node.type) {
    case "group": node.children.forEach((child) => references.push(...collectIndicatorReferences(child).filter((item) => !references.some((existing) => screenerIndicatorReferenceKey(existing) === screenerIndicatorReferenceKey(item))))); break;
    case "not": references.push(...collectIndicatorReferences(node.child)); break;
    case "indicator-threshold": add(node.reference); break;
    case "indicator-cross": series(node.left); series(node.right); break;
    case "indicator-breakout": add(node.channel); break;
    default: break;
  }
  return references;
}

function sameBar(left: ScreenerBar, right: ScreenerBar): boolean {
  return left.candle.time === right.candle.time && left.candle.open === right.candle.open && left.candle.high === right.candle.high && left.candle.low === right.candle.low && left.candle.close === right.candle.close && left.candle.volume === right.candle.volume && left.finality === right.finality && left.source === right.source && left.receivedAt === right.receivedAt;
}

