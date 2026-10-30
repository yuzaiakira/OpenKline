import type { Candle, LinePoint } from "./types.js";

/** Versioned provider-neutral corporate-action contract. */
export const OPENKLINE_CORPORATE_ACTIONS_VERSION = 1 as const;

export type CorporateActionKind = "stock-split" | "reverse-stock-split" | "cash-dividend";
export type CorporateActionAdjustmentMode = "raw" | "split-adjusted" | "total-return";
export type CorporateActionAdjustmentContext = "retrospective" | "causal-as-of";
export type CorporateActionVolumePolicy = "equivalent-shares" | "preserve";
export type CorporateActionKnowledgeCoverage = "known" | "unknown";

export interface CorporateActionSource {
  readonly id: string;
  readonly version: string;
  readonly provenance?: string;
}

export interface CorporateActionBase {
  readonly id: string;
  readonly instrumentId: string;
  readonly kind: CorporateActionKind;
  /** UTC millisecond boundary at which the action becomes effective. */
  readonly effectiveTime: number;
  /** Optional exchange trading date in YYYY-MM-DD form. */
  readonly tradingDate?: string;
  /** Monotonically increasing correction revision for this stable event id. */
  readonly revision: number;
  /** When the terms became known to the historical data consumer, if known. */
  readonly knowledgeTime?: number;
  /** Announcement/declaration time, never inferred by the library. */
  readonly announcementTime?: number;
  readonly source: CorporateActionSource;
}

export interface StockSplitAction extends CorporateActionBase {
  readonly kind: "stock-split" | "reverse-stock-split";
  /** Shares received for each old share. A 2-for-1 split is 2 / 1. */
  readonly newShares: number;
  readonly oldShares: number;
}

export interface CashDividendAction extends CorporateActionBase {
  readonly kind: "cash-dividend";
  /** Ex-dividend boundary; entitlement is determined at this boundary. */
  readonly exDividendTime: number;
  readonly amountPerShare: number;
  readonly currency: string;
  /** Payment is intentionally optional because many sources do not know it. */
  readonly paymentTime?: number;
  readonly declarationTime?: number;
}

export type CorporateAction = StockSplitAction | CashDividendAction;

export interface CorporateActionDataset {
  readonly version: typeof OPENKLINE_CORPORATE_ACTIONS_VERSION;
  readonly instrumentId: string;
  readonly source: CorporateActionSource;
  readonly knowledgeCoverage: CorporateActionKnowledgeCoverage;
  readonly actions: readonly CorporateAction[];
}

export interface CorporateActionQuery {
  readonly instrumentId: string;
  readonly from: number;
  readonly to: number;
  readonly asOfTime?: number;
  readonly signal?: AbortSignal;
}

export interface CorporateActionDatafeed {
  getCorporateActions(query: CorporateActionQuery): Promise<CorporateActionDataset>;
  dispose?(): void;
}

export interface CorporateActionAdjustmentOptions {
  readonly mode: CorporateActionAdjustmentMode;
  readonly context?: CorporateActionAdjustmentContext;
  /** Required for causal-as-of mode. */
  readonly asOfTime?: number;
  /** Optional knowledge frontier; defaults to asOfTime in causal mode. */
  readonly knowledgeTime?: number;
  readonly volumePolicy?: CorporateActionVolumePolicy;
  /** Total-return index starts at this value; defaults to 100. */
  readonly totalReturnBase?: number;
}

/** Chart/Studio presentation policy; derived adjusted data is never persisted. */
export interface CorporateActionDisplayOptions {
  readonly mode?: CorporateActionAdjustmentMode;
  readonly context?: CorporateActionAdjustmentContext;
  readonly asOfTime?: number;
  readonly volumePolicy?: CorporateActionVolumePolicy;
  readonly markersVisible?: boolean;
}

export interface CorporateActionAdjustmentProvenance {
  readonly source: CorporateActionSource;
  readonly context: CorporateActionAdjustmentContext;
  readonly knowledgeCoverage: CorporateActionKnowledgeCoverage;
  readonly eligibleActionIds: readonly string[];
  readonly excludedActionIds: readonly string[];
  readonly volumePolicy: CorporateActionVolumePolicy;
  readonly totalReturnConvention: "cash-dividend-reinvested-at-ex-date" | null;
  readonly rawDataUnchanged: true;
}

export interface TotalReturnPoint extends LinePoint {
  readonly splitAdjustedClose: number;
  readonly dividendFactor: number;
}

export interface CorporateActionAdjustmentResult {
  readonly mode: CorporateActionAdjustmentMode;
  readonly context: CorporateActionAdjustmentContext;
  readonly asOfTime: number | null;
  /** Raw or split-adjusted OHLCV. Null for total-return mode. */
  readonly candles: readonly Candle[] | null;
  /** Explicit analytical total-return index. Never presented as OHLCV. */
  readonly totalReturn: readonly TotalReturnPoint[] | null;
  readonly appliedActions: readonly CorporateAction[];
  readonly provenance: CorporateActionAdjustmentProvenance;
}

export interface CorporateActionStoreOptions {
  readonly instrumentId: string;
  readonly source: CorporateActionSource;
  readonly knowledgeCoverage?: CorporateActionKnowledgeCoverage;
  readonly actions?: readonly CorporateAction[];
}

export type CorporateActionChange =
  | { readonly kind: "replaced"; readonly actionCount: number }
  | { readonly kind: "updated"; readonly actionId: string }
  | { readonly kind: "disposed" };

export class CorporateActionValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "CorporateActionValidationError";
  }
}

export class CorporateActionLifecycleError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "CorporateActionLifecycleError";
  }
}

export class CorporateActionStore {
  private readonly instrumentId: string;
  private readonly source: CorporateActionSource;
  private knowledgeCoverage: CorporateActionKnowledgeCoverage;
  private actions = new Map<string, CorporateAction>();
  private readonly listeners = new Set<(change: CorporateActionChange) => void>();
  private disposed = false;

  public constructor(options: CorporateActionStoreOptions) {
    this.instrumentId = normalizeIdentifier(options.instrumentId, "instrument id");
    this.source = normalizeSource(options.source);
    this.knowledgeCoverage = options.knowledgeCoverage ?? "unknown";
    if (this.knowledgeCoverage !== "known" && this.knowledgeCoverage !== "unknown") throw new CorporateActionValidationError("Invalid corporate-action knowledge coverage");
    this.replace(options.actions ?? []);
  }

  public replace(actions: readonly CorporateAction[]): void {
    this.assertAlive();
    const next = normalizeActions(actions, this.instrumentId);
    this.actions = new Map(next.map((action) => [action.id, action]));
    this.emit({ kind: "replaced", actionCount: next.length });
  }

  /** Apply a correction only when it has a strictly higher revision. */
  public upsert(action: CorporateAction): void {
    this.assertAlive();
    const normalized = normalizeAction(action, this.instrumentId);
    const current = this.actions.get(normalized.id);
    if (current !== undefined && normalized.revision < current.revision) {
      throw new CorporateActionValidationError(`Corporate action revision regressed: ${normalized.id}`);
    }
    if (current !== undefined && normalized.revision === current.revision && stableJson(current) !== stableJson(normalized)) {
      throw new CorporateActionValidationError(`Corporate action revision is contradictory: ${normalized.id}`);
    }
    this.actions.set(normalized.id, normalized);
    this.emit({ kind: "updated", actionId: normalized.id });
  }

  public getAll(): CorporateAction[] {
    this.assertAlive();
    return [...this.actions.values()].sort(compareActions).map(cloneAction);
  }

  public get(id: string): CorporateAction | null {
    this.assertAlive();
    const action = this.actions.get(normalizeIdentifier(id, "corporate action id"));
    return action === undefined ? null : cloneAction(action);
  }

  public query(query: Omit<CorporateActionQuery, "signal">): CorporateAction[] {
    this.assertAlive();
    if (query.instrumentId !== this.instrumentId) throw new CorporateActionValidationError(`Unknown corporate-action instrument: ${query.instrumentId}`);
    validateRange(query.from, query.to);
    const asOf = query.asOfTime === undefined ? Number.POSITIVE_INFINITY : normalizeTime(query.asOfTime, "corporate action as-of time");
    return this.getAll().filter((action) => action.effectiveTime >= query.from && action.effectiveTime < query.to && isKnownAt(action, asOf));
  }

  public getDataset(): CorporateActionDataset {
    this.assertAlive();
    return {
      version: OPENKLINE_CORPORATE_ACTIONS_VERSION,
      instrumentId: this.instrumentId,
      source: { ...this.source },
      knowledgeCoverage: this.knowledgeCoverage,
      actions: this.getAll(),
    };
  }

  public subscribe(listener: (change: CorporateActionChange) => void): () => void {
    this.assertAlive();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.actions.clear();
    this.listeners.clear();
  }

  private emit(change: CorporateActionChange): void {
    for (const listener of this.listeners) listener(change);
  }

  private assertAlive(): void {
    if (this.disposed) throw new CorporateActionLifecycleError("Corporate action store has been disposed");
  }
}

export class InMemoryCorporateActionDatafeed implements CorporateActionDatafeed {
  private readonly store: CorporateActionStore;

  public constructor(dataset: CorporateActionDataset) {
    validateCorporateActionDataset(dataset);
    this.store = new CorporateActionStore({
      instrumentId: dataset.instrumentId,
      source: dataset.source,
      knowledgeCoverage: dataset.knowledgeCoverage,
      actions: dataset.actions,
    });
  }

  public async getCorporateActions(query: CorporateActionQuery): Promise<CorporateActionDataset> {
    throwIfAborted(query.signal);
    if (query.to < query.from) throw new CorporateActionValidationError("Corporate-action query range must be ascending");
    const actions = this.store.query(query);
    return { ...this.store.getDataset(), actions };
  }

  public dispose(): void {
    this.store.dispose();
  }
}

export interface RestCorporateActionPayload {
  readonly id: string;
  readonly instrumentId: string;
  readonly kind: CorporateActionKind;
  readonly effectiveTime: number | string;
  readonly tradingDate?: string;
  readonly revision?: number;
  readonly knowledgeTime?: number | string;
  readonly announcementTime?: number | string;
  readonly source?: CorporateActionSource;
  readonly newShares?: number;
  readonly oldShares?: number;
  readonly exDividendTime?: number | string;
  readonly amountPerShare?: number;
  readonly currency?: string;
  readonly paymentTime?: number | string;
  readonly declarationTime?: number | string;
}

export interface RestCorporateActionPage {
  readonly actions: readonly RestCorporateActionPayload[];
  readonly next?: string | null;
  readonly source: CorporateActionSource;
  readonly knowledgeCoverage?: CorporateActionKnowledgeCoverage;
}

export interface RestCorporateActionDatafeedOptions {
  readonly baseUrl: string;
  readonly actionsPath?: string;
  readonly fetcher?: (input: string, init?: RequestInit) => Promise<Response>;
  readonly headers?: HeadersInit;
  readonly maxPages?: number;
  readonly trustedPaginationOrigins?: readonly string[];
}

/** Provider-neutral paginated REST adapter; it never executes provider data. */
export class RestCorporateActionDatafeed implements CorporateActionDatafeed {
  private readonly baseUrl: URL;
  private readonly fetcher: (input: string, init?: RequestInit) => Promise<Response>;
  private readonly trustedOrigins: ReadonlySet<string>;
  private readonly maxPages: number;
  private readonly path: string;

  public constructor(private readonly options: RestCorporateActionDatafeedOptions) {
    this.baseUrl = new URL(options.baseUrl);
    assertHttpUrl(this.baseUrl, "Corporate-action REST baseUrl");
    this.fetcher = options.fetcher ?? fetch;
    this.path = options.actionsPath ?? "/corporate-actions";
    this.maxPages = options.maxPages ?? 100;
    if (!Number.isInteger(this.maxPages) || this.maxPages < 1) throw new RangeError("maxPages must be a positive integer");
    const origins = new Set<string>([this.baseUrl.origin]);
    for (const origin of options.trustedPaginationOrigins ?? []) {
      const url = new URL(origin);
      assertHttpUrl(url, "trusted corporate-action pagination origin");
      origins.add(url.origin);
    }
    this.trustedOrigins = origins;
  }

  public async getCorporateActions(query: CorporateActionQuery): Promise<CorporateActionDataset> {
    throwIfAborted(query.signal);
    validateRange(query.from, query.to);
    const byId = new Map<string, CorporateAction>();
    let next: string | null | undefined;
    let source: CorporateActionSource | null = null;
    let knowledgeCoverage: CorporateActionKnowledgeCoverage = "unknown";
    const visited = new Set<string>();
    for (let page = 0; page < this.maxPages; page += 1) {
      throwIfAborted(query.signal);
      const url = this.pageUrl(query, next);
      if (visited.has(url.href)) throw new CorporateActionValidationError("Corporate-action pagination repeated a URL");
      visited.add(url.href);
      const response = await this.fetcher(url.href, {
        redirect: "error",
        ...(this.options.headers === undefined ? {} : { headers: this.options.headers }),
        ...(query.signal === undefined ? {} : { signal: query.signal }),
      });
      if (!response.ok) throw new Error(`Corporate-action REST request failed: ${response.status} ${response.statusText}`);
      const pageData = parseRestCorporateActionPage(await response.json(), query.instrumentId);
      source ??= pageData.source;
      if (source.id !== pageData.source.id || source.version !== pageData.source.version) throw new CorporateActionValidationError("Corporate-action pages disagree on source identity");
      knowledgeCoverage = pageData.knowledgeCoverage ?? knowledgeCoverage;
      for (const raw of pageData.actions) {
        const action = normalizeRestCorporateAction(raw, pageData.source, query.instrumentId);
        if (action.effectiveTime >= query.from && action.effectiveTime < query.to && isKnownAt(action, query.asOfTime ?? Number.POSITIVE_INFINITY)) {
          const current = byId.get(action.id);
          if (current === undefined || action.revision > current.revision) byId.set(action.id, action);
        }
      }
      next = pageData.next;
      if (next === undefined || next === null || next === "") break;
      if (page === this.maxPages - 1) throw new CorporateActionValidationError(`Corporate-action pagination exceeded maxPages=${this.maxPages}`);
    }
    if (source === null) throw new CorporateActionValidationError("Corporate-action response did not provide a source identity");
    return { version: OPENKLINE_CORPORATE_ACTIONS_VERSION, instrumentId: query.instrumentId, source, knowledgeCoverage, actions: [...byId.values()].sort(compareActions) };
  }

  private pageUrl(query: CorporateActionQuery, cursor: string | null | undefined): URL {
    const url = cursor === undefined || cursor === null ? new URL(this.path, this.baseUrl) : new URL(cursor, this.baseUrl);
    if (!this.trustedOrigins.has(url.origin)) throw new CorporateActionValidationError(`Corporate-action pagination origin is not trusted: ${url.origin}`);
    url.searchParams.set("instrumentId", query.instrumentId);
    url.searchParams.set("from", String(query.from));
    url.searchParams.set("to", String(query.to));
    if (query.asOfTime !== undefined) url.searchParams.set("asOfTime", String(query.asOfTime));
    return url;
  }
}

export function validateCorporateActionDataset(value: unknown): asserts value is CorporateActionDataset {
  if (!isRecord(value) || value.version !== OPENKLINE_CORPORATE_ACTIONS_VERSION) throw new CorporateActionValidationError("Unsupported corporate-action dataset version");
  const instrumentId = normalizeIdentifier(value.instrumentId, "corporate-action instrument id");
  normalizeSource(value.source);
  if (value.knowledgeCoverage !== "known" && value.knowledgeCoverage !== "unknown") throw new CorporateActionValidationError("Invalid corporate-action knowledge coverage");
  if (!Array.isArray(value.actions)) throw new CorporateActionValidationError("Corporate-action dataset actions must be an array");
  normalizeActions(value.actions, instrumentId);
}

export function normalizeCorporateActionDataset(value: CorporateActionDataset): CorporateActionDataset {
  validateCorporateActionDataset(value);
  return {
    version: OPENKLINE_CORPORATE_ACTIONS_VERSION,
    instrumentId: normalizeIdentifier(value.instrumentId, "corporate-action instrument id"),
    source: normalizeSource(value.source as unknown as CorporateActionSource),
    knowledgeCoverage: value.knowledgeCoverage,
    actions: normalizeActions(value.actions, value.instrumentId),
  };
}

export function adjustCorporateActionData(
  candles: readonly Candle[],
  dataset: CorporateActionDataset,
  options: CorporateActionAdjustmentOptions,
): CorporateActionAdjustmentResult {
  validateCorporateActionDataset(dataset);
  const raw = cloneAndValidateCandles(candles);
  if (dataset.instrumentId.trim().length === 0) throw new CorporateActionValidationError("Corporate-action dataset instrument id is empty");
  const context = options.context ?? "retrospective";
  const asOfTime = context === "causal-as-of" ? normalizeTime(options.asOfTime, "causal corporate-action as-of time") : options.asOfTime === undefined ? null : normalizeTime(options.asOfTime, "corporate-action as-of time");
  if (context === "causal-as-of" && asOfTime === null) throw new CorporateActionValidationError("Causal corporate-action adjustment requires asOfTime");
  const knowledgeTime = context === "causal-as-of" ? normalizeTime(options.knowledgeTime ?? asOfTime ?? undefined, "corporate-action knowledge frontier") : Number.POSITIVE_INFINITY;
  if (options.mode !== "raw" && options.mode !== "split-adjusted" && options.mode !== "total-return") throw new CorporateActionValidationError(`Unsupported corporate-action adjustment mode: ${String(options.mode)}`);
  const volumePolicy = options.volumePolicy ?? "equivalent-shares";
  if (volumePolicy !== "equivalent-shares" && volumePolicy !== "preserve") throw new CorporateActionValidationError("Unsupported corporate-action volume policy");
  const eligible = dataset.actions.filter((action) => isEligibleForAdjustment(action, context, asOfTime ?? Number.POSITIVE_INFINITY, knowledgeTime)).sort(compareActions);
  const excluded = dataset.actions.filter((action) => !eligible.some((item) => item.id === action.id)).sort(compareActions);
  const base = options.totalReturnBase ?? 100;
  if (!Number.isFinite(base) || base <= 0) throw new CorporateActionValidationError("Total-return base must be positive and finite");
  if (options.mode === "raw") {
    return buildAdjustmentResult("raw", context, asOfTime, raw, null, eligible, excluded, dataset, volumePolicy);
  }
  const splitIndex = createSplitAdjustmentIndex(eligible);
  const splitAdjusted = raw.map((candle) => adjustCandle(candle, splitIndex.factorAt(candle.time), volumePolicy));
  if (options.mode === "split-adjusted") {
    return buildAdjustmentResult("split-adjusted", context, asOfTime, splitAdjusted, null, eligible, excluded, dataset, volumePolicy);
  }
  const totalReturn = calculateTotalReturnIndex(raw, eligible, base, volumePolicy);
  return buildAdjustmentResult("total-return", context, asOfTime, null, totalReturn, eligible, excluded, dataset, volumePolicy);
}

export function calculateTotalReturnIndex(
  candles: readonly Candle[],
  actions: readonly CorporateAction[],
  base = 100,
  volumePolicy: CorporateActionVolumePolicy = "equivalent-shares",
): readonly TotalReturnPoint[] {
  const raw = cloneAndValidateCandles(candles);
  const normalized = normalizeActions(actions, raw.length === 0 ? undefined : undefined);
  const splits = normalized.filter(isSplitAction);
  const dividends = normalized.filter(isDividendAction);
  const splitIndex = createSplitAdjustmentIndex(splits);
  const points: TotalReturnPoint[] = [];
  let index = base;
  let previousAdjustedClose: number | null = null;
  let previousTime: number | null = null;
  let dividendCursor = 0;
  for (const candle of raw) {
    const adjusted = adjustCandle(candle, splitIndex.factorAt(candle.time), volumePolicy);
    const close = adjusted.close;
    let dividendFactor = 1;
    if (previousAdjustedClose !== null && previousAdjustedClose > 0 && previousTime !== null) {
      while (dividendCursor < dividends.length && dividends[dividendCursor]!.exDividendTime <= previousTime) dividendCursor += 1;
      while (dividendCursor < dividends.length && dividends[dividendCursor]!.exDividendTime <= candle.time) {
        const dividend = dividends[dividendCursor]!;
        if (dividend.exDividendTime > previousTime) {
          const dividendAdjusted = dividend.amountPerShare * splitIndex.factorAt(dividend.exDividendTime);
          dividendFactor *= 1 + dividendAdjusted / previousAdjustedClose;
        }
        dividendCursor += 1;
      }
      index *= close / previousAdjustedClose;
      index *= dividendFactor;
    } else {
      while (dividendCursor < dividends.length && dividends[dividendCursor]!.exDividendTime <= candle.time) dividendCursor += 1;
    }
    points.push({ time: candle.time, value: index, splitAdjustedClose: close, dividendFactor });
    previousAdjustedClose = close;
    previousTime = candle.time;
  }
  return points;
}

function buildAdjustmentResult(
  mode: CorporateActionAdjustmentMode,
  context: CorporateActionAdjustmentContext,
  asOfTime: number | null,
  candles: readonly Candle[] | null,
  totalReturn: readonly TotalReturnPoint[] | null,
  appliedActions: readonly CorporateAction[],
  excludedActions: readonly CorporateAction[],
  dataset: CorporateActionDataset,
  volumePolicy: CorporateActionVolumePolicy,
): CorporateActionAdjustmentResult {
  return {
    mode,
    context,
    asOfTime,
    candles: candles === null ? null : candles.map((candle) => ({ ...candle })),
    totalReturn: totalReturn === null ? null : totalReturn.map((point) => ({ ...point })),
    appliedActions: appliedActions.map(cloneAction),
    provenance: {
      source: { ...dataset.source },
      context,
      knowledgeCoverage: dataset.knowledgeCoverage,
      eligibleActionIds: appliedActions.map((action) => action.id),
      excludedActionIds: excludedActions.map((action) => action.id),
      volumePolicy,
      totalReturnConvention: mode === "total-return" ? "cash-dividend-reinvested-at-ex-date" : null,
      rawDataUnchanged: true,
    },
  };
}

function adjustCandle(candle: Candle, factor: number, volumePolicy: CorporateActionVolumePolicy): Candle {
  const adjusted: Candle = {
    time: candle.time,
    open: candle.open * factor,
    high: candle.high * factor,
    low: candle.low * factor,
    close: candle.close * factor,
    ...(candle.volume === undefined ? {} : { volume: volumePolicy === "equivalent-shares" ? candle.volume / factor : candle.volume }),
  };
  if (adjusted.high < Math.max(adjusted.open, adjusted.close) || adjusted.low > Math.min(adjusted.open, adjusted.close)) throw new CorporateActionValidationError("Split adjustment violated OHLC ordering");
  return adjusted;
}

interface SplitAdjustmentIndex {
  factorAt(time: number): number;
}

function createSplitAdjustmentIndex(actions: readonly CorporateAction[]): SplitAdjustmentIndex {
  const splits = actions.filter(isSplitAction).sort(compareActions);
  const suffixFactors = new Array<number>(splits.length + 1).fill(1);
  for (let index = splits.length - 1; index >= 0; index -= 1) {
    const action = splits[index]!;
    suffixFactors[index] = suffixFactors[index + 1]! * action.oldShares / action.newShares;
    if (!Number.isFinite(suffixFactors[index]) || suffixFactors[index]! <= 0) throw new CorporateActionValidationError("Corporate-action split factor is invalid");
  }
  return {
    factorAt: (time: number): number => {
      let low = 0;
      let high = splits.length;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (splits[middle]!.effectiveTime <= time) low = middle + 1;
        else high = middle;
      }
      return suffixFactors[low] ?? 1;
    },
  };
}

function isEligibleForAdjustment(action: CorporateAction, context: CorporateActionAdjustmentContext, asOfTime: number, knowledgeTime: number): boolean {
  if (context === "retrospective") return true;
  if (action.effectiveTime > asOfTime) return false;
  if (action.knowledgeTime !== undefined && action.knowledgeTime > knowledgeTime) return false;
  return true;
}

function isKnownAt(action: CorporateAction, asOfTime: number): boolean {
  return action.knowledgeTime === undefined || action.knowledgeTime <= asOfTime;
}

function normalizeActions(actions: readonly CorporateAction[], instrumentId: string | undefined): CorporateAction[] {
  if (!Array.isArray(actions)) throw new CorporateActionValidationError("Corporate actions must be an array");
  const normalized = actions.map((action) => normalizeAction(action, instrumentId));
  const byId = new Map<string, CorporateAction>();
  for (const action of normalized) {
    const current = byId.get(action.id);
    if (current !== undefined) {
      if (action.revision !== current.revision || stableJson(action) !== stableJson(current)) throw new CorporateActionValidationError(`Duplicate or contradictory corporate action: ${action.id}`);
      continue;
    }
    byId.set(action.id, action);
  }
  return [...byId.values()].sort(compareActions);
}

function normalizeAction(value: CorporateAction, instrumentId: string | undefined): CorporateAction {
  if (!isRecord(value)) throw new CorporateActionValidationError("Corporate action must be an object");
  const id = normalizeIdentifier(value.id, "corporate action id");
  const normalizedInstrument = normalizeIdentifier(value.instrumentId, "corporate action instrument id");
  if (instrumentId !== undefined && normalizedInstrument !== instrumentId) throw new CorporateActionValidationError(`Corporate action ${id} references the wrong instrument`);
  const base = {
    id,
    instrumentId: normalizedInstrument,
    kind: value.kind,
    effectiveTime: normalizeTime(value.effectiveTime, "corporate action effective time"),
    ...(value.tradingDate === undefined ? {} : { tradingDate: normalizeTradingDate(value.tradingDate) }),
    revision: normalizeRevision(value.revision),
    ...(value.knowledgeTime === undefined ? {} : { knowledgeTime: normalizeTime(value.knowledgeTime, "corporate action knowledge time") }),
    ...(value.announcementTime === undefined ? {} : { announcementTime: normalizeTime(value.announcementTime, "corporate action announcement time") }),
    source: normalizeSource(value.source as unknown as CorporateActionSource),
  } as const;
  if (value.kind === "stock-split" || value.kind === "reverse-stock-split") {
    const newShares = positiveFinite(value.newShares, "corporate action new shares");
    const oldShares = positiveFinite(value.oldShares, "corporate action old shares");
    if (value.kind === "stock-split" && newShares < oldShares) throw new CorporateActionValidationError("Stock split must increase the share ratio; use reverse-stock-split for a reduction");
    if (value.kind === "reverse-stock-split" && newShares >= oldShares) throw new CorporateActionValidationError("Reverse stock split must reduce the share ratio");
    return { ...base, kind: value.kind, newShares, oldShares };
  }
  if (value.kind === "cash-dividend") {
    const exDividendTime = normalizeTime(value.exDividendTime, "cash dividend ex-dividend time");
    const amountPerShare = nonNegativeFinite(value.amountPerShare, "cash dividend amount per share");
    const currency = normalizeCurrency(value.currency);
    const paymentTime = value.paymentTime === undefined ? undefined : normalizeTime(value.paymentTime, "cash dividend payment time");
    if (paymentTime !== undefined && paymentTime < exDividendTime) throw new CorporateActionValidationError("Cash dividend payment time cannot precede ex-dividend time");
    const declarationTime = value.declarationTime === undefined ? undefined : normalizeTime(value.declarationTime, "cash dividend declaration time");
    if (declarationTime !== undefined && declarationTime > exDividendTime) throw new CorporateActionValidationError("Cash dividend declaration time cannot follow ex-dividend time");
    if (base.effectiveTime !== exDividendTime) throw new CorporateActionValidationError("Cash dividend effectiveTime must equal exDividendTime");
    return { ...base, kind: value.kind, exDividendTime, amountPerShare, currency, ...(paymentTime === undefined ? {} : { paymentTime }), ...(declarationTime === undefined ? {} : { declarationTime }) };
  }
  throw new CorporateActionValidationError(`Unsupported corporate action kind: ${String(value.kind)}`);
}

function normalizeRestCorporateAction(value: RestCorporateActionPayload, source: CorporateActionSource, instrumentId: string): CorporateAction {
  return normalizeAction({
    ...value,
    revision: value.revision ?? 1,
    source: value.source ?? source,
    effectiveTime: normalizeExternalTime(value.effectiveTime),
    ...(value.knowledgeTime === undefined ? {} : { knowledgeTime: normalizeExternalTime(value.knowledgeTime) }),
    ...(value.announcementTime === undefined ? {} : { announcementTime: normalizeExternalTime(value.announcementTime) }),
    ...(value.exDividendTime === undefined ? {} : { exDividendTime: normalizeExternalTime(value.exDividendTime) }),
    ...(value.paymentTime === undefined ? {} : { paymentTime: normalizeExternalTime(value.paymentTime) }),
    ...(value.declarationTime === undefined ? {} : { declarationTime: normalizeExternalTime(value.declarationTime) }),
  } as CorporateAction, instrumentId);
}

function parseRestCorporateActionPage(value: unknown, instrumentId: string): RestCorporateActionPage {
  if (!isRecord(value) || !Array.isArray(value.actions) || !isRecord(value.source) || typeof value.source.id !== "string" || typeof value.source.version !== "string") throw new CorporateActionValidationError("Malformed corporate-action REST page");
  if (value.next !== undefined && value.next !== null && typeof value.next !== "string") throw new CorporateActionValidationError("Corporate-action REST next cursor must be a string or null");
  for (const action of value.actions) if (!isRecord(action) || action.instrumentId !== instrumentId) throw new CorporateActionValidationError("Corporate-action REST page contains a wrong instrument");
  return {
    actions: value.actions as unknown as RestCorporateActionPayload[],
    source: normalizeSource(value.source as unknown as CorporateActionSource),
    ...(value.next === undefined ? {} : { next: value.next as string | null }),
    ...(value.knowledgeCoverage === undefined ? {} : { knowledgeCoverage: value.knowledgeCoverage as CorporateActionKnowledgeCoverage }),
  };
}

function cloneAndValidateCandles(candles: readonly Candle[]): Candle[] {
  if (!Array.isArray(candles)) throw new CorporateActionValidationError("Candles must be an array");
  let previous: number | undefined;
  return candles.map((candle, index) => {
    if (!isRecord(candle) || !Number.isSafeInteger(candle.time) || candle.time < 0 || !Number.isFinite(candle.open) || !Number.isFinite(candle.high) || !Number.isFinite(candle.low) || !Number.isFinite(candle.close) || (candle.volume !== undefined && (!Number.isFinite(candle.volume) || candle.volume < 0))) throw new CorporateActionValidationError(`Invalid candle at index ${index}`);
    if (previous !== undefined && candle.time <= previous) throw new CorporateActionValidationError("Candles must be strictly ascending for corporate-action adjustment");
    if (candle.high < Math.max(candle.open, candle.close) || candle.low > Math.min(candle.open, candle.close)) throw new CorporateActionValidationError(`Candle OHLC relationship is invalid at index ${index}`);
    previous = candle.time;
    return { time: candle.time, open: candle.open, high: candle.high, low: candle.low, close: candle.close, ...(candle.volume === undefined ? {} : { volume: candle.volume }) };
  });
}

function compareActions(left: CorporateAction, right: CorporateAction): number {
  return left.effectiveTime - right.effectiveTime || left.kind.localeCompare(right.kind) || left.instrumentId.localeCompare(right.instrumentId) || left.id.localeCompare(right.id) || left.revision - right.revision;
}

function cloneAction(action: CorporateAction): CorporateAction {
  return { ...action, source: { ...action.source } } as CorporateAction;
}

function isSplitAction(action: CorporateAction): action is StockSplitAction { return action.kind === "stock-split" || action.kind === "reverse-stock-split"; }
function isDividendAction(action: CorporateAction): action is CashDividendAction { return action.kind === "cash-dividend"; }

function normalizeSource(source: CorporateActionSource): CorporateActionSource {
  if (!isRecord(source)) throw new CorporateActionValidationError("Corporate-action source is invalid");
  return { id: normalizeIdentifier(source.id, "corporate-action source id"), version: normalizeIdentifier(source.version, "corporate-action source version"), ...(source.provenance === undefined ? {} : { provenance: normalizeLabel(source.provenance, "corporate-action provenance") }) };
}

function normalizeTradingDate(value: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new CorporateActionValidationError("Corporate-action tradingDate must be YYYY-MM-DD");
  return value;
}

function normalizeRevision(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new CorporateActionValidationError("Corporate-action revision must be a positive safe integer");
  return value;
}

function normalizeTime(value: number | undefined, label: string): number {
  if (value === undefined || !Number.isSafeInteger(value) || value < 0) throw new CorporateActionValidationError(`${label} must be a non-negative safe integer`);
  return value;
}

function normalizeExternalTime(value: number | string): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(numeric)) return normalizeTime(Math.abs(numeric) < 1_000_000_000_000 ? numeric * 1000 : numeric, "corporate-action timestamp");
  const parsed = Date.parse(String(value));
  return normalizeTime(parsed, "corporate-action timestamp");
}

function validateRange(from: number, to: number): void {
  normalizeTime(from, "corporate-action query from");
  normalizeTime(to, "corporate-action query to");
  if (to < from) throw new CorporateActionValidationError("Corporate-action query range must be ascending");
}

function normalizeIdentifier(value: string, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 256) throw new CorporateActionValidationError(`${label} must be a non-empty bounded string`);
  return value.trim();
}

function normalizeLabel(value: string, label: string): string {
  if (typeof value !== "string" || value.length > 512) throw new CorporateActionValidationError(`${label} is too long`);
  return value;
}

function normalizeCurrency(value: string): string {
  if (typeof value !== "string" || !/^[A-Z0-9][A-Z0-9._-]{0,15}$/u.test(value.trim().toUpperCase())) throw new CorporateActionValidationError("Corporate-action currency must be an explicit code");
  return value.trim().toUpperCase();
}

function positiveFinite(value: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new CorporateActionValidationError(`${label} must be positive and finite`);
  return value;
}

function nonNegativeFinite(value: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new CorporateActionValidationError(`${label} must be finite and non-negative`);
  return value;
}

function isRecord(value: unknown): value is Record<string, any> { return typeof value === "object" && value !== null && !Array.isArray(value); }

function stableJson(value: unknown): string { return JSON.stringify(value, Object.keys(value as object).sort()); }

function assertHttpUrl(url: URL, label: string): void {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new CorporateActionValidationError(`${label} must use http or https`);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    const error = new Error("The operation was aborted");
    error.name = "AbortError";
    throw error;
  }
}
