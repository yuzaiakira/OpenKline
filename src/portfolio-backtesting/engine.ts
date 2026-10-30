import { validateCandle } from "../core/candle-store.js";
import { applyAdverseSlippage, calculateTransactionCost } from "../financial.js";
import { parseFixedTimeframe } from "../multi-timeframe.js";
import { createDefaultStrategyRegistry, StrategyCancellationError, type StrategyEvaluationResult, type StrategyRegistry, type StrategySignal } from "../strategies/index.js";
import type { Candle } from "../types.js";
import {
  clonePortfolioPositionSizing,
  PortfolioBacktestCancellationError,
  PortfolioBacktestLifecycleError,
  PortfolioBacktestValidationError,
  type PortfolioAccountSnapshot,
  type PortfolioBacktestApi,
  type PortfolioBacktestAssumptions,
  type PortfolioBacktestOptions,
  type PortfolioBacktestPhase,
  type PortfolioBacktestProgress,
  type PortfolioBacktestResult,
  type PortfolioBacktestStatus,
  type PortfolioBacktestStatusState,
  type PortfolioCalendarIdentity,
  type PortfolioDuplicateTimestampPolicy,
  type PortfolioInstrumentInput,
  type PortfolioInstrumentSummary,
  type PortfolioInstrumentContribution,
  type PortfolioMark,
  type PortfolioOrder,
  type PortfolioOrderStatus,
  type PortfolioPerformanceMetrics,
  type PortfolioPosition,
  type PortfolioPositionSizing,
  type PortfolioRiskOptions,
  type PortfolioSignal,
  type PortfolioTimelineEvent,
  type PortfolioTrade,
  type PortfolioValuationOptions,
} from "./types.js";

interface NormalizedInstrument {
  readonly input: PortfolioInstrumentInput;
  readonly candles: readonly Candle[];
  readonly timeframe: ReturnType<typeof parseFixedTimeframe>;
  readonly calendar: PortfolioCalendarIdentity | null;
  readonly strategyId: string;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly positionSizing: PortfolioPositionSizing;
  readonly allowFractionalQuantity: boolean;
}

interface InternalSignal {
  readonly signal: PortfolioSignal;
  readonly instrument: NormalizedInstrument;
  readonly candle: Candle;
  readonly nextCandleIndex: number | null;
}

interface MutableOrder {
  readonly id: string;
  readonly instrumentId: string;
  readonly strategyId: string;
  readonly signalId: string;
  readonly action: StrategySignal["action"];
  readonly signalTime: number;
  readonly submissionTime: number;
  status: PortfolioOrderStatus;
  quantity: number;
  fillTime?: number;
  referencePrice?: number;
  executionPrice?: number;
  commission: number;
  slippage: number;
  reason?: string;
}

interface MutablePosition {
  readonly instrumentId: string;
  readonly symbol: string;
  readonly entrySignalTime: number;
  readonly entryFillTime: number;
  readonly entryPrice: number;
  readonly entryFees: number;
  readonly quantity: number;
}

interface MutableTrade extends PortfolioTrade {}

interface CompletedMark {
  readonly price: number;
  readonly observedAt: number;
}

interface ScheduledEvent extends PortfolioTimelineEvent {
  readonly candle?: Candle;
}

const DEFAULT_VALUATION: PortfolioValuationOptions = {
  policy: "last-known-price",
  maxAgeMs: 86_400_000,
  incomplete: "allow",
};

const DEFAULT_RISK: PortfolioRiskOptions = {};
const EVENT_PRIORITY: PortfolioBacktestAssumptions["eventPriority"] = ["market-open", "bar-complete", "order-fill", "valuation"];

export function createPortfolioBacktest(options: PortfolioBacktestOptions): PortfolioBacktestApi {
  return new PortfolioBacktestSession(options);
}

export class PortfolioBacktestSession implements PortfolioBacktestApi {
  private readonly options: PortfolioBacktestOptions;
  private readonly registry: StrategyRegistry;
  private readonly instruments: readonly NormalizedInstrument[];
  private readonly assumptions: PortfolioBacktestAssumptions;
  private readonly listeners = new Set<(status: PortfolioBacktestStatus) => void>();
  private readonly externalSignal: AbortSignal | undefined;
  private readonly externalAbortListener = (): void => this.internalController.abort();
  private internalController = new AbortController();
  private state: PortfolioBacktestStatusState = "idle";
  private phase: PortfolioBacktestPhase = "validation";
  private processed = 0;
  private total = 0;
  private signalCount = 0;
  private filledOrderCount = 0;
  private error: Error | null = null;
  private result: PortfolioBacktestResult | null = null;

  public constructor(options: PortfolioBacktestOptions) {
    validatePortfolioOptions(options);
    this.options = cloneOptions(options);
    this.registry = options.strategyRegistry ?? createDefaultStrategyRegistry();
    this.instruments = normalizeInstruments(options, this.registry);
    this.assumptions = {
      execution: "next-eligible-bar-open",
      eventPriority: EVENT_PRIORITY,
      endOfData: "cancel-unfilled-no-next-eligible-bar",
      accountCurrency: normalizeCurrency(options.accountCurrency),
      initialCapital: options.initialCapital,
      positionSizing: clonePortfolioPositionSizing(options.positionSizing),
      commission: { ...options.commission },
      slippage: { ...options.slippage },
      risk: cloneRisk(options.risk ?? DEFAULT_RISK),
      valuation: { ...(options.valuation ?? DEFAULT_VALUATION) },
      duplicateTimestampPolicy: options.duplicateTimestampPolicy ?? "reject",
      allowFractionalQuantity: options.allowFractionalQuantity === true,
      longOnly: true,
      leverage: "none",
    };
    this.externalSignal = options.signal;
    this.externalSignal?.addEventListener("abort", this.externalAbortListener);
  }

  public getStatus(): PortfolioBacktestStatus {
    return {
      state: this.state,
      phase: this.phase,
      processed: this.processed,
      total: this.total,
      signalCount: this.signalCount,
      filledOrderCount: this.filledOrderCount,
      ...(this.error === null ? {} : { error: this.error.message }),
    };
  }

  public subscribe(listener: (status: PortfolioBacktestStatus) => void): () => void {
    this.assertNotDisposed();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public run(): PortfolioBacktestResult {
    this.assertNotDisposed();
    if (this.state === "running") throw new PortfolioBacktestLifecycleError("Portfolio backtest is already running");
    this.internalController = new AbortController();
    this.throwIfCancelled();
    this.state = "running";
    this.phase = "validation";
    this.processed = 0;
    this.signalCount = 0;
    this.filledOrderCount = 0;
    this.error = null;
    this.result = null;
    this.emit();
    try {
      const result = this.evaluateAndExecute();
      this.result = result;
      this.state = "completed";
      this.phase = "metrics";
      this.processed = this.total;
      this.emit();
      return clonePortfolioResult(result);
    } catch (error) {
      if (error instanceof PortfolioBacktestCancellationError || error instanceof StrategyCancellationError || this.isCancelled()) {
        this.state = "cancelled";
        this.error = new PortfolioBacktestCancellationError();
        this.emit();
        throw this.error;
      }
      this.state = "failed";
      this.error = error instanceof Error ? error : new Error(String(error));
      this.emit();
      throw error;
    }
  }

  public cancel(): void {
    this.assertNotDisposed();
    if (this.state !== "running") return;
    this.internalController.abort();
    this.externalSignal?.removeEventListener("abort", this.externalAbortListener);
  }

  public getResult(): PortfolioBacktestResult | null {
    this.assertNotDisposed();
    return this.result === null ? null : clonePortfolioResult(this.result);
  }

  public dispose(): void {
    if (this.state === "disposed") return;
    this.internalController.abort();
    this.externalSignal?.removeEventListener("abort", this.externalAbortListener);
    this.listeners.clear();
    this.result = null;
    this.state = "disposed";
    this.error = null;
  }

  private evaluateAndExecute(): PortfolioBacktestResult {
    this.phase = "signals";
    const totalCandles = this.instruments.reduce((sum, instrument) => sum + instrument.candles.length, 0);
    const signalEvaluations: Array<{ readonly instrument: NormalizedInstrument; readonly evaluation: StrategyEvaluationResult }> = [];
    let evaluatedCandles = 0;
    for (const instrument of this.instruments) {
      this.throwIfCancelled();
      const completedBefore = evaluatedCandles;
      const strategy = this.registry.create(instrument.strategyId, instrument.parameters);
      try {
        const evaluation = strategy.evaluate(instrument.candles, {
          signal: this.combinedSignal,
          onProgress: (progress) => {
            this.throwIfCancelled();
            this.total = totalCandles;
            this.processed = Math.min(totalCandles, completedBefore + progress.processedBars);
            this.signalCount = progress.signalCount + signalEvaluations.reduce((sum, item) => sum + item.evaluation.signals.length, 0);
            this.emitProgress();
          },
        });
        signalEvaluations.push({ instrument, evaluation });
        evaluatedCandles = completedBefore + instrument.candles.length;
        this.signalCount += evaluation.signals.length;
      } finally {
        strategy.dispose();
      }
    }
    this.signalCount = signalEvaluations.reduce((sum, item) => sum + item.evaluation.signals.length, 0);
    const internalSignals = createInternalSignals(signalEvaluations);
    const scheduled = createScheduledEvents(this.instruments, internalSignals);
    this.total = scheduled.timeline.length;
    this.phase = "execution";
    this.processed = 0;
    this.emitProgress();
    return executeTimeline({
      throwIfCancelled: () => this.throwIfCancelled(),
      recordFilledOrder: () => { this.filledOrderCount += 1; },
      recordExecutionProgress: (processed, total, signalCount) => {
        this.processed = processed;
        this.total = total;
        this.options.onProgress?.({ phase: "execution", processed, total, signalCount, filledOrderCount: this.filledOrderCount });
        this.emit();
      },
    }, this.instruments, signalEvaluations, internalSignals, scheduled.timeline, scheduled.orders, this.assumptions);
  }

  private emitProgress(): void {
    const progress: PortfolioBacktestProgress = { phase: this.phase, processed: this.processed, total: this.total, signalCount: this.signalCount, filledOrderCount: this.filledOrderCount };
    this.options.onProgress?.(progress);
    this.emit();
  }

  private emit(): void {
    const status = this.getStatus();
    for (const listener of this.listeners) listener(status);
  }

  private throwIfCancelled(): void {
    if (this.isCancelled()) throw new PortfolioBacktestCancellationError();
  }

  private isCancelled(): boolean {
    return this.internalController.signal.aborted || this.externalSignal?.aborted === true;
  }

  private get combinedSignal(): AbortSignal {
    return this.internalController.signal;
  }

  private assertNotDisposed(): void {
    if (this.state === "disposed") throw new PortfolioBacktestLifecycleError("Portfolio backtest has been disposed");
  }
}

interface ScheduledEvents {
  readonly timeline: readonly ScheduledEvent[];
  readonly orders: readonly InternalSignal[];
}

interface ExecutionHooks {
  readonly throwIfCancelled: () => void;
  readonly recordFilledOrder: () => void;
  readonly recordExecutionProgress: (processed: number, total: number, signalCount: number) => void;
}

function executeTimeline(
  hooks: ExecutionHooks,
  instruments: readonly NormalizedInstrument[],
  evaluations: readonly { readonly instrument: NormalizedInstrument; readonly evaluation: StrategyEvaluationResult }[],
  signals: readonly InternalSignal[],
  timeline: readonly ScheduledEvent[],
  scheduledOrders: readonly InternalSignal[],
  assumptions: PortfolioBacktestAssumptions,
): PortfolioBacktestResult {
  const positions = new Map<string, MutablePosition>();
  const orders = new Map<string, MutableOrder>();
  const trades: MutableTrade[] = [];
  const equityCurve: PortfolioAccountSnapshot[] = [];
  const completedMarks = new Map<string, CompletedMark>();
  const fallbackMarks = new Map<string, CompletedMark>();
  const signalsByEvent = new Map<string, InternalSignal[]>();
  const orderById = new Map<string, InternalSignal>();
  const instrumentById = new Map(instruments.map((instrument) => [instrument.input.id, instrument]));
  for (const item of signals) {
    const key = signalEventKey(item.instrument.input.id, item.signal.index);
    const list = signalsByEvent.get(key) ?? [];
    list.push(item);
    signalsByEvent.set(key, list);
  }
  for (const item of scheduledOrders) {
    if (item.nextCandleIndex !== null) orderById.set(orderIdFor(item), item);
  }
  let cash = assumptions.initialCapital;
  let realizedPnl = 0;
  let peakEquity: number | null = assumptions.initialCapital;
  let riskHalted = false;
  let tradeSequence = 0;
  const total = timeline.length;
  for (let eventIndex = 0; eventIndex < timeline.length; eventIndex += 1) {
    hooks.throwIfCancelled();
    const event = timeline[eventIndex];
    if (event === undefined) continue;
    const instrument = event.instrumentId === undefined ? undefined : instrumentById.get(event.instrumentId);
    if (event.kind === "order-fill") {
      const scheduled = event.orderId === undefined ? undefined : orderById.get(event.orderId);
      const order = scheduled === undefined ? undefined : orders.get(event.orderId!);
      if (scheduled !== undefined && order !== undefined && instrument !== undefined && order.status === "pending") {
        const execution = executeOrder(order, scheduled, instrument, instruments, positions, cash, realizedPnl, trades, tradeSequence, assumptions, completedMarks, fallbackMarks, peakEquity, riskHalted);
        cash = execution.cash;
        realizedPnl = execution.realizedPnl;
        tradeSequence = execution.tradeSequence;
        if (execution.filled) {
          hooks.recordFilledOrder();
          fallbackMarks.set(instrument.input.id, { price: order.executionPrice!, observedAt: event.time });
        }
        if (execution.riskHalted) riskHalted = true;
      }
    } else if (event.kind === "bar-complete" && instrument !== undefined && event.candle !== undefined) {
      completedMarks.set(instrument.input.id, { price: event.candle.close, observedAt: event.time });
      const currentSignals = signalsByEvent.get(signalEventKey(instrument.input.id, event.candleIndex ?? -1)) ?? [];
      for (const item of currentSignals) {
        const orderId = orderIdFor(item);
        const mutable: MutableOrder = {
          id: orderId,
          instrumentId: item.instrument.input.id,
          strategyId: item.signal.strategyId,
          signalId: item.signal.id,
          action: item.signal.action,
          status: "submitted",
          signalTime: item.signal.time,
          submissionTime: item.signal.availableAt,
          quantity: 0,
          commission: 0,
          slippage: 0,
        };
        transitionOrder(mutable, "pending");
        orders.set(orderId, mutable);
        if (item.nextCandleIndex === null) {
          transitionOrder(mutable, "cancelled");
          mutable.reason = "No next eligible bar is available; the signal cannot be filled causally";
        }
      }
    } else if (event.kind === "valuation") {
      const snapshot = createAccountSnapshot(event.time, cash, realizedPnl, positions, instruments, completedMarks, fallbackMarks, peakEquity, assumptions.valuation);
      if (snapshot.equity !== null) peakEquity = Math.max(peakEquity ?? snapshot.equity, snapshot.equity);
      const withPeak = addPeakAndDrawdown(snapshot, peakEquity);
      if (withPeak.drawdown !== null && (assumptions.risk.maxDrawdown !== undefined && withPeak.drawdown >= assumptions.risk.maxDrawdown || assumptions.risk.maxDrawdownPercent !== undefined && (withPeak.drawdownPercent ?? 0) >= assumptions.risk.maxDrawdownPercent)) riskHalted = true;
      equityCurve.push(withPeak);
    }
    hooks.recordExecutionProgress(eventIndex + 1, total, signals.length);
  }
  const finalAccount = equityCurve.at(-1) ?? createAccountSnapshot(null, cash, realizedPnl, positions, instruments, completedMarks, fallbackMarks, peakEquity, assumptions.valuation);
  const finalWithPeak = addPeakAndDrawdown(finalAccount, peakEquity);
  const positionSnapshots = [...positions.values()].sort((left, right) => left.instrumentId.localeCompare(right.instrumentId)).map((position) => positionSnapshot(position, instruments.find((item) => item.input.id === position.instrumentId)!, completedMarks, fallbackMarks, finalWithPeak.time, assumptions.valuation));
  const orderSnapshots = [...orders.values()].sort((left, right) => left.id.localeCompare(right.id)).map(cloneOrder);
  const timelineSnapshot = timeline.map((event) => ({ ...event, ...(event.candle === undefined ? {} : { candle: undefined }) }));
  const metrics = calculatePortfolioMetrics(assumptions.initialCapital, finalWithPeak, equityCurve, orderSnapshots, trades, instruments, positions);
  return {
    engineVersion: 1,
    accountCurrency: assumptions.accountCurrency,
    assumptions,
    instruments: instruments.map(instrumentSummary),
    strategyInputs: evaluations.map((item) => ({ ...item.evaluation.input })),
    signals: signals.map((item) => ({ ...item.signal })),
    timeline: timelineSnapshot,
    orders: orderSnapshots,
    trades: trades.map((trade) => ({ ...trade })),
    positions: positionSnapshots,
    equityCurve: equityCurve.map((snapshot) => ({ ...snapshot, marks: snapshot.marks.map((mark) => ({ ...mark })) })),
    finalAccount: { ...finalWithPeak, marks: finalWithPeak.marks.map((mark) => ({ ...mark })) },
    metrics,
    inputFingerprint: fingerprintPortfolio(instruments),
  };
}

function executeOrder(
  order: MutableOrder,
  scheduled: InternalSignal,
  instrument: NormalizedInstrument,
  allInstruments: readonly NormalizedInstrument[],
  positions: Map<string, MutablePosition>,
  cash: number,
  realizedPnl: number,
  trades: MutableTrade[],
  tradeSequence: number,
  assumptions: PortfolioBacktestAssumptions,
  completedMarks: ReadonlyMap<string, CompletedMark>,
  fallbackMarks: ReadonlyMap<string, CompletedMark>,
  peakEquity: number | null,
  riskHalted: boolean,
): { readonly cash: number; readonly realizedPnl: number; readonly tradeSequence: number; readonly filled: boolean; readonly riskHalted: boolean } {
  const action = scheduled.signal.action;
  const existing = positions.get(instrument.input.id);
  if (action === "enter-short" || action === "exit-short") return rejectOrder(order, "Short selling is unsupported in Phase 12 long-only mode", cash, realizedPnl, tradeSequence, riskHalted);
  if (action === "enter-long" && existing !== undefined) return rejectOrder(order, "Pyramiding is disabled; the instrument already has a long position", cash, realizedPnl, tradeSequence, riskHalted);
  if (action === "exit-long" && existing === undefined) return rejectOrder(order, "Cannot exit a flat instrument position", cash, realizedPnl, tradeSequence, riskHalted);
  const candle = instrument.candles[scheduled.nextCandleIndex ?? -1];
  if (candle === undefined) return rejectOrder(order, "Eligible execution candle is unavailable", cash, realizedPnl, tradeSequence, riskHalted);
  const buy = action === "enter-long";
  const referencePrice = candle.open;
  const executionPrice = applyAdverseSlippage(referencePrice, assumptions.slippage, buy);
  const quantity = existing === undefined ? resolveEntryQuantity(instrument, executionPrice, cash, positions, allInstruments, completedMarks, fallbackMarks, peakEquity, assumptions) : existing.quantity;
  if (!Number.isFinite(quantity) || quantity <= 0) return rejectOrder(order, "Position sizing produced no positive quantity", cash, realizedPnl, tradeSequence, riskHalted);
  if (!instrument.allowFractionalQuantity && !Number.isInteger(quantity)) return rejectOrder(order, "Fractional quantity requires explicit opt-in", cash, realizedPnl, tradeSequence, riskHalted);
  const notional = executionPrice * quantity;
  const commission = calculateTransactionCost(assumptions.commission, notional);
  const current = createAccountSnapshot(candle.time, cash, realizedPnl, positions, allInstruments, completedMarks, fallbackMarks, peakEquity, assumptions.valuation);
  if (buy) {
    const risk = validateEntryRisk(instrument, notional, cash, current, positions, completedMarks, fallbackMarks, assumptions.risk, riskHalted);
    if (risk !== null) return rejectOrder(order, risk, cash, realizedPnl, tradeSequence, riskHalted);
    if (cash - notional - commission < (assumptions.risk.minimumAvailableCash ?? 0) - 1e-9) return rejectOrder(order, "Insufficient available cash after fees and the configured buffer", cash, realizedPnl, tradeSequence, riskHalted);
    positions.set(instrument.input.id, { instrumentId: instrument.input.id, symbol: instrument.input.symbol, entrySignalTime: scheduled.signal.time, entryFillTime: candle.time, entryPrice: executionPrice, entryFees: commission, quantity });
    transitionOrderFilled(order, referencePrice, executionPrice, candle.time, quantity, commission);
    return { cash: cash - notional - commission, realizedPnl, tradeSequence, filled: true, riskHalted };
  }
  if (existing === undefined) return rejectOrder(order, "Cannot exit a flat instrument position", cash, realizedPnl, tradeSequence, riskHalted);
  const grossPnl = (executionPrice - existing.entryPrice) * existing.quantity;
  const netPnl = grossPnl - existing.entryFees - commission;
  const trade: MutableTrade = {
    id: `${order.id}-trade`,
    instrumentId: instrument.input.id,
    direction: "long",
    entrySignalTime: existing.entrySignalTime,
    entryFillTime: existing.entryFillTime,
    entryPrice: existing.entryPrice,
    exitSignalTime: scheduled.signal.time,
    exitFillTime: candle.time,
    exitPrice: executionPrice,
    quantity: existing.quantity,
    grossPnl,
    netPnl,
    fees: existing.entryFees + commission,
    holdingDurationMs: Math.max(0, candle.time - existing.entryFillTime),
    exitReason: scheduled.signal.reason,
  };
  trades.push(trade);
  positions.delete(instrument.input.id);
  transitionOrderFilled(order, referencePrice, executionPrice, candle.time, existing.quantity, commission);
  return { cash: cash + notional - commission, realizedPnl: realizedPnl + netPnl, tradeSequence: tradeSequence + 1, filled: true, riskHalted };
}

function rejectOrder(order: MutableOrder, reason: string, cash: number, realizedPnl: number, tradeSequence: number, riskHalted: boolean): { readonly cash: number; readonly realizedPnl: number; readonly tradeSequence: number; readonly filled: boolean; readonly riskHalted: boolean } {
  transitionOrder(order, "rejected");
  order.reason = reason;
  return { cash, realizedPnl, tradeSequence, filled: false, riskHalted };
}

function validateEntryRisk(
  instrument: NormalizedInstrument,
  notional: number,
  cash: number,
  current: PortfolioAccountSnapshot,
  positions: ReadonlyMap<string, MutablePosition>,
  completedMarks: ReadonlyMap<string, CompletedMark>,
  fallbackMarks: ReadonlyMap<string, CompletedMark>,
  risk: PortfolioRiskOptions,
  riskHalted: boolean,
): string | null {
  if (riskHalted && risk.stopNewOrdersOnDrawdown !== false) return "Portfolio drawdown risk halt is active; new entries are disabled";
  if (risk.maxActivePositions !== undefined && positions.size >= risk.maxActivePositions) return "Maximum active portfolio positions reached";
  const currentInstrumentPosition = positions.get(instrument.input.id);
  const currentInstrumentMark = current.marks.find((mark) => mark.instrumentId === instrument.input.id)?.price ?? latestCompletedOrFallback(completedMarks.get(instrument.input.id), fallbackMarks.get(instrument.input.id))?.price ?? 0;
  const currentInstrumentExposure = currentInstrumentMark * (currentInstrumentPosition?.quantity ?? 0);
  const proposedSingle = currentInstrumentExposure + notional;
  if (risk.maxTotalGrossExposure !== undefined && current.grossExposure + notional > risk.maxTotalGrossExposure + 1e-9) return "Maximum total gross exposure exceeded";
  if (risk.maxSingleInstrumentExposure !== undefined && proposedSingle > risk.maxSingleInstrumentExposure + 1e-9) return "Maximum single-instrument exposure exceeded";
  if (risk.maxAllocationPerInstrument !== undefined && current.equity !== null && current.equity > 0 && proposedSingle / current.equity > risk.maxAllocationPerInstrument + 1e-9) return "Maximum single-instrument allocation exceeded";
  if (cash <= 0) return "No available portfolio cash";
  return null;
}

function resolveEntryQuantity(
  instrument: NormalizedInstrument,
  price: number,
  cash: number,
  positions: ReadonlyMap<string, MutablePosition>,
  instruments: readonly NormalizedInstrument[],
  completedMarks: ReadonlyMap<string, CompletedMark>,
  fallbackMarks: ReadonlyMap<string, CompletedMark>,
  peakEquity: number | null,
  assumptions: PortfolioBacktestAssumptions,
): number {
  const sizing = instrument.positionSizing;
  if (sizing.type === "fixed-quantity") return sizing.quantity;
  const account = createAccountSnapshot(null, cash, 0, positions, instruments, completedMarks, fallbackMarks, peakEquity, assumptions.valuation);
  const equity = account.equity ?? cash;
  const amount = sizing.type === "fixed-notional" ? sizing.amount : sizing.type === "percent-equity" ? equity * sizing.percent : equity * sizing.weight;
  const raw = amount / price;
  return instrument.allowFractionalQuantity ? raw : Math.floor(raw);
}

function createAccountSnapshot(
  time: number | null,
  cash: number,
  realizedPnl: number,
  positions: ReadonlyMap<string, MutablePosition>,
  instruments: readonly NormalizedInstrument[],
  completedMarks: ReadonlyMap<string, CompletedMark>,
  fallbackMarks: ReadonlyMap<string, CompletedMark>,
  peakEquity: number | null,
  valuation: PortfolioValuationOptions,
): PortfolioAccountSnapshot {
  const instrumentById = new Map(instruments.map((instrument) => [instrument.input.id, instrument]));
  const marks: PortfolioMark[] = [];
  let unrealized = 0;
  let positionValue = 0;
  let completeUnrealized = true;
  let grossExposure = 0;
  let hasStale = false;
  let hasUnknown = false;
  for (const position of [...positions.values()].sort((left, right) => left.instrumentId.localeCompare(right.instrumentId))) {
    const completed = completedMarks.get(position.instrumentId);
    const fallback = fallbackMarks.get(position.instrumentId);
    const observation = latestCompletedOrFallback(completed, fallback);
    const ageMs = observation === undefined || time === null ? null : Math.max(0, time - observation.observedAt);
    const fallbackIsLatest = fallback !== undefined && (completed === undefined || fallback.observedAt >= completed.observedAt);
    const quality: PortfolioMark["quality"] = fallbackIsLatest
      ? ageMs !== null && ageMs > valuation.maxAgeMs ? "stale" : "execution"
      : completed === undefined ? "unknown" : ageMs !== null && ageMs > valuation.maxAgeMs ? "stale" : "fresh";
    const price = observation?.price ?? null;
    marks.push({ instrumentId: position.instrumentId, price, observedAt: observation?.observedAt ?? null, quality, ageMs });
    if (price === null) {
      completeUnrealized = false;
      hasUnknown = true;
      continue;
    }
    const instrument = instrumentById.get(position.instrumentId);
    if (instrument === undefined) continue;
    const value = price * position.quantity;
    positionValue += value;
    grossExposure += value;
    unrealized += (price - position.entryPrice) * position.quantity;
    if (quality === "stale") hasStale = true;
  }
  const valuationStatus: PortfolioAccountSnapshot["valuationStatus"] = hasUnknown ? "unknown" : hasStale ? "partial" : "complete";
  if (positions.size > 0 && valuation.incomplete === "reject" && valuationStatus !== "complete") throw new PortfolioBacktestValidationError(`Portfolio valuation is ${valuationStatus}; the configured policy rejects incomplete marks at ${time ?? "the final snapshot"}`);
  const unrealizedPnl = completeUnrealized ? unrealized : null;
  const equity = completeUnrealized ? cash + positionValue : null;
  return {
    time,
    cash,
    availableCash: cash,
    realizedPnl,
    unrealizedPnl,
    equity,
    peakEquity,
    drawdown: equity === null || peakEquity === null ? null : Math.max(0, peakEquity - equity),
    drawdownPercent: equity === null || peakEquity === null || peakEquity <= 0 ? null : Math.max(0, (peakEquity - equity) / peakEquity),
    grossExposure,
    netExposure: grossExposure,
    activePositionCount: positions.size,
    valuationStatus,
    marks,
  };
}

function addPeakAndDrawdown(snapshot: PortfolioAccountSnapshot, peakEquity: number | null): PortfolioAccountSnapshot {
  return {
    ...snapshot,
    peakEquity,
    drawdown: snapshot.equity === null || peakEquity === null ? null : Math.max(0, peakEquity - snapshot.equity),
    drawdownPercent: snapshot.equity === null || peakEquity === null || peakEquity <= 0 ? null : Math.max(0, (peakEquity - snapshot.equity) / peakEquity),
  };
}

function positionSnapshot(position: MutablePosition, instrument: NormalizedInstrument, completedMarks: ReadonlyMap<string, CompletedMark>, fallbackMarks: ReadonlyMap<string, CompletedMark>, time: number | null, valuation: PortfolioValuationOptions): PortfolioPosition {
  const completed = completedMarks.get(position.instrumentId);
  const fallback = fallbackMarks.get(position.instrumentId);
  const observation = latestCompletedOrFallback(completed, fallback);
  const ageMs = observation === undefined || time === null ? null : Math.max(0, time - observation.observedAt);
  const markPrice = observation?.price ?? null;
  const fallbackIsLatest = fallback !== undefined && (completed === undefined || fallback.observedAt >= completed.observedAt);
  const markQuality: PortfolioPosition["markQuality"] = observation === undefined ? "unknown" : fallbackIsLatest ? ageMs !== null && ageMs > valuation.maxAgeMs ? "stale" : "execution" : ageMs !== null && ageMs > valuation.maxAgeMs ? "stale" : "fresh";
  return {
    instrumentId: position.instrumentId,
    symbol: instrument.input.symbol,
    direction: "long",
    quantity: position.quantity,
    entrySignalTime: position.entrySignalTime,
    entryFillTime: position.entryFillTime,
    entryPrice: position.entryPrice,
    entryFees: position.entryFees,
    markPrice,
    markTime: observation?.observedAt ?? null,
    markQuality,
    unrealizedPnl: markPrice === null ? null : (markPrice - position.entryPrice) * position.quantity,
  };
}

function calculatePortfolioMetrics(
  initialCapital: number,
  finalAccount: PortfolioAccountSnapshot,
  equityCurve: readonly PortfolioAccountSnapshot[],
  orders: readonly PortfolioOrder[],
  trades: readonly PortfolioTrade[],
  instruments: readonly NormalizedInstrument[],
  positions: ReadonlyMap<string, MutablePosition>,
): PortfolioPerformanceMetrics {
  const winning = trades.filter((trade) => trade.netPnl > 0);
  const losing = trades.filter((trade) => trade.netPnl < 0);
  const grossProfit = trades.reduce((sum, trade) => sum + Math.max(0, trade.grossPnl), 0);
  const grossLoss = trades.reduce((sum, trade) => sum + Math.max(0, -trade.grossPnl), 0);
  const netProfit = finalAccount.equity === null ? null : finalAccount.equity - initialCapital;
  const notionalTurnover = orders.filter((order) => order.status === "filled" && order.executionPrice !== undefined).reduce((sum, order) => sum + order.executionPrice! * order.quantity, 0);
  const perInstrument = instruments.map((instrument): PortfolioInstrumentContribution => {
    const instrumentTrades = trades.filter((trade) => trade.instrumentId === instrument.input.id);
    const instrumentOrders = orders.filter((order) => order.instrumentId === instrument.input.id);
    const open = positions.get(instrument.input.id);
    const unrealizedPnl = open === undefined ? 0 : finalAccount.marks.find((mark) => mark.instrumentId === instrument.input.id)?.price === null || finalAccount.marks.find((mark) => mark.instrumentId === instrument.input.id) === undefined ? null : (finalAccount.marks.find((mark) => mark.instrumentId === instrument.input.id)!.price! - open.entryPrice) * open.quantity;
    const realized = instrumentTrades.reduce((sum, trade) => sum + trade.netPnl, 0);
    const allocated = instrumentTrades.reduce((sum, trade) => sum + trade.entryPrice * trade.quantity, 0) + instrumentOrders.filter((order) => order.action === "enter-long" && order.status === "filled").reduce((sum, order) => sum + (order.executionPrice ?? 0) * order.quantity, 0);
    return {
      instrumentId: instrument.input.id,
      realizedPnl: realized,
      unrealizedPnl,
      netPnl: unrealizedPnl === null ? null : realized + unrealizedPnl,
      fees: instrumentOrders.reduce((sum, order) => sum + order.commission, 0),
      grossExposure: finalAccount.marks.find((mark) => mark.instrumentId === instrument.input.id)?.price === undefined ? 0 : (finalAccount.marks.find((mark) => mark.instrumentId === instrument.input.id)?.price ?? 0) * (open?.quantity ?? 0),
      tradeCount: instrumentTrades.length,
      returnOnAllocatedCapital: allocated <= 0 || unrealizedPnl === null ? null : (realized + unrealizedPnl) / allocated,
    };
  });
  return {
    totalReturn: netProfit === null || initialCapital <= 0 ? null : netProfit / initialCapital,
    netProfit,
    grossProfit,
    grossLoss,
    maxDrawdown: maximumSnapshotValue(equityCurve, (point) => point.drawdown),
    maxDrawdownPercent: maximumSnapshotValue(equityCurve, (point) => point.drawdownPercent),
    realizedPnl: finalAccount.realizedPnl,
    unrealizedPnl: finalAccount.unrealizedPnl,
    totalCommissions: orders.reduce((sum, order) => sum + order.commission, 0),
    grossExposure: maximumSnapshotValue(equityCurve, (point) => point.grossExposure),
    netExposure: maximumSnapshotValue(equityCurve, (point) => point.netExposure),
    portfolioTurnover: initialCapital > 0 ? notionalTurnover / initialCapital : null,
    completedTradeCount: trades.length,
    winningTradeCount: winning.length,
    losingTradeCount: losing.length,
    winRate: trades.length === 0 ? null : winning.length / trades.length,
    perInstrument,
  };
}

function maximumSnapshotValue(points: readonly PortfolioAccountSnapshot[], select: (point: PortfolioAccountSnapshot) => number | null): number | null {
  let maximum: number | null = null;
  for (const point of points) {
    const value = select(point);
    if (value !== null && (maximum === null || value > maximum)) maximum = value;
  }
  return maximum;
}

function latestCompletedOrFallback(completed: CompletedMark | undefined, fallback: CompletedMark | undefined): CompletedMark | undefined {
  if (completed === undefined) return fallback;
  if (fallback === undefined) return completed;
  return fallback.observedAt >= completed.observedAt ? fallback : completed;
}

function createInternalSignals(evaluations: readonly { readonly instrument: NormalizedInstrument; readonly evaluation: StrategyEvaluationResult }[]): InternalSignal[] {
  return evaluations.flatMap(({ instrument, evaluation }) => evaluation.signals.map((signal) => {
    const candle = instrument.candles[signal.index];
    if (candle === undefined) throw new PortfolioBacktestValidationError(`Strategy ${instrument.strategyId} emitted an invalid candle index for ${instrument.input.id}`);
    const availableAt = safeTimeAdd(candle.time, instrument.timeframe.durationMs);
    return { signal: { ...signal, instrumentId: instrument.input.id, availableAt }, instrument, candle, nextCandleIndex: findNextEligibleCandle(instrument.candles, signal.index, availableAt) };
  })).sort((left, right) => compareSignals(left.signal, right.signal));
}

function createScheduledEvents(instruments: readonly NormalizedInstrument[], signals: readonly InternalSignal[]): ScheduledEvents {
  const events: ScheduledEvent[] = [];
  for (const instrument of instruments) {
    instrument.candles.forEach((candle, index) => {
      events.push({ id: `${instrument.input.id}:open:${index}`, time: candle.time, kind: "market-open", priority: 0, instrumentId: instrument.input.id, candleIndex: index, candle });
      events.push({ id: `${instrument.input.id}:complete:${index}`, time: safeTimeAdd(candle.time, instrument.timeframe.durationMs), kind: "bar-complete", priority: 1, instrumentId: instrument.input.id, candleIndex: index, availableAt: safeTimeAdd(candle.time, instrument.timeframe.durationMs), candle });
    });
  }
  for (const signal of signals) {
    if (signal.nextCandleIndex === null) continue;
    const nextCandle = signal.instrument.candles[signal.nextCandleIndex];
    if (nextCandle === undefined) continue;
    events.push({ id: orderIdFor(signal), time: nextCandle.time, kind: "order-fill", priority: 2, instrumentId: signal.instrument.input.id, candleIndex: signal.nextCandleIndex, orderId: orderIdFor(signal), availableAt: signal.signal.availableAt, candle: nextCandle });
  }
  const valuationTimes = [...new Set(events.map((event) => event.time))].sort((left, right) => left - right);
  valuationTimes.forEach((time, index) => events.push({ id: `valuation:${time}:${index}`, time, kind: "valuation", priority: 3 }));
  events.sort(compareEvents);
  return { timeline: events, orders: signals };
}

function normalizeInstruments(options: PortfolioBacktestOptions, registry: StrategyRegistry): NormalizedInstrument[] {
  const policy = options.duplicateTimestampPolicy ?? "reject";
  const accountCurrency = normalizeCurrency(options.accountCurrency);
  const ids = new Set<string>();
  const normalized = options.instruments.map((input) => {
    const id = normalizeIdentifier(input.id, "instrument id");
    if (ids.has(id)) throw new PortfolioBacktestValidationError(`Duplicate instrument id: ${id}`);
    ids.add(id);
    const symbol = normalizeIdentifier(input.symbol, "instrument symbol");
    const quoteCurrency = normalizeCurrency(input.quoteCurrency);
    if (quoteCurrency !== accountCurrency) throw new PortfolioBacktestValidationError(`Instrument ${id} uses ${quoteCurrency}; explicit conversion to account currency ${accountCurrency} is not implemented`);
    const timeframe = parseFixedTimeframe(input.timeframe);
    const candles = normalizeCandles(input.candles, policy, id);
    const strategyId = input.strategy.strategy.trim().toUpperCase();
    if (strategyId.length === 0) throw new PortfolioBacktestValidationError(`Instrument ${id} has an empty strategy id`);
    const parameters = cloneRecord(input.strategy.parameters);
    registry.getMetadata(strategyId);
    const positionSizing = input.execution?.positionSizing === undefined ? clonePortfolioPositionSizing(options.positionSizing) : clonePortfolioPositionSizing(input.execution.positionSizing);
    validateSizing(positionSizing, `Instrument ${id}`);
    const allowFractionalQuantity = input.execution?.allowFractionalQuantity ?? options.allowFractionalQuantity === true;
    const calendar = input.calendar === undefined ? null : normalizeCalendar(input.calendar, id);
    return { input: { ...input, id, symbol, quoteCurrency, timeframe: timeframe.id, candles, strategy: { strategy: strategyId, parameters }, ...(calendar === null ? {} : { calendar }) }, candles, timeframe, calendar, strategyId, parameters, positionSizing, allowFractionalQuantity };
  });
  normalized.sort((left, right) => left.input.id.localeCompare(right.input.id));
  return normalized;
}

function validatePortfolioOptions(options: PortfolioBacktestOptions): void {
  if (!isRecord(options) || !Array.isArray(options.instruments) || options.instruments.length === 0) throw new PortfolioBacktestValidationError("Portfolio backtest requires at least one instrument");
  if (!Number.isFinite(options.initialCapital) || options.initialCapital <= 0) throw new PortfolioBacktestValidationError("Initial portfolio capital must be positive");
  normalizeCurrency(options.accountCurrency);
  validateSizing(options.positionSizing, "Portfolio position sizing");
  validateCost(options.commission, "commission");
  validateCost(options.slippage, "slippage");
  validateRisk(options.risk ?? DEFAULT_RISK);
  const valuation = options.valuation ?? DEFAULT_VALUATION;
  if (valuation.policy !== "last-known-price" || !Number.isFinite(valuation.maxAgeMs) || valuation.maxAgeMs < 0 || (valuation.incomplete !== "allow" && valuation.incomplete !== "reject")) throw new PortfolioBacktestValidationError("Invalid portfolio valuation policy");
}

function validateSizing(sizing: PortfolioPositionSizing, label: string): void {
  if (!isRecord(sizing)) throw new PortfolioBacktestValidationError(`${label} is invalid`);
  if (sizing.type === "fixed-quantity" && (!Number.isFinite(sizing.quantity) || sizing.quantity <= 0)) throw new PortfolioBacktestValidationError(`${label} quantity must be positive`);
  if (sizing.type === "fixed-notional" && (!Number.isFinite(sizing.amount) || sizing.amount <= 0)) throw new PortfolioBacktestValidationError(`${label} amount must be positive`);
  if (sizing.type === "percent-equity" && (!Number.isFinite(sizing.percent) || sizing.percent <= 0 || sizing.percent > 1)) throw new PortfolioBacktestValidationError(`${label} percent must be in (0, 1]`);
  if (sizing.type === "target-weight" && (!Number.isFinite(sizing.weight) || sizing.weight <= 0 || sizing.weight > 1)) throw new PortfolioBacktestValidationError(`${label} target weight must be in (0, 1]`);
  if (sizing.type !== "fixed-quantity" && sizing.type !== "fixed-notional" && sizing.type !== "percent-equity" && sizing.type !== "target-weight") throw new PortfolioBacktestValidationError(`${label} type is unsupported`);
}

function validateCost(cost: { readonly type: string; readonly value: number }, label: string): void {
  if (!isRecord(cost) || (cost.type !== "percent" && cost.type !== "fixed") || !Number.isFinite(cost.value) || cost.value < 0 || cost.type === "percent" && cost.value > 1) throw new PortfolioBacktestValidationError(`Invalid ${label} cost`);
}

function validateRisk(risk: PortfolioRiskOptions): void {
  const nonNegative = [risk.maxTotalGrossExposure, risk.maxSingleInstrumentExposure, risk.minimumAvailableCash, risk.maxDrawdown].filter((value): value is number => value !== undefined);
  if (nonNegative.some((value) => !Number.isFinite(value) || value < 0)) throw new PortfolioBacktestValidationError("Portfolio risk currency limits must be finite and non-negative");
  if (risk.maxAllocationPerInstrument !== undefined && (!Number.isFinite(risk.maxAllocationPerInstrument) || risk.maxAllocationPerInstrument <= 0 || risk.maxAllocationPerInstrument > 1)) throw new PortfolioBacktestValidationError("maxAllocationPerInstrument must be in (0, 1]");
  if (risk.maxDrawdownPercent !== undefined && (!Number.isFinite(risk.maxDrawdownPercent) || risk.maxDrawdownPercent < 0 || risk.maxDrawdownPercent > 1)) throw new PortfolioBacktestValidationError("maxDrawdownPercent must be in [0, 1]");
  if (risk.maxActivePositions !== undefined && (!Number.isInteger(risk.maxActivePositions) || risk.maxActivePositions < 1)) throw new PortfolioBacktestValidationError("maxActivePositions must be a positive integer");
}

function normalizeCandles(candles: readonly Candle[], policy: PortfolioDuplicateTimestampPolicy, instrumentId: string): Candle[] {
  if (!Array.isArray(candles) || candles.length === 0) throw new PortfolioBacktestValidationError(`Instrument ${instrumentId} requires historical candles`);
  const byTime = new Map<number, Candle>();
  candles.forEach((candle, index) => {
    try { validateCandle(candle, index); } catch (error) { throw new PortfolioBacktestValidationError(`Instrument ${instrumentId}: ${error instanceof Error ? error.message : String(error)}`); }
    if (byTime.has(candle.time) && policy === "reject") throw new PortfolioBacktestValidationError(`Instrument ${instrumentId} contains duplicate timestamp ${candle.time}`);
    byTime.set(candle.time, { ...candle });
  });
  return [...byTime.values()].sort((left, right) => left.time - right.time);
}

function normalizeCalendar(calendar: PortfolioCalendarIdentity, instrumentId: string): PortfolioCalendarIdentity {
  if (!isRecord(calendar) || typeof calendar.id !== "string" || calendar.id.trim().length === 0 || typeof calendar.version !== "string" || calendar.version.trim().length === 0) throw new PortfolioBacktestValidationError(`Instrument ${instrumentId} has an invalid calendar identity`);
  return { id: calendar.id.trim(), version: calendar.version.trim() };
}

function normalizeCurrency(value: string): string {
  if (typeof value !== "string" || !/^[A-Z0-9][A-Z0-9._-]{0,15}$/u.test(value.trim().toUpperCase())) throw new PortfolioBacktestValidationError("Currency must be a non-empty explicit code");
  return value.trim().toUpperCase();
}

function normalizeIdentifier(value: string, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new PortfolioBacktestValidationError(`${label} must be non-empty`);
  return value.trim();
}

function cloneOptions(options: PortfolioBacktestOptions): PortfolioBacktestOptions {
  return { ...options, instruments: options.instruments.map((instrument) => ({ ...instrument, candles: instrument.candles.map((candle) => ({ ...candle })), strategy: { strategy: instrument.strategy.strategy, parameters: cloneRecord(instrument.strategy.parameters) }, ...(instrument.calendar === undefined ? {} : { calendar: { ...instrument.calendar } }), ...(instrument.execution === undefined ? {} : { execution: { ...instrument.execution, ...(instrument.execution.positionSizing === undefined ? {} : { positionSizing: clonePortfolioPositionSizing(instrument.execution.positionSizing) }) } }) })), positionSizing: clonePortfolioPositionSizing(options.positionSizing), commission: { ...options.commission }, slippage: { ...options.slippage }, ...(options.risk === undefined ? {} : { risk: cloneRisk(options.risk) }), ...(options.valuation === undefined ? {} : { valuation: { ...options.valuation } }) };
}

function cloneRisk(risk: PortfolioRiskOptions): PortfolioRiskOptions { return { ...risk }; }
function cloneRecord(value: Readonly<Record<string, unknown>>): Record<string, unknown> { return JSON.parse(JSON.stringify(value)) as Record<string, unknown>; }

function findNextEligibleCandle(candles: readonly Candle[], index: number, availableAt: number): number | null {
  for (let cursor = index + 1; cursor < candles.length; cursor += 1) if (candles[cursor]!.time >= availableAt) return cursor;
  return null;
}

function safeTimeAdd(time: number, duration: number): number {
  const value = time + duration;
  if (!Number.isSafeInteger(value)) throw new PortfolioBacktestValidationError("Candle completion timestamp exceeds safe integer range");
  return value;
}

function compareSignals(left: PortfolioSignal | InternalSignal["signal"], right: PortfolioSignal | InternalSignal["signal"]): number {
  return left.availableAt - right.availableAt || left.instrumentId.localeCompare(right.instrumentId) || left.index - right.index || left.id.localeCompare(right.id);
}

function compareEvents(left: ScheduledEvent, right: ScheduledEvent): number {
  return left.time - right.time || left.priority - right.priority || (left.instrumentId ?? "").localeCompare(right.instrumentId ?? "") || (left.orderId ?? "").localeCompare(right.orderId ?? "") || left.id.localeCompare(right.id);
}

function signalEventKey(instrumentId: string, index: number): string { return `${instrumentId}|${index}`; }

function orderIdFor(item: InternalSignal, sequence?: number): string {
  return `${item.instrument.input.id}:${item.signal.strategyId}:order-${sequence ?? item.signal.index}-${item.signal.id.split(":").at(-1) ?? "0"}`;
}

function transitionOrder(order: MutableOrder, next: PortfolioOrderStatus): void {
  if (next === "pending" && order.status !== "submitted" || next === "rejected" && order.status !== "pending" || next === "cancelled" && order.status !== "pending") throw new PortfolioBacktestLifecycleError(`Invalid portfolio order transition ${order.status} -> ${next}`);
  order.status = next;
}

function transitionOrderFilled(order: MutableOrder, referencePrice: number, executionPrice: number, fillTime: number, quantity: number, commission: number): void {
  transitionOrder(order, "filled");
  order.referencePrice = referencePrice;
  order.executionPrice = executionPrice;
  order.fillTime = fillTime;
  order.quantity = quantity;
  order.commission = commission;
  order.slippage = Math.abs(executionPrice - referencePrice);
}

function cloneOrder(order: MutableOrder | PortfolioOrder): PortfolioOrder {
  return { id: order.id, instrumentId: order.instrumentId, strategyId: order.strategyId, signalId: order.signalId, action: order.action, status: order.status, signalTime: order.signalTime, submissionTime: order.submissionTime, quantity: order.quantity, commission: order.commission, slippage: order.slippage, ...(order.fillTime === undefined ? {} : { fillTime: order.fillTime }), ...(order.referencePrice === undefined ? {} : { referencePrice: order.referencePrice }), ...(order.executionPrice === undefined ? {} : { executionPrice: order.executionPrice }), ...(order.reason === undefined ? {} : { reason: order.reason }) };
}

function instrumentSummary(instrument: NormalizedInstrument): PortfolioInstrumentSummary {
  return { id: instrument.input.id, symbol: instrument.input.symbol, quoteCurrency: instrument.input.quoteCurrency, timeframe: instrument.timeframe.id, candleCount: instrument.candles.length, firstTime: instrument.candles[0]?.time ?? null, lastTime: instrument.candles.at(-1)?.time ?? null, calendar: instrument.calendar === null ? null : { ...instrument.calendar }, strategyId: instrument.strategyId, strategyVersion: 1, inputFingerprint: fingerprintCandles(instrument.candles) };
}

function fingerprintCandles(candles: readonly Candle[]): string {
  let hash = 2_166_136_261;
  for (const candle of candles) {
    const value = `${candle.time}|${candle.open}|${candle.high}|${candle.low}|${candle.close}|${candle.volume ?? ""};`;
    for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16_777_619); }
  }
  return `fnv1a32-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function fingerprintPortfolio(instruments: readonly NormalizedInstrument[]): string {
  let hash = 2_166_136_261;
  for (const instrument of instruments) {
    const value = `${instrument.input.id}|${instrument.input.symbol}|${instrument.input.quoteCurrency}|${instrument.timeframe.id}|${fingerprintCandles(instrument.candles)};`;
    for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16_777_619); }
  }
  return `fnv1a32-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function clonePortfolioResult(result: PortfolioBacktestResult): PortfolioBacktestResult {
  return JSON.parse(JSON.stringify(result)) as PortfolioBacktestResult;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
