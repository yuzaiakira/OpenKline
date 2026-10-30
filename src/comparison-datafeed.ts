import { CandleStore, validateCandle } from "./core/candle-store.js";
import { ComparisonEngine } from "./comparison.js";
import type {
  ComparisonAssetOutput,
  ComparisonBaseline,
  ComparisonNormalizationMode,
  ComparisonPricePoint,
} from "./comparison.js";
import type { Candle, Datafeed, DatafeedRealtimeStatus, DatafeedRealtimeSubscriptionArgs, SymbolInfo } from "./types.js";

export interface ComparisonDatafeedWindow {
  /** Inclusive lower UTC millisecond bound for requested historical bars. */
  readonly from: number;
  /** Exclusive upper UTC millisecond bound, matching `Datafeed.getBars`. */
  readonly to: number;
}

/**
 * Optional provider-neutral schedule information used for coverage checks.
 * `unknown` is the safe default: missing timestamps are reported as uncertain,
 * never as fabricated market closures or candles.
 */
export interface ComparisonDatafeedCoveragePolicy {
  readonly kind?: "continuous" | "sessions" | "sparse" | "unknown";
  /** Expected slot spacing in UTC milliseconds when a slot model is available. */
  readonly intervalMs?: number;
  /** Optional UTC anchor for slot generation; the visible window start is used otherwise. */
  readonly anchorTime?: number;
  /** Return true for expected slots (for example, session-aware calendars). */
  readonly isExpectedTime?: (time: number) => boolean;
  /** Bound schedule iteration for irregular or very large ranges. */
  readonly maxGapIntervals?: number;
}

export interface ComparisonDatafeedInterval {
  readonly from: number;
  readonly to: number;
}

export type ComparisonDatafeedCoverageCompleteness = "complete" | "incomplete" | "uncertain" | "empty";

export interface ComparisonDatafeedCoverage {
  readonly requested: ComparisonDatafeedWindow;
  readonly observedFrom: number | null;
  readonly observedTo: number | null;
  readonly missing: readonly ComparisonDatafeedInterval[];
  readonly completeness: ComparisonDatafeedCoverageCompleteness;
  readonly calendarKnown: boolean;
  readonly backfillNeeded: boolean;
  readonly backfillAttempted: boolean;
  readonly recovery: "idle" | "needed" | "running" | "complete" | "failed" | "cancelled";
  readonly recoveryError: string | null;
}

export interface ComparisonDatafeedRecoveryState {
  readonly state: "idle" | "needed" | "running" | "complete" | "failed" | "cancelled";
  readonly attempts: number;
  readonly lastError: string | null;
}

export interface ComparisonDatafeedBackfillOptions {
  readonly assetIds?: readonly string[];
  /** Explicit ranges are useful when a provider cannot expose a connection lifecycle. */
  readonly ranges?: Readonly<Record<string, readonly ComparisonDatafeedInterval[]>>;
  readonly maxRanges?: number;
  readonly maxAttempts?: number;
  readonly maxConcurrency?: number;
  readonly retryBackoffMs?: number;
  readonly signal?: AbortSignal;
}

export interface ComparisonDatafeedBackfillAssetResult {
  readonly id: string;
  readonly status: "complete" | "failed" | "cancelled" | "idle";
  readonly requestedRanges: readonly ComparisonDatafeedInterval[];
  readonly recoveredBars: number;
  readonly attempts: number;
  readonly error: string | null;
}

export interface ComparisonDatafeedBackfillResult {
  readonly status: "complete" | "partial" | "failed" | "cancelled" | "idle";
  readonly assets: readonly ComparisonDatafeedBackfillAssetResult[];
}

export interface ComparisonDatafeedAsset {
  readonly id: string;
  readonly datafeed: Datafeed;
  readonly symbol: string;
  /** Each asset may use a different timeframe when explicitly configured. */
  readonly timeframe: string;
  readonly label?: string;
  readonly color?: string;
  /** Optional expected-slot/calendar policy for historical coverage reporting. */
  readonly coverage?: ComparisonDatafeedCoveragePolicy;
}

export interface ComparisonDatafeedControllerOptions {
  readonly window: ComparisonDatafeedWindow;
  readonly mode?: ComparisonNormalizationMode;
  readonly baseline?: ComparisonBaseline | null;
  /** Keep the original historical upper bound or follow accepted live/recovered observations. */
  readonly realtimeWindowMode?: "fixed" | "follow";
  /** Injectable UTC clock for deterministic reconnect recovery; defaults to Date.now. */
  readonly recoveryNow?: () => number;
  /** Maximum automatic reconnect range. Manual backfill remains available for older gaps. */
  readonly maxRecoveryRangeMs?: number;
}

export type ComparisonDatafeedAssetState = "registered" | "loading" | "ready" | "empty" | "error";
export type ComparisonDatafeedOverallState = "idle" | "loading" | "ready" | "partial" | "empty" | "error" | "disposed";
export type ComparisonDatafeedRealtimeState = "idle" | "subscribed" | "unsupported" | "stopped" | "error" | "disconnected" | "recovering";

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
  readonly coverage: ComparisonDatafeedCoverage;
  readonly recovery: ComparisonDatafeedRecoveryState;
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
  | "realtime-status"
  | "coverage-updated"
  | "backfill-started"
  | "backfill-completed"
  | "backfill-error"
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
  coverage: ComparisonDatafeedCoverage;
  recovery: ComparisonDatafeedRecoveryState;
  liveByTime: Map<number, Candle>;
  lastRealtimeTime: number | null;
  /** Highest timestamp known from realtime or recovered observations. */
  recoveryFrontier: number | null;
}

interface ActiveLoad {
  readonly generation: number;
  readonly controller: AbortController;
  readonly records: readonly AssetRecord[];
}

interface ActiveBackfill {
  readonly generation: number;
  readonly controller: AbortController;
  readonly records: readonly AssetRecord[];
}

interface BackfillTask {
  readonly record: AssetRecord;
  readonly range: ComparisonDatafeedInterval;
}

interface MutableBackfillResult {
  readonly id: string;
  status: "complete" | "failed" | "cancelled" | "idle";
  readonly requestedRanges: readonly ComparisonDatafeedInterval[];
  recoveredBars: number;
  attempts: number;
  error: string | null;
}

interface NormalizedBackfillOptions {
  readonly maxRanges: number;
  readonly maxAttempts: number;
  readonly maxConcurrency: number;
  readonly retryBackoffMs: number;
}

interface RealtimeRecoveryRange {
  readonly range: ComparisonDatafeedInterval;
  readonly target: number;
  readonly bounded: boolean;
}

const DEFAULT_MAX_RECOVERY_RANGE_MS = 7 * 24 * 60 * 60 * 1_000;

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
  private readonly realtimeWindowMode: "fixed" | "follow";
  private readonly recoveryNow: () => number;
  private readonly maxRecoveryRangeMs: number;
  private replayCutoff: number | null = null;
  private activeLoad: ActiveLoad | null = null;
  private activeBackfill: ActiveBackfill | null = null;
  private loadGeneration = 0;
  private backfillGeneration = 0;
  private disposed = false;

  public constructor(options: ComparisonDatafeedControllerOptions) {
    this.window = normalizeWindow(options.window);
    this.mode = options.mode ?? "percentage";
    this.realtimeWindowMode = options.realtimeWindowMode ?? "fixed";
    if (this.realtimeWindowMode !== "fixed" && this.realtimeWindowMode !== "follow") {
      throw new Error(`Unsupported realtime window mode: ${String(options.realtimeWindowMode)}`);
    }
    this.recoveryNow = options.recoveryNow ?? (() => Date.now());
    if (typeof this.recoveryNow !== "function") throw new Error("Comparison recoveryNow must be a function");
    this.maxRecoveryRangeMs = options.maxRecoveryRangeMs === undefined
      ? DEFAULT_MAX_RECOVERY_RANGE_MS
      : normalizePositiveInteger(options.maxRecoveryRangeMs, "Comparison maxRecoveryRangeMs");
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
      coverage: emptyCoverage(this.window),
      recovery: { state: "idle", attempts: 0, lastError: null },
      liveByTime: new Map(),
      lastRealtimeTime: null,
      recoveryFrontier: null,
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
    this.cancelActiveBackfill();
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
    this.cancelActiveBackfill();
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
    this.cancelActiveBackfill();
  }

  /**
   * Recover only confirmed missing ranges (or explicitly supplied ranges).
   * Recovery is bounded, cancellable, and keeps live corrections authoritative
   * when a historical response overlaps an already received realtime candle.
   */
  public async backfill(options: ComparisonDatafeedBackfillOptions = {}): Promise<ComparisonDatafeedBackfillResult> {
    this.assertAlive();
    this.cancelActiveBackfill();
    const normalized = normalizeBackfillOptions(options);
    const selected = options.assetIds === undefined
      ? [...this.assets.values()]
      : options.assetIds.map((id) => this.requireAsset(id));
    const controller = new AbortController();
    const removeAbortListener = connectAbortSignal(options.signal, controller);
    const generation = ++this.backfillGeneration;
    const records = [...new Set(selected)];
    const active: ActiveBackfill = { generation, controller, records };
    this.activeBackfill = active;
    const results = new Map<string, MutableBackfillResult>();
    const tasks: BackfillTask[] = [];
    let remainingRanges = normalized.maxRanges;
    for (const record of records) {
      const explicit = options.ranges?.[record.config.id];
      const requested = explicit === undefined
        ? record.coverage.missing
        : explicit.map(normalizeInterval);
      const ranges = requested.slice(0, remainingRanges);
      remainingRanges -= ranges.length;
      results.set(record.config.id, {
        id: record.config.id,
        status: ranges.length === 0 ? "idle" : "complete",
        requestedRanges: ranges,
        recoveredBars: 0,
        attempts: 0,
        error: null,
      });
      if (ranges.length > 0) {
        record.recovery = { state: "running", attempts: 0, lastError: null };
        record.coverage = updateCoverageRecovery(record.coverage, true, "running", null);
        for (const range of ranges) tasks.push({ record, range });
      }
    }
    if (tasks.length > 0) this.emit({ kind: "backfill-started" });

    let cursor = 0;
    const worker = async (): Promise<void> => {
      while (true) {
        const task = tasks[cursor];
        cursor += 1;
        if (task === undefined) return;
        if (!this.isCurrentBackfill(active)) return;
        const result = results.get(task.record.config.id);
        if (result === undefined) return;
        try {
          const recovered = await this.recoverRange(task.record, task.range, active, normalized);
          result.recoveredBars += recovered.bars;
          result.attempts += recovered.attempts;
        } catch (error) {
          if (isAbortError(error) || !this.isCurrentBackfill(active)) return;
          result.status = "failed";
          result.error = toError(error).message;
          result.attempts += normalized.maxAttempts;
          task.record.recovery = { state: "failed", attempts: result.attempts, lastError: result.error };
          task.record.coverage = updateCoverageRecovery(task.record.coverage, true, "failed", result.error);
          this.emit({ kind: "backfill-error", assetId: task.record.config.id, error: result.error });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(normalized.maxConcurrency, Math.max(1, tasks.length)) }, () => worker()));
    removeAbortListener();

    if (this.disposed || !this.isCurrentBackfill(active) || controller.signal.aborted) {
      if (!this.disposed && this.isCurrentBackfill(active)) this.cancelActiveBackfill();
      return { status: "cancelled", assets: [...results.values()].map((result) => ({ ...result, status: "cancelled" as const })) };
    }
    this.activeBackfill = null;
    const assets = records.map((record) => {
      const result = results.get(record.config.id)!;
      if (result.status === "complete") {
        const coverage = calculateCoverage(record, this.window, true);
        const state = coverage.backfillNeeded ? "failed" : "complete";
        result.status = state;
        if (state === "failed" && result.error === null) result.error = "Historical coverage remains incomplete after recovery";
        record.recovery = { state, attempts: result.attempts, lastError: result.error };
        record.coverage = updateCoverageRecovery(coverage, true, state, result.error);
      }
      this.emit({ kind: "coverage-updated", assetId: record.config.id });
      return { ...result, requestedRanges: result.requestedRanges.map((range) => ({ ...range })) };
    });
    const failed = assets.filter((asset) => asset.status === "failed").length;
    const cancelled = assets.filter((asset) => asset.status === "cancelled").length;
    const completed = assets.filter((asset) => asset.status === "complete").length;
    const status = assets.length === 0 || assets.every((asset) => asset.status === "idle")
      ? "idle"
      : cancelled > 0 ? "cancelled"
        : failed === assets.length ? "failed"
          : failed > 0 ? "partial"
            : completed > 0 ? "complete" : "idle";
    this.emit({ kind: "backfill-completed" });
    return { status, assets };
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
    if (this.baseline !== null && this.assetsHaveInsufficientBaselineHistory()) {
      void this.load();
    }
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
    return normalized.map((asset) => ({
      ...asset,
      data: asset.data.filter((point) => {
        const record = this.assets.get(asset.id);
        const frontier = record?.recoveryFrontier ?? null;
        const followsRealtime = this.realtimeWindowMode === "follow" && frontier !== null;
        const insideHistoricalWindow = point.time < this.window.to;
        const insideFollowWindow = followsRealtime && point.time <= frontier;
        return point.time >= this.window.from
          && (insideHistoricalWindow || insideFollowWindow)
          && (this.replayCutoff === null || point.time <= this.replayCutoff);
      }),
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
        coverage: cloneCoverage(record.coverage),
        recovery: { ...record.recovery },
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
    this.activeBackfill?.controller.abort();
    this.activeLoad = null;
    this.activeBackfill = null;
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
      const requestFrom = this.historicalRequestFrom();
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
      record.coverage = calculateCoverage(record, this.window, false);
      record.recovery = { state: "idle", attempts: 0, lastError: null };
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
    record.coverage = emptyCoverage(this.window);
    record.recovery = { state: "idle", attempts: 0, lastError: null };
    record.liveByTime.clear();
    record.lastRealtimeTime = null;
    record.recoveryFrontier = null;
  }

  private startSubscription(record: AssetRecord): void {
    const subscribeBars = record.config.datafeed.subscribeBars;
    if (subscribeBars === undefined) {
      record.realtime = "unsupported";
      return;
    }
    const token = record.token;
    try {
      const subscriptionArgs: DatafeedRealtimeSubscriptionArgs = {
        symbol: record.config.symbol,
        timeframe: record.config.timeframe,
        onBar: (bar) => this.handleRealtime(record.config.id, token, bar),
        onError: (error) => this.handleRealtimeError(record.config.id, token, error),
        onStatus: (status) => this.handleRealtimeStatus(record.config.id, token, status),
      };
      const unsubscribe = subscribeBars.call(record.config.datafeed, subscriptionArgs);
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
      record.liveByTime.set(normalized.time, normalized);
      record.lastRealtimeTime = maxTime(record.lastRealtimeTime, normalized.time);
      record.recoveryFrontier = maxTime(record.recoveryFrontier, normalized.time);
      record.state = "ready";
      record.error = null;
      record.coverage = previous === undefined
        ? calculateCoverage(record, this.window, record.coverage.backfillAttempted)
        : updateCoverageRecovery(record.coverage, record.coverage.backfillAttempted, record.coverage.recovery, record.coverage.recoveryError);
      if (record.realtime === "recovering" || record.realtime === "disconnected") record.realtime = "subscribed";
      this.emit({ kind: "realtime-updated", assetId: id });
      this.emit({ kind: "coverage-updated", assetId: id });
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

  private handleRealtimeStatus(id: string, token: number, status: DatafeedRealtimeStatus): void {
    const record = this.assets.get(id);
    if (record === undefined || !this.isCurrentRecord(record, token)) return;
    if (status === "connected" || status === "stopped") {
      record.realtime = status === "connected" ? "subscribed" : "stopped";
      this.emit({ kind: "realtime-status", assetId: id });
      return;
    }
    if (status === "disconnected") {
      record.realtime = "disconnected";
      record.recovery = { state: "needed", attempts: record.recovery.attempts, lastError: null };
      record.coverage = updateCoverageRecovery(record.coverage, record.coverage.backfillAttempted, "needed", null);
      this.emit({ kind: "realtime-status", assetId: id });
      return;
    }
    if (status === "reconnected") {
      record.realtime = "recovering";
      this.emit({ kind: "realtime-status", assetId: id });
      let recovery: RealtimeRecoveryRange | null;
      try {
        recovery = this.recoveryFrom(record);
      } catch (error) {
        this.handleRealtimeError(id, token, error);
        return;
      }
      if (recovery === null) {
        record.realtime = "subscribed";
        record.recovery = { state: "complete", attempts: record.recovery.attempts, lastError: null };
        return;
      }
      void this.backfill({ assetIds: [id], ranges: { [id]: [recovery.range] } }).then((result) => {
        if (!this.isCurrentRecord(record, token)) return;
        const asset = result.assets[0];
        if (asset?.status === "failed") {
          record.realtime = "error";
          record.error = asset.error;
        } else if (asset?.status === "cancelled") {
          record.realtime = "disconnected";
        } else if (recovery.bounded) {
          const error = `Automatic recovery was bounded at ${new Date(recovery.range.to).toISOString()}; target ${new Date(recovery.target).toISOString()} remains unverified`;
          record.realtime = "recovering";
          record.error = error;
          record.recovery = { state: "failed", attempts: asset?.attempts ?? record.recovery.attempts, lastError: error };
          record.coverage = updateCoverageRecovery(record.coverage, true, "failed", error);
        } else {
          record.realtime = "subscribed";
        }
        this.emit({ kind: "realtime-status", assetId: id });
      }).catch((error: unknown) => this.handleRealtimeError(id, token, error));
      return;
    }
    record.realtime = "error";
    this.emit({ kind: "realtime-status", assetId: id });
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

  private cancelActiveBackfill(): void {
    const active = this.activeBackfill;
    if (active === null) return;
    active.controller.abort();
    this.backfillGeneration += 1;
    this.activeBackfill = null;
    for (const record of active.records) {
      if (record.recovery.state === "running") {
        record.recovery = { state: "cancelled", attempts: record.recovery.attempts, lastError: null };
        record.coverage = updateCoverageRecovery(record.coverage, true, "cancelled", null);
      }
    }
  }

  private isCurrentLoad(record: AssetRecord, generation: number): boolean {
    return !this.disposed && this.activeLoad?.generation === generation && this.assets.get(record.config.id) === record;
  }

  private isCurrentBackfill(active: ActiveBackfill): boolean {
    return !this.disposed && this.activeBackfill?.generation === active.generation && this.backfillGeneration === active.generation;
  }

  private isCurrentRecord(record: AssetRecord, token: number): boolean {
    return !this.disposed && this.assets.get(record.config.id) === record && record.token === token;
  }

  private historicalRequestFrom(): number {
    if (this.baseline === null) return this.window.from;
    return Math.min(this.window.from, subtractTime(this.baseline.time, this.baseline.maxAgeMs));
  }

  private assetsHaveInsufficientBaselineHistory(): boolean {
    const requestFrom = this.historicalRequestFrom();
    return [...this.assets.values()].some((record) => record.candles.getAll()[0]?.time === undefined || (record.candles.getAll()[0]?.time ?? requestFrom) > requestFrom);
  }

  private recoveryFrom(record: AssetRecord): RealtimeRecoveryRange | null {
    if (this.realtimeWindowMode === "fixed") {
      const from = Math.max(this.window.from, record.lastRealtimeTime ?? this.window.from);
      if (from >= this.window.to) return null;
      return { range: { from, to: this.window.to }, target: this.window.to, bounded: false };
    }
    const from = Math.max(this.window.from, record.recoveryFrontier ?? this.window.to);
    const target = normalizeTime(this.recoveryNow());
    if (target <= from) return null;
    const maximumTo = from > Number.MAX_SAFE_INTEGER - this.maxRecoveryRangeMs
      ? Number.MAX_SAFE_INTEGER
      : from + this.maxRecoveryRangeMs;
    const to = Math.min(target, maximumTo);
    if (to <= from) return null;
    return { range: { from, to }, target, bounded: to < target };
  }

  private async recoverRange(
    record: AssetRecord,
    range: ComparisonDatafeedInterval,
    active: ActiveBackfill,
    options: NormalizedBackfillOptions,
  ): Promise<{ readonly bars: number; readonly attempts: number }> {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
      if (!this.isCurrentBackfill(active)) throw abortError();
      try {
        throwIfAborted(active.controller.signal);
        record.recovery = { state: "running", attempts: Math.max(record.recovery.attempts, attempt), lastError: null };
        const bars = await awaitWithAbort(record.config.datafeed.getBars({
          symbol: record.config.symbol,
          timeframe: record.config.timeframe,
          from: range.from,
          to: range.to,
          signal: active.controller.signal,
        }), active.controller.signal);
        if (!this.isCurrentBackfill(active)) throw abortError();
        const normalized = normalizeHistoricalCandles(bars, range.from, range.to);
        const changed = this.mergeRecoveredCandles(record, normalized);
        return { bars: changed, attempts: attempt };
      } catch (error) {
        if (isAbortError(error)) throw error;
        lastError = toError(error);
        if (attempt < options.maxAttempts) await delayWithAbort(options.retryBackoffMs * attempt, active.controller.signal);
      }
    }
    throw lastError ?? new Error("Historical recovery failed");
  }

  private mergeRecoveredCandles(record: AssetRecord, candles: readonly Candle[]): number {
    let changed = 0;
    for (const candle of candles) {
      if (record.liveByTime.has(candle.time)) continue;
      const previous = record.rawByTime.get(candle.time);
      if (previous !== undefined && sameCandle(previous, candle)) continue;
      record.candles.update(candle);
      record.rawByTime.set(candle.time, { ...candle });
      changed += 1;
    }
    for (const candle of candles) record.recoveryFrontier = maxTime(record.recoveryFrontier, candle.time);
    if (changed > 0) {
      this.engine.replaceAssetData(record.config.id, record.candles.getAll().map(toComparisonPoint));
      record.state = "ready";
      record.error = null;
      record.coverage = calculateCoverage(record, this.window, true);
      this.emit({ kind: "realtime-updated", assetId: record.config.id });
    }
    return changed;
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
    ...(input.coverage === undefined ? {} : { coverage: normalizeCoveragePolicy(input.coverage) }),
  };
}

function normalizeCoveragePolicy(value: ComparisonDatafeedCoveragePolicy): ComparisonDatafeedCoveragePolicy {
  if (typeof value !== "object" || value === null) throw new Error("Coverage policy must be an object");
  const kind = value.kind ?? "unknown";
  if (kind !== "continuous" && kind !== "sessions" && kind !== "sparse" && kind !== "unknown") throw new Error("Unsupported coverage policy kind");
  const intervalMs = value.intervalMs === undefined ? undefined : normalizePositiveInteger(value.intervalMs, "Coverage intervalMs");
  const anchorTime = value.anchorTime === undefined ? undefined : normalizeTime(value.anchorTime);
  const maxGapIntervals = value.maxGapIntervals === undefined ? 10_000 : normalizePositiveInteger(value.maxGapIntervals, "Coverage maxGapIntervals");
  if (value.isExpectedTime !== undefined && typeof value.isExpectedTime !== "function") throw new Error("Coverage isExpectedTime must be a function");
  return {
    kind,
    ...(intervalMs === undefined ? {} : { intervalMs }),
    ...(anchorTime === undefined ? {} : { anchorTime }),
    ...(value.isExpectedTime === undefined ? {} : { isExpectedTime: value.isExpectedTime }),
    maxGapIntervals,
  };
}

function normalizeBackfillOptions(options: ComparisonDatafeedBackfillOptions): NormalizedBackfillOptions {
  return {
    maxRanges: options.maxRanges === undefined ? 32 : normalizePositiveInteger(options.maxRanges, "Backfill maxRanges"),
    maxAttempts: options.maxAttempts === undefined ? 3 : normalizePositiveInteger(options.maxAttempts, "Backfill maxAttempts"),
    maxConcurrency: options.maxConcurrency === undefined ? 2 : normalizePositiveInteger(options.maxConcurrency, "Backfill maxConcurrency"),
    retryBackoffMs: options.retryBackoffMs === undefined ? 100 : normalizeNonNegativeInteger(options.retryBackoffMs, "Backfill retryBackoffMs"),
  };
}

function normalizeInterval(value: ComparisonDatafeedInterval): ComparisonDatafeedInterval {
  if (typeof value !== "object" || value === null) throw new Error("Backfill interval must be an object");
  const from = normalizeTime(value.from);
  const to = normalizeTime(value.to);
  if (to <= from) throw new Error("Backfill interval.to must be greater than interval.from");
  return { from, to };
}

function normalizePositiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer`);
  return value;
}

function normalizeNonNegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`);
  return value;
}

function subtractTime(time: number, age: number): number {
  return age >= time ? 0 : time - age;
}

function emptyCoverage(window: ComparisonDatafeedWindow): ComparisonDatafeedCoverage {
  return {
    requested: { ...window },
    observedFrom: null,
    observedTo: null,
    missing: [],
    completeness: "empty",
    calendarKnown: false,
    backfillNeeded: false,
    backfillAttempted: false,
    recovery: "idle",
    recoveryError: null,
  };
}

function calculateCoverage(record: AssetRecord, window: ComparisonDatafeedWindow, backfillAttempted: boolean): ComparisonDatafeedCoverage {
  const policy = record.config.coverage;
  const visible = record.candles.getAll().filter((candle) => candle.time >= window.from && candle.time < window.to);
  const previous = record.coverage;
  const coverage = detectCoverage(policy, window, visible, backfillAttempted, previous.recovery, previous.recoveryError);
  return coverage;
}

function detectCoverage(
  policy: ComparisonDatafeedCoveragePolicy | undefined,
  window: ComparisonDatafeedWindow,
  candles: readonly Candle[],
  backfillAttempted: boolean,
  recovery: ComparisonDatafeedCoverage["recovery"],
  recoveryError: string | null,
): ComparisonDatafeedCoverage {
  const sorted = [...candles].sort((left, right) => left.time - right.time);
  const observedFrom = sorted[0]?.time ?? null;
  const observedTo = sorted.at(-1)?.time ?? null;
  const kind = policy?.kind ?? "unknown";
  const intervalMs = policy?.intervalMs;
  const calendarKnown = intervalMs !== undefined
    && (kind === "continuous" || typeof policy?.isExpectedTime === "function");
  if (sorted.length === 0) {
    return {
      requested: { ...window }, observedFrom, observedTo, missing: [], completeness: "empty", calendarKnown,
      backfillNeeded: false, backfillAttempted, recovery, recoveryError,
    };
  }
  if (!calendarKnown || intervalMs === undefined) {
    return {
      requested: { ...window }, observedFrom, observedTo, missing: [], completeness: "uncertain", calendarKnown,
      backfillNeeded: false, backfillAttempted, recovery, recoveryError,
    };
  }
  const maxSlots = policy?.maxGapIntervals ?? 10_000;
  const anchor = policy?.anchorTime ?? window.from;
  const firstSlot = anchor >= window.from
    ? anchor
    : anchor + Math.ceil((window.from - anchor) / intervalMs) * intervalMs;
  const expected: number[] = [];
  for (let time = firstSlot; time < window.to && expected.length <= maxSlots; time += intervalMs) {
    if (policy?.isExpectedTime === undefined || policy.isExpectedTime(time)) expected.push(time);
    if (time > Number.MAX_SAFE_INTEGER - intervalMs) break;
  }
  if (expected.length > maxSlots) {
    return {
      requested: { ...window }, observedFrom, observedTo, missing: [], completeness: "uncertain", calendarKnown,
      backfillNeeded: false, backfillAttempted, recovery, recoveryError,
    };
  }
  const observed = new Set(sorted.map((candle) => candle.time));
  const missingSlots = expected.filter((time) => !observed.has(time));
  const missing = coalesceMissingSlots(missingSlots, intervalMs, window.to);
  return {
    requested: { ...window }, observedFrom, observedTo, missing,
    completeness: missing.length === 0 ? "complete" : "incomplete",
    calendarKnown, backfillNeeded: missing.length > 0, backfillAttempted, recovery, recoveryError,
  };
}

function coalesceMissingSlots(slots: readonly number[], intervalMs: number, upperBound: number): ComparisonDatafeedInterval[] {
  if (slots.length === 0) return [];
  const ranges: ComparisonDatafeedInterval[] = [];
  let from = slots[0]!;
  let previous = from;
  for (const slot of slots.slice(1)) {
    if (slot !== previous + intervalMs) {
      ranges.push({ from, to: Math.min(upperBound, previous + intervalMs) });
      from = slot;
    }
    previous = slot;
  }
  ranges.push({ from, to: Math.min(upperBound, previous + intervalMs) });
  return ranges;
}

function updateCoverageRecovery(
  coverage: ComparisonDatafeedCoverage,
  attempted: boolean,
  recovery: ComparisonDatafeedCoverage["recovery"],
  recoveryError: string | null,
): ComparisonDatafeedCoverage {
  return { ...coverage, requested: { ...coverage.requested }, missing: coverage.missing.map((range) => ({ ...range })), backfillAttempted: attempted, recovery, recoveryError };
}

function cloneCoverage(coverage: ComparisonDatafeedCoverage): ComparisonDatafeedCoverage {
  return { ...coverage, requested: { ...coverage.requested }, missing: coverage.missing.map((range) => ({ ...range })) };
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

function maxTime(previous: number | null, next: number): number {
  return previous === null ? next : Math.max(previous, next);
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

function delayWithAbort(delayMs: number, signal: AbortSignal): Promise<void> {
  if (delayMs <= 0) {
    throwIfAborted(signal);
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = (): void => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(abortError());
    };
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
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
