import { CandleStore, validateCandle } from "./core/candle-store.js";
import { ComparisonEngine } from "./comparison.js";
import type {
  ComparisonAssetOutput,
  ComparisonBaseline,
  ComparisonNormalizationMode,
  ComparisonPricePoint,
} from "./comparison.js";
import type { Candle, Datafeed, SymbolInfo } from "./types.js";

export interface ComparisonDatafeedWindow {
  /** Inclusive lower UTC millisecond bound for requested historical bars. */
  readonly from: number;
  /** Exclusive upper UTC millisecond bound, matching `Datafeed.getBars`. */
  readonly to: number;
}

export interface ComparisonDatafeedAsset {
  readonly id: string;
  readonly datafeed: Datafeed;
  readonly symbol: string;
  /** Each asset may use a different timeframe when explicitly configured. */
  readonly timeframe: string;
  readonly label?: string;
  readonly color?: string;
}

export interface ComparisonDatafeedControllerOptions {
  readonly window: ComparisonDatafeedWindow;
  readonly mode?: ComparisonNormalizationMode;
  readonly baseline?: ComparisonBaseline | null;
}

export type ComparisonDatafeedAssetState = "registered" | "loading" | "ready" | "empty" | "error";
export type ComparisonDatafeedOverallState = "idle" | "loading" | "ready" | "partial" | "empty" | "error" | "disposed";
export type ComparisonDatafeedRealtimeState = "idle" | "subscribed" | "unsupported" | "stopped" | "error";

export interface ComparisonDatafeedAssetStatus {
  readonly id: string;
  readonly symbol: string;
  readonly timeframe: string;
  readonly resolvedSymbol: string | null;
  readonly state: ComparisonDatafeedAssetState;
  readonly realtime: ComparisonDatafeedRealtimeState;
  /** Count of acquired raw candles, including candles beyond the initial window from realtime updates. */
  readonly pointCount: number;
  /** Count of normalized points currently visible after replay masking. */
  readonly visiblePointCount: number;
  readonly baselineTime: number | null;
  readonly baselinePrice: number | null;
  readonly error: string | null;
}

export interface ComparisonDatafeedState {
  readonly status: ComparisonDatafeedOverallState;
  readonly window: ComparisonDatafeedWindow;
  readonly mode: ComparisonNormalizationMode;
  readonly baseline: ComparisonBaseline | null;
  readonly replayCutoff: number | null;
  readonly assets: readonly ComparisonDatafeedAssetStatus[];
}

export interface ComparisonDatafeedLoadOptions {
  readonly signal?: AbortSignal;
}

export interface ComparisonDatafeedLoadResult {
  readonly status: Exclude<ComparisonDatafeedOverallState, "idle" | "loading" | "disposed"> | "cancelled";
  readonly assets: readonly ComparisonDatafeedAssetStatus[];
}

export type ComparisonDatafeedChangeKind =
  | "asset-added"
  | "asset-removed"
  | "asset-replaced"
  | "load-started"
  | "asset-ready"
  | "asset-empty"
  | "asset-error"
  | "realtime-updated"
  | "realtime-error"
  | "load-cancelled"
  | "load-completed"
  | "window-changed"
  | "mode-changed"
  | "baseline-changed"
  | "replay-changed"
  | "disposed";

export interface ComparisonDatafeedChange {
  readonly kind: ComparisonDatafeedChangeKind;
  readonly assetId?: string;
  readonly error?: string;
}

export type ComparisonDatafeedChangeListener = (change: ComparisonDatafeedChange) => void;

interface AssetRecord {
  readonly config: ComparisonDatafeedAsset;
  readonly candles: CandleStore;
  readonly rawByTime: Map<number, Candle>;
  token: number;
  state: ComparisonDatafeedAssetState;
  realtime: ComparisonDatafeedRealtimeState;
  resolvedSymbol: string | null;
  error: string | null;
  unsubscribe: (() => void) | null;
}

interface ActiveLoad {
  readonly generation: number;
  readonly controller: AbortController;
  readonly records: readonly AssetRecord[];
}

/**
 * Provider-neutral coordinator for loading and streaming several comparison
 * assets into one existing `ComparisonEngine`.
 *
 * The coordinator owns transport lifecycles and raw OHLCV snapshots. The
 * comparison engine remains the only implementation of percentage/indexed
 * normalization and baseline selection.
 */
export class ComparisonDatafeedController {
  private readonly engine: ComparisonEngine;
  private readonly assets = new Map<string, AssetRecord>();
  private readonly listeners = new Set<ComparisonDatafeedChangeListener>();
  private window: ComparisonDatafeedWindow;
  private mode: ComparisonNormalizationMode;
  private baseline: ComparisonBaseline | null;
  private replayCutoff: number | null = null;
  private activeLoad: ActiveLoad | null = null;
  private loadGeneration = 0;
  private disposed = false;

  public constructor(options: ComparisonDatafeedControllerOptions) {
    this.window = normalizeWindow(options.window);
    this.mode = options.mode ?? "percentage";
    this.baseline = options.baseline === undefined || options.baseline === null
      ? null
      : normalizeBaseline(options.baseline);
    this.engine = new ComparisonEngine({
      mode: this.mode,
      ...(this.baseline === null ? {} : { baseline: this.baseline }),
    });
  }

  /** Register an asset. Registration is synchronous; call `load()` to acquire history. */
  public registerAsset(input: ComparisonDatafeedAsset): void {
    this.assertAlive();
    this.cancelActiveLoad();
    const config = normalizeAsset(input);
    if (this.assets.has(config.id)) throw new Error(`Comparison datafeed asset already exists: ${config.id}`);
    const record: AssetRecord = {
      config,
      candles: new CandleStore(),
      rawByTime: new Map(),
      token: 0,
      state: "registered",
      realtime: "idle",
      resolvedSymbol: null,
      error: null,
      unsubscribe: null,
    };
    this.assets.set(config.id, record);
    this.engine.addAsset({
      id: config.id,
      data: [],
      ...(config.label === undefined ? {} : { label: config.label }),
      ...(config.color === undefined ? {} : { color: config.color }),
    });
    this.emit({ kind: "asset-added", assetId: config.id });
  }

  /** Alias for consumers that use the shorter asset-registration vocabulary. */
  public addAsset(input: ComparisonDatafeedAsset): void {
    this.registerAsset(input);
  }

  public removeAsset(id: string): boolean {
    this.assertAlive();
    this.cancelActiveLoad();
    const normalizedId = normalizeAssetId(id);
    const record = this.assets.get(normalizedId);
    if (record === undefined) return false;
    record.token += 1;
    this.stopSubscription(record);
    this.assets.delete(normalizedId);
    this.engine.removeAsset(normalizedId);
    this.emit({ kind: "asset-removed", assetId: normalizedId });
    return true;
  }

  /** Replace an asset's provider, symbol, timeframe, or display metadata and reload all registered assets. */
  public async replaceAsset(input: ComparisonDatafeedAsset): Promise<ComparisonDatafeedLoadResult>;
  public async replaceAsset(id: string, input: Omit<ComparisonDatafeedAsset, "id">): Promise<ComparisonDatafeedLoadResult>;
  public async replaceAsset(
    inputOrId: ComparisonDatafeedAsset | string,
    nextInput?: Omit<ComparisonDatafeedAsset, "id">,
  ): Promise<ComparisonDatafeedLoadResult> {
    this.assertAlive();
    const input: ComparisonDatafeedAsset = typeof inputOrId === "string"
      ? nextInput === undefined ? (() => { throw new Error("Replacement asset configuration is required"); })() : { id: inputOrId, ...nextInput }
      : inputOrId;
    const normalized = normalizeAsset(input);
    const existing = this.assets.has(normalized.id);
    if (existing) this.removeAsset(normalized.id);
    this.registerAsset(normalized);
    this.emit({ kind: "asset-replaced", assetId: normalized.id });
    return this.load();
  }

  /** Load all registered assets. Provider failures are isolated and reported in per-asset state. */
  public async load(options: ComparisonDatafeedLoadOptions = {}): Promise<ComparisonDatafeedLoadResult> {
    this.assertAlive();
    this.cancelActiveLoad();
    const generation = ++this.loadGeneration;
    const controller = new AbortController();
    const removeAbortListener = connectAbortSignal(options.signal, controller);
    const records = [...this.assets.values()];
    this.activeLoad = { generation, controller, records };
    for (const record of records) this.prepareRecordForLoad(record);
    this.emit({ kind: "load-started" });

    await Promise.all(records.map((record) => this.loadRecord(record, generation, controller.signal)));
    removeAbortListener();

    if (this.disposed || this.activeLoad?.generation !== generation || controller.signal.aborted) {
      if (!this.disposed && this.activeLoad?.generation === generation) {
        this.activeLoad = null;
        this.restoreCancelledRecords(records);
        this.emit({ kind: "load-cancelled" });
      }
      return { status: "cancelled", assets: this.disposed ? [] : this.getAssetStatuses() };
    }

    this.activeLoad = null;
    const status = this.overallStatus();
    this.emit({ kind: "load-completed" });
    return { status: status === "idle" || status === "loading" || status === "disposed" ? "empty" : status, assets: this.getAssetStatuses() };
  }

  /** Explicitly abort current history requests and leave the coordinator reusable. */
  public cancel(): void {
    this.assertAlive();
    this.cancelActiveLoad();
  }

  /** Change the shared historical window and reload all assets. */
  public setWindow(window: ComparisonDatafeedWindow): Promise<ComparisonDatafeedLoadResult> {
    this.assertAlive();
    const next = normalizeWindow(window);
    if (next.from === this.window.from && next.to === this.window.to) return this.load();
    this.window = next;
    this.emit({ kind: "window-changed" });
    return this.load();
  }

  /** Alias for callers that describe the historical request as a range. */
  public setRange(window: ComparisonDatafeedWindow): Promise<ComparisonDatafeedLoadResult> {
    return this.setWindow(window);
  }

  public getWindow(): ComparisonDatafeedWindow {
    return { ...this.window };
  }

  public setMode(mode: ComparisonNormalizationMode): void {
    this.assertAlive();
    if (mode !== "percentage" && mode !== "indexed") throw new Error(`Unsupported comparison mode: ${String(mode)}`);
    if (this.mode === mode) return;
    this.mode = mode;
    this.engine.setMode(mode);
    this.emit({ kind: "mode-changed" });
  }

  public getMode(): ComparisonNormalizationMode {
    return this.mode;
  }

  public setBaseline(baseline: ComparisonBaseline | null): void {
    this.assertAlive();
    this.baseline = baseline === null ? null : normalizeBaseline(baseline);
    this.engine.setBaseline(this.baseline?.time ?? null, this.baseline === null ? {} : { maxAgeMs: this.baseline.maxAgeMs });
    this.emit({ kind: "baseline-changed" });
  }

  public setBaselineTime(time: number | null, options: { readonly maxAgeMs?: number } = {}): void {
    this.setBaseline(time === null ? null : { time, maxAgeMs: options.maxAgeMs ?? this.baseline?.maxAgeMs ?? 0 });
  }

  public getBaseline(): ComparisonBaseline | null {
    return this.baseline === null ? null : { ...this.baseline };
  }

  /** Hide acquired observations newer than a replay cursor without mutating provider data. */
  public setReplayCutoff(time: number | null): void {
    this.assertAlive();
    const next = time === null ? null : normalizeTime(time);
    if (next === this.replayCutoff) return;
    this.replayCutoff = next;
    this.emit({ kind: "replay-changed" });
  }

  public getReplayCutoff(): number | null {
    return this.replayCutoff;
  }

  public getNormalizedData(): ComparisonAssetOutput[] {
    this.assertAlive();
    const normalized = this.engine.getNormalizedData();
    if (this.replayCutoff === null) return normalized;
    return normalized.map((asset) => ({
      ...asset,
      data: asset.data.filter((point) => point.time <= this.replayCutoff!),
    }));
  }

  /** Return the raw acquired OHLCV candles for one asset, defensively copied. */
  public getRawCandles(id: string): Candle[] {
    this.assertAlive();
    return this.requireAsset(id).candles.getAll();
  }

  /** Return the raw close observations held by the underlying comparison engine. */
  public getRawData(id: string): ComparisonPricePoint[] {
    this.assertAlive();
    return this.engine.getRawData(normalizeAssetId(id));
  }

  public getAssetStatuses(): ComparisonDatafeedAssetStatus[] {
    this.assertAlive();
    const outputs = new Map(this.getNormalizedData().map((asset) => [asset.id, asset]));
    const engineStatuses = new Map(this.engine.getStatus().map((asset) => [asset.id, asset]));
    return [...this.assets.values()].map((record) => {
      const engineStatus = engineStatuses.get(record.config.id);
      const output = outputs.get(record.config.id);
      return {
        id: record.config.id,
        symbol: record.config.symbol,
        timeframe: record.config.timeframe,
        resolvedSymbol: record.resolvedSymbol,
        state: record.state,
        realtime: record.realtime,
        pointCount: record.candles.length,
        visiblePointCount: output?.data.length ?? 0,
        baselineTime: engineStatus?.baselineTime ?? null,
        baselinePrice: engineStatus?.baselinePrice ?? null,
        error: record.error,
      };
    });
  }

  public getState(): ComparisonDatafeedState {
    if (this.disposed) {
      return {
        status: "disposed",
        window: { ...this.window },
        mode: this.mode,
        baseline: this.baseline === null ? null : { ...this.baseline },
        replayCutoff: this.replayCutoff,
        assets: [],
      };
    }
    return {
      status: this.overallStatus(),
      window: { ...this.window },
      mode: this.mode,
      baseline: this.baseline === null ? null : { ...this.baseline },
      replayCutoff: this.replayCutoff,
      assets: this.getAssetStatuses(),
    };
  }

  /** Alias used by consumers that treat the coordinator as a stateful data source. */
  public getStatus(): ComparisonDatafeedState {
    return this.getState();
  }

  public subscribe(listener: ComparisonDatafeedChangeListener): () => void {
    this.assertAlive();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.activeLoad?.controller.abort();
    this.activeLoad = null;
    for (const record of this.assets.values()) {
      record.token += 1;
      this.stopSubscription(record);
    }
    this.engine.dispose();
    this.emit({ kind: "disposed" });
    this.assets.clear();
    this.listeners.clear();
  }

  private async loadRecord(record: AssetRecord, generation: number, signal: AbortSignal): Promise<void> {
    if (!this.isCurrentLoad(record, generation)) return;
    try {
      throwIfAborted(signal);
      const info = await awaitWithAbort(record.config.datafeed.resolveSymbol(record.config.symbol, signal), signal);
      if (!this.isCurrentLoad(record, generation)) return;
      throwIfAborted(signal);
      validateSymbolInfo(info);
      record.resolvedSymbol = info.symbol;
      const baseline = this.baseline;
      const requestFrom = Math.min(this.window.from, baseline?.time ?? this.window.from);
      const bars = await awaitWithAbort(record.config.datafeed.getBars({
        symbol: record.config.symbol,
        timeframe: record.config.timeframe,
        from: requestFrom,
        to: this.window.to,
        signal,
      }), signal);
      if (!this.isCurrentLoad(record, generation)) return;
      throwIfAborted(signal);
      const candles = normalizeHistoricalCandles(bars, requestFrom, this.window.to);
      record.candles.setData(candles);
      record.rawByTime.clear();
      for (const candle of candles) record.rawByTime.set(candle.time, candle);
      this.engine.replaceAssetData(record.config.id, candles.map(toComparisonPoint));
      record.state = candles.length === 0 ? "empty" : "ready";
      record.error = null;
      this.startSubscription(record);
      this.emit({ kind: candles.length === 0 ? "asset-empty" : "asset-ready", assetId: record.config.id });
    } catch (error) {
      if (!this.isCurrentLoad(record, generation) || isAbortError(error)) return;
      const normalized = toError(error);
      this.stopSubscription(record);
      this.clearRecordData(record);
      record.state = "error";
      record.error = normalized.message;
      this.emit({ kind: "asset-error", assetId: record.config.id, error: normalized.message });
    }
  }

  private prepareRecordForLoad(record: AssetRecord): void {
    record.token += 1;
    this.stopSubscription(record);
    this.clearRecordData(record);
    record.state = "loading";
    record.realtime = "stopped";
    record.resolvedSymbol = null;
    record.error = null;
  }

  private startSubscription(record: AssetRecord): void {
    const subscribeBars = record.config.datafeed.subscribeBars;
    if (subscribeBars === undefined) {
      record.realtime = "unsupported";
      return;
    }
    const token = record.token;
    try {
      const unsubscribe = subscribeBars.call(record.config.datafeed, {
        symbol: record.config.symbol,
        timeframe: record.config.timeframe,
        onBar: (bar) => this.handleRealtime(record.config.id, token, bar),
        onError: (error) => this.handleRealtimeError(record.config.id, token, error),
      });
      if (typeof unsubscribe !== "function") throw new Error("Datafeed subscribeBars must return an unsubscribe function");
      if (!this.isCurrentRecord(record, token)) {
        try { unsubscribe(); } catch { /* A stale provider owns any cleanup failure. */ }
        return;
      }
      record.unsubscribe = unsubscribe;
      record.realtime = "subscribed";
    } catch (error) {
      record.realtime = "error";
      record.error = toError(error).message;
      this.emit({ kind: "realtime-error", assetId: record.config.id, error: record.error });
    }
  }

  private handleRealtime(id: string, token: number, bar: Candle): void {
    const record = this.assets.get(id);
    if (record === undefined || !this.isCurrentRecord(record, token)) return;
    try {
      validateRealtimeCandle(bar);
      if (bar.time < this.window.from) return;
      const previous = record.rawByTime.get(bar.time);
      if (previous !== undefined && sameCandle(previous, bar)) return;
      const normalized = { ...bar };
      this.engine.updateAsset(id, toComparisonPoint(normalized));
      record.candles.update(normalized);
      record.rawByTime.set(normalized.time, normalized);
      record.state = "ready";
      record.error = null;
      this.emit({ kind: "realtime-updated", assetId: id });
    } catch (error) {
      this.handleRealtimeError(id, token, error);
    }
  }

  private handleRealtimeError(id: string, token: number, error: unknown): void {
    const record = this.assets.get(id);
    if (record === undefined || !this.isCurrentRecord(record, token)) return;
    const normalized = toError(error);
    record.realtime = "error";
    record.error = normalized.message;
    this.emit({ kind: "realtime-error", assetId: id, error: normalized.message });
  }

  private clearRecordData(record: AssetRecord): void {
    record.candles.setData([]);
    record.rawByTime.clear();
    this.engine.replaceAssetData(record.config.id, []);
  }

  private restoreCancelledRecords(records: readonly AssetRecord[]): void {
    for (const record of records) {
      if (record.state !== "loading") continue;
      record.state = record.candles.length === 0 ? "registered" : "ready";
      record.realtime = record.unsubscribe === null ? "stopped" : "subscribed";
      record.error = null;
    }
  }

  private cancelActiveLoad(): void {
    const active = this.activeLoad;
    if (active === null) return;
    active.controller.abort();
    this.loadGeneration += 1;
    this.activeLoad = null;
    this.restoreCancelledRecords(active.records);
    this.emit({ kind: "load-cancelled" });
  }

  private isCurrentLoad(record: AssetRecord, generation: number): boolean {
    return !this.disposed && this.activeLoad?.generation === generation && this.assets.get(record.config.id) === record;
  }

  private isCurrentRecord(record: AssetRecord, token: number): boolean {
    return !this.disposed && this.assets.get(record.config.id) === record && record.token === token;
  }

  private stopSubscription(record: AssetRecord): void {
    const unsubscribe = record.unsubscribe;
    record.unsubscribe = null;
    if (unsubscribe === null) return;
    try { unsubscribe(); } catch (error) {
      record.realtime = "error";
      record.error = toError(error).message;
    }
  }

  private requireAsset(id: string): AssetRecord {
    const record = this.assets.get(normalizeAssetId(id));
    if (record === undefined) throw new Error(`Unknown comparison datafeed asset: ${normalizeAssetId(id)}`);
    return record;
  }

  private overallStatus(): ComparisonDatafeedOverallState {
    if (this.disposed) return "disposed";
    const records = [...this.assets.values()];
    if (records.length === 0) return this.activeLoad === null ? "idle" : "empty";
    if (records.some((record) => record.state === "loading")) return "loading";
    const ready = records.filter((record) => record.state === "ready").length;
    const empty = records.filter((record) => record.state === "empty").length;
    const failed = records.filter((record) => record.state === "error").length;
    const registered = records.filter((record) => record.state === "registered").length;
    if (registered > 0) return "idle";
    if (ready === records.length) return "ready";
    if (failed === records.length) return "error";
    if (empty === records.length) return "empty";
    if (ready > 0 || (empty > 0 && failed > 0)) return "partial";
    return "error";
  }

  private emit(change: ComparisonDatafeedChange): void {
    for (const listener of [...this.listeners]) listener(change);
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error("ComparisonDatafeedController has been disposed");
  }
}

function normalizeAsset(input: ComparisonDatafeedAsset): ComparisonDatafeedAsset {
  if (typeof input !== "object" || input === null) throw new Error("Comparison datafeed asset must be an object");
  const id = normalizeAssetId(input.id);
  const symbol = normalizeText(input.symbol, "Comparison datafeed symbol");
  const timeframe = normalizeText(input.timeframe, "Comparison datafeed timeframe");
  if (typeof input.datafeed !== "object" || input.datafeed === null) throw new Error(`Datafeed is required for asset ${id}`);
  if (input.label !== undefined && normalizeText(input.label, "Comparison datafeed label").length === 0) throw new Error(`Invalid label for asset ${id}`);
  if (input.color !== undefined && normalizeText(input.color, "Comparison datafeed color").length === 0) throw new Error(`Invalid color for asset ${id}`);
  return {
    id,
    datafeed: input.datafeed,
    symbol,
    timeframe,
    ...(input.label === undefined ? {} : { label: input.label.trim() }),
    ...(input.color === undefined ? {} : { color: input.color.trim() }),
  };
}

function normalizeAssetId(value: string): string {
  return normalizeText(value, "Comparison datafeed asset id");
}

function normalizeText(value: string, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function normalizeWindow(value: ComparisonDatafeedWindow): ComparisonDatafeedWindow {
  if (typeof value !== "object" || value === null) throw new Error("Comparison datafeed window must be an object");
  const from = normalizeTime(value.from);
  const to = normalizeTime(value.to);
  if (to <= from) throw new Error("Comparison datafeed window.to must be greater than window.from");
  return { from, to };
}

function normalizeBaseline(value: ComparisonBaseline): ComparisonBaseline {
  return { time: normalizeTime(value.time), maxAgeMs: normalizeAge(value.maxAgeMs) };
}

function normalizeAge(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Comparison baseline maxAgeMs must be a non-negative integer");
  return value;
}

function normalizeTime(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Comparison datafeed times must be non-negative UTC millisecond integers");
  return value;
}

function validateSymbolInfo(info: SymbolInfo): void {
  if (typeof info !== "object" || info === null || typeof info.symbol !== "string" || info.symbol.trim().length === 0 || typeof info.timezone !== "string" || info.timezone.trim().length === 0 || !Number.isSafeInteger(info.pricePrecision) || info.pricePrecision < 0) {
    throw new Error("Datafeed resolved an invalid symbol description");
  }
}

function normalizeHistoricalCandles(value: readonly Candle[], from: number, to: number): Candle[] {
  if (!Array.isArray(value)) throw new Error("Datafeed historical result must be an array");
  const byTime = new Map<number, Candle>();
  value.forEach((raw, index) => {
    validateProviderCandle(raw, index);
    if (raw.time >= from && raw.time < to) byTime.set(raw.time, { ...raw });
  });
  const candles = [...byTime.values()].sort((left, right) => left.time - right.time);
  const store = new CandleStore();
  store.setData(candles);
  return store.getAll();
}

function validateProviderCandle(value: Candle, index: number): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`Invalid historical candle at index ${index}`);
  validateCandle(value, index);
  if (!Number.isSafeInteger(value.time)) throw new Error(`Historical candle timestamp must be a safe integer at index ${index}`);
  if (value.close <= 0) throw new Error(`Historical comparison close must be positive at index ${index}`);
}

function validateRealtimeCandle(value: Candle): void {
  validateProviderCandle(value, 0);
}

function toComparisonPoint(candle: Candle): ComparisonPricePoint {
  return { time: candle.time, price: candle.close };
}

function sameCandle(left: Candle, right: Candle): boolean {
  return left.time === right.time
    && left.open === right.open
    && left.high === right.high
    && left.low === right.low
    && left.close === right.close
    && left.volume === right.volume;
}

function connectAbortSignal(signal: AbortSignal | undefined, controller: AbortController): () => void {
  if (signal === undefined) return () => undefined;
  const onAbort = (): void => controller.abort();
  if (signal.aborted) controller.abort();
  else signal.addEventListener("abort", onAbort, { once: true });
  return () => signal.removeEventListener("abort", onAbort);
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  throw error;
}

function awaitWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const cleanup = (): void => signal.removeEventListener("abort", onAbort);
    const onAbort = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(abortError());
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then((value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    }, (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    });
  });
}

function abortError(): Error {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
