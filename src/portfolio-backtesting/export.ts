import type {
  PortfolioAccountSnapshot,
  PortfolioBacktestAssumptions,
  PortfolioBacktestResult,
  PortfolioInstrumentContribution,
  PortfolioInstrumentSummary,
  PortfolioPerformanceMetrics,
} from "./types.js";
import type { CorporateAction } from "../corporate-actions.js";

export const OPENKLINE_PORTFOLIO_BACKTEST_RESULT_VERSION = 1 as const;

const MAX_ARRAY_LENGTH = 2_000_000;
const MAX_INSTRUMENTS = 10_000;

export function serializePortfolioBacktestResult(result: PortfolioBacktestResult): string {
  return JSON.stringify({ schemaVersion: OPENKLINE_PORTFOLIO_BACKTEST_RESULT_VERSION, ...result });
}

/**
 * Emits a result document in bounded JSON chunks. Consumers that can write to
 * a stream can avoid creating a second monolithic JSON string for large runs;
 * `serializePortfolioBacktestResult()` remains the compatibility helper.
 */
export function* serializePortfolioBacktestResultChunks(result: PortfolioBacktestResult): IterableIterator<string> {
  yield `{"schemaVersion":${OPENKLINE_PORTFOLIO_BACKTEST_RESULT_VERSION}`;
  yield `,"engineVersion":${json(result.engineVersion)}`;
  yield `,"accountCurrency":${json(result.accountCurrency)}`;
  yield `,"assumptions":${json(result.assumptions)}`;
  yield `,"instruments":`;
  yield* jsonArray(result.instruments);
  yield `,"strategyInputs":`;
  yield* jsonArray(result.strategyInputs);
  yield `,"signals":`;
  yield* jsonArray(result.signals);
  yield `,"timeline":`;
  yield* jsonArray(result.timeline);
  yield `,"orders":`;
  yield* jsonArray(result.orders);
  yield `,"trades":`;
  yield* jsonArray(result.trades);
  yield `,"positions":`;
  yield* jsonArray(result.positions);
  yield `,"equityCurve":`;
  yield* jsonArray(result.equityCurve);
  yield `,"finalAccount":${json(result.finalAccount)}`;
  yield `,"metrics":${json(result.metrics)}`;
  yield `,"inputFingerprint":${json(result.inputFingerprint)}`;
  if (result.corporateActions !== undefined) {
    yield `,"corporateActions":${json(result.corporateActions)}`;
    yield `,"dividendReceivables":${json(result.dividendReceivables ?? [])}`;
    yield `,"corporateActionLedger":${json(result.corporateActionLedger ?? [])}`;
  }
  yield "}";
}

/**
 * Parses a complete result document and validates all financial ledgers before
 * returning a defensive copy. Bounds are intentionally high enough for the
 * supported large-result workloads but prevent unbounded import allocation.
 */
export function parsePortfolioBacktestResult(value: unknown): PortfolioBacktestResult {
  if (!isRecord(value) || value.schemaVersion !== OPENKLINE_PORTFOLIO_BACKTEST_RESULT_VERSION) throw new TypeError("Unsupported portfolio backtest result schema");
  validateResult(value);
  return cloneResult(value as unknown as PortfolioBacktestResult);
}

export function serializePortfolioOrdersCsv(result: PortfolioBacktestResult): string {
  const columns = ["orderId", "instrumentId", "strategyId", "action", "status", "signalTime", "submissionTime", "fillTime", "quantity", "referencePrice", "executionPrice", "commission", "slippage", "reason"];
  const rows = result.orders.map((order) => [order.id, order.instrumentId, order.strategyId, order.action, order.status, order.signalTime, order.submissionTime, order.fillTime ?? "", order.quantity, order.referencePrice ?? "", order.executionPrice ?? "", order.commission, order.slippage, order.reason ?? ""].map(csvCell).join(","));
  return [columns.join(","), ...rows].join("\n");
}

export function serializePortfolioTradesCsv(result: PortfolioBacktestResult): string {
  const columns = ["tradeId", "instrumentId", "direction", "entrySignalTime", "entryFillTime", "entryPrice", "exitSignalTime", "exitFillTime", "exitPrice", "quantity", "grossPnl", "netPnl", "fees", "holdingDurationMs", "exitReason"];
  const rows = result.trades.map((trade) => [trade.id, trade.instrumentId, trade.direction, trade.entrySignalTime, trade.entryFillTime, trade.entryPrice, trade.exitSignalTime, trade.exitFillTime, trade.exitPrice, trade.quantity, trade.grossPnl, trade.netPnl, trade.fees, trade.holdingDurationMs, trade.exitReason].map(csvCell).join(","));
  return [columns.join(","), ...rows].join("\n");
}

export function serializePortfolioEquityCsv(result: PortfolioBacktestResult): string {
  const columns = ["time", "cash", "availableCash", "realizedPnl", "unrealizedPnl", "equity", "peakEquity", "drawdown", "drawdownPercent", "grossExposure", "netExposure", "activePositionCount", "valuationStatus"];
  const rows = result.equityCurve.map((point) => [point.time ?? "", point.cash, point.availableCash, point.realizedPnl, point.unrealizedPnl ?? "", point.equity ?? "", point.peakEquity ?? "", point.drawdown ?? "", point.drawdownPercent ?? "", point.grossExposure, point.netExposure, point.activePositionCount, point.valuationStatus].map(csvCell).join(","));
  return [columns.join(","), ...rows].join("\n");
}

function validateResult(value: Record<string, unknown>): void {
  if (value.engineVersion !== 1 || typeof value.accountCurrency !== "string" || value.accountCurrency.trim().length === 0 || typeof value.inputFingerprint !== "string" || value.inputFingerprint.trim().length === 0) fail("Invalid result metadata");
  const assumptions = record(value.assumptions, "assumptions");
  validateAssumptions(assumptions);
  const instruments = array(value.instruments, "instruments", MAX_INSTRUMENTS);
  const instrumentIds = new Set<string>();
  for (const item of instruments) {
    const instrument = record(item, "instrument");
    const id = nonEmptyString(instrument.id, "instrument id");
    if (instrumentIds.has(id)) fail(`Duplicate instrument id: ${id}`);
    instrumentIds.add(id);
    nonEmptyString(instrument.symbol, "instrument symbol");
    nonEmptyString(instrument.quoteCurrency, "instrument quote currency");
    nonEmptyString(instrument.timeframe, "instrument timeframe");
    nonNegativeInteger(instrument.candleCount, "instrument candle count");
    nullableSafeInteger(instrument.firstTime, "instrument first time");
    nullableSafeInteger(instrument.lastTime, "instrument last time");
    nonEmptyString(instrument.strategyId, "instrument strategy id");
    if (instrument.strategyVersion !== 1) fail("Unsupported instrument strategy version");
    nonEmptyString(instrument.inputFingerprint, "instrument fingerprint");
    if (instrument.calendar !== null) {
      const calendar = record(instrument.calendar, "instrument calendar");
      nonEmptyString(calendar.id, "calendar id");
      nonEmptyString(calendar.version, "calendar version");
    }
  }
  array(value.strategyInputs, "strategy inputs", MAX_INSTRUMENTS).forEach((item) => { record(item, "strategy input"); });
  const signals = array(value.signals, "signals", MAX_ARRAY_LENGTH);
  const signalIds = new Set<string>();
  for (const item of signals) validateSignal(record(item, "signal"), instrumentIds, signalIds);
  const timeline = array(value.timeline, "timeline", MAX_ARRAY_LENGTH);
  const timelineIds = new Set<string>();
  for (const item of timeline) validateTimeline(record(item, "timeline event"), instrumentIds, timelineIds);
  const orders = array(value.orders, "orders", MAX_ARRAY_LENGTH);
  const orderIds = new Set<string>();
  for (const item of orders) validateOrder(record(item, "order"), instrumentIds, orderIds);
  const trades = array(value.trades, "trades", MAX_ARRAY_LENGTH);
  const tradeIds = new Set<string>();
  for (const item of trades) validateTrade(record(item, "trade"), instrumentIds, tradeIds);
  const positions = array(value.positions, "positions", MAX_INSTRUMENTS);
  const positionIds = new Set<string>();
  for (const item of positions) validatePosition(record(item, "position"), instrumentIds, positionIds);
  const equityCurve = array(value.equityCurve, "equity curve", MAX_ARRAY_LENGTH);
  for (const item of equityCurve) validateSnapshot(record(item, "equity snapshot"), instrumentIds);
  validateSnapshot(record(value.finalAccount, "final account"), instrumentIds);
  validateMetrics(record(value.metrics, "metrics"), instrumentIds);
  if (value.corporateActions !== undefined) validateCorporateActions(value.corporateActions, instrumentIds);
  if (value.dividendReceivables !== undefined) validateDividendReceivables(value.dividendReceivables, instrumentIds);
  if (value.corporateActionLedger !== undefined) validateCorporateActionLedger(value.corporateActionLedger, instrumentIds);
}

function validateAssumptions(value: Record<string, unknown>): void {
  if (value.execution !== "next-eligible-bar-open" || value.endOfData !== "cancel-unfilled-no-next-eligible-bar" || value.longOnly !== true || value.leverage !== "none") fail("Invalid backtest assumptions");
  nonEmptyString(value.accountCurrency, "assumption account currency");
  positiveFinite(value.initialCapital, "assumption initial capital");
  const priority = array(value.eventPriority, "assumption event priority", 4);
  if (priority.length !== 4 || priority.some((item, index) => item !== (["market-open", "bar-complete", "order-fill", "valuation"] as const)[index])) fail("Invalid event priority");
  if (value.corporateActionEventPriority !== undefined) {
    const corporatePriority = array(value.corporateActionEventPriority, "corporate-action event priority", 6);
    if (corporatePriority.length !== 6 || corporatePriority.some((item, index) => item !== (["corporate-action-effective", "market-open", "bar-complete", "order-fill", "corporate-action-payment", "valuation"] as const)[index])) fail("Invalid corporate-action event priority");
    const policy = record(value.corporateActionPolicy, "corporate-action policy");
    if (policy.pendingOrderPolicy !== "cancel" || policy.fractionalSharePolicy !== "reject" || policy.dividendSettlement !== "payment-time" || policy.receivableValuation !== "include-in-equity") fail("Invalid corporate-action policy");
  } else if (value.corporateActionPolicy !== undefined) {
    fail("Corporate-action policy requires corporate-action event priority");
  }
  validateSizing(record(value.positionSizing, "assumption position sizing"));
  validateCost(record(value.commission, "assumption commission"));
  validateCost(record(value.slippage, "assumption slippage"));
  validateRisk(record(value.risk, "assumption risk"));
  const valuation = record(value.valuation, "assumption valuation");
  if (valuation.policy !== "last-known-price" || (valuation.incomplete !== "allow" && valuation.incomplete !== "reject")) fail("Invalid valuation policy");
  nonNegativeFinite(valuation.maxAgeMs, "assumption valuation age");
  if (!Number.isSafeInteger(valuation.maxAgeMs)) fail("Assumption valuation age must be a safe integer");
  if (value.duplicateTimestampPolicy !== "reject" && value.duplicateTimestampPolicy !== "last-write-wins") fail("Invalid duplicate timestamp policy");
  if (typeof value.allowFractionalQuantity !== "boolean") fail("Invalid fractional quantity policy");
}

function validateSignal(value: Record<string, unknown>, instrumentIds: ReadonlySet<string>, ids: Set<string>): void {
  const id = nonEmptyString(value.id, "signal id");
  if (ids.has(id)) fail(`Duplicate signal id: ${id}`);
  ids.add(id);
  validateInstrumentRef(value.instrumentId, instrumentIds);
  nonEmptyString(value.strategyId, "signal strategy id");
  if (!["enter-long", "exit-long", "enter-short", "exit-short"].includes(String(value.action))) fail("Invalid signal action");
  nonNegativeInteger(value.index, "signal index");
  safeInteger(value.time, "signal time");
  safeInteger(value.availableAt, "signal availability");
  if (typeof value.reason !== "string") fail("Invalid signal reason");
  if (value.value !== undefined) finite(value.value, "signal value");
}

function validateTimeline(value: Record<string, unknown>, instrumentIds: ReadonlySet<string>, ids: Set<string>): void {
  const id = nonEmptyString(value.id, "timeline id");
  if (ids.has(id)) fail(`Duplicate timeline id: ${id}`);
  ids.add(id);
  safeInteger(value.time, "timeline time");
  if (!["market-open", "order-fill", "bar-complete", "valuation", "corporate-action"].includes(String(value.kind))) fail("Invalid timeline kind");
  if (![0, 1, 2, 3, 4, 5].includes(Number(value.priority))) fail("Invalid timeline priority");
  if (value.kind === "corporate-action") {
    if (value.priority !== 0 && value.priority !== 4) fail("Invalid corporate-action timeline priority");
    validateInstrumentRef(value.instrumentId, instrumentIds);
    nonEmptyString(value.corporateActionId, "timeline corporate-action id");
    if (value.corporateActionPhase !== "effective" && value.corporateActionPhase !== "payment") fail("Invalid corporate-action timeline phase");
  } else if (value.corporateActionId !== undefined || value.corporateActionPhase !== undefined) {
    fail("Non-corporate timeline event contains corporate-action fields");
  }
  if (value.instrumentId !== undefined) validateInstrumentRef(value.instrumentId, instrumentIds);
  if (value.orderId !== undefined) nonEmptyString(value.orderId, "timeline order id");
  if (value.candleIndex !== undefined) nonNegativeInteger(value.candleIndex, "timeline candle index");
  if (value.availableAt !== undefined) safeInteger(value.availableAt, "timeline availability");
}

function validateCorporateActions(value: unknown, instrumentIds: ReadonlySet<string>): void {
  const actions = array(value, "corporate actions", MAX_ARRAY_LENGTH);
  const ids = new Set<string>();
  for (const item of actions) {
    const action = record(item, "corporate action");
    const id = nonEmptyString(action.id, "corporate action id");
    if (ids.has(id)) fail(`Duplicate corporate action id: ${id}`);
    ids.add(id);
    validateInstrumentRef(action.instrumentId, instrumentIds);
    if (action.kind !== "stock-split" && action.kind !== "reverse-stock-split" && action.kind !== "cash-dividend") fail("Invalid corporate action kind");
    safeInteger(action.effectiveTime, "corporate action effective time");
    if (!Number.isSafeInteger(action.revision) || Number(action.revision) < 1) fail("Invalid corporate action revision");
    if (action.knowledgeTime !== undefined) safeInteger(action.knowledgeTime, "corporate action knowledge time");
    if (action.announcementTime !== undefined) safeInteger(action.announcementTime, "corporate action announcement time");
    const source = record(action.source, "corporate action source");
    nonEmptyString(source.id, "corporate action source id");
    nonEmptyString(source.version, "corporate action source version");
    if (source.provenance !== undefined && typeof source.provenance !== "string") fail("Invalid corporate action provenance");
    if (action.kind === "stock-split" || action.kind === "reverse-stock-split") {
      positiveFinite(action.newShares, "corporate action new shares");
      positiveFinite(action.oldShares, "corporate action old shares");
      if (action.kind === "stock-split" && Number(action.newShares) < Number(action.oldShares) || action.kind === "reverse-stock-split" && Number(action.newShares) >= Number(action.oldShares)) fail("Invalid corporate action split direction");
    } else {
      safeInteger(action.exDividendTime, "cash dividend ex-dividend time");
      if (Number(action.exDividendTime) !== Number(action.effectiveTime)) fail("Cash dividend effective and ex-dividend times must match");
      nonNegativeFinite(action.amountPerShare, "cash dividend amount per share");
      nonEmptyString(action.currency, "cash dividend currency");
      if (action.paymentTime !== undefined) {
        safeInteger(action.paymentTime, "cash dividend payment time");
        if (Number(action.paymentTime) < Number(action.exDividendTime)) fail("Cash dividend payment precedes ex-dividend time");
      }
      if (action.declarationTime !== undefined) {
        safeInteger(action.declarationTime, "cash dividend declaration time");
        if (Number(action.declarationTime) > Number(action.exDividendTime)) fail("Cash dividend declaration follows ex-dividend time");
      }
    }
  }
}

function validateDividendReceivables(value: unknown, instrumentIds: ReadonlySet<string>): void {
  const receivables = array(value, "dividend receivables", MAX_ARRAY_LENGTH);
  const ids = new Set<string>();
  for (const item of receivables) {
    const receivable = record(item, "dividend receivable");
    const id = nonEmptyString(receivable.id, "dividend receivable id");
    if (ids.has(id)) fail(`Duplicate dividend receivable id: ${id}`);
    ids.add(id);
    nonEmptyString(receivable.actionId, "dividend receivable action id");
    validateInstrumentRef(receivable.instrumentId, instrumentIds);
    nonEmptyString(receivable.currency, "dividend receivable currency");
    positiveFinite(receivable.quantity, "dividend receivable quantity");
    nonNegativeFinite(receivable.amountPerShare, "dividend receivable amount per share");
    nonNegativeFinite(receivable.amount, "dividend receivable amount");
    safeInteger(receivable.entitlementTime, "dividend receivable entitlement time");
    if (receivable.paymentTime !== null) safeInteger(receivable.paymentTime, "dividend receivable payment time");
    if (!["entitled", "accrued", "payable", "paid", "unsettled"].includes(String(receivable.status))) fail("Invalid dividend receivable status");
  }
}

function validateCorporateActionLedger(value: unknown, instrumentIds: ReadonlySet<string>): void {
  const records = array(value, "corporate action ledger", MAX_ARRAY_LENGTH);
  const ids = new Set<string>();
  for (const item of records) {
    const recordValue = record(item, "corporate action ledger record");
    const id = nonEmptyString(recordValue.id, "corporate action ledger id");
    if (ids.has(id)) fail(`Duplicate corporate action ledger id: ${id}`);
    ids.add(id);
    nonEmptyString(recordValue.actionId, "corporate action ledger action id");
    validateInstrumentRef(recordValue.instrumentId, instrumentIds);
    if (!["stock-split", "reverse-stock-split", "cash-dividend"].includes(String(recordValue.kind))) fail("Invalid corporate action ledger kind");
    if (recordValue.phase !== "effective" && recordValue.phase !== "payment") fail("Invalid corporate action ledger phase");
    safeInteger(recordValue.time, "corporate action ledger time");
    if (!["applied", "cancelled", "rejected", "unsettled"].includes(String(recordValue.status))) fail("Invalid corporate action ledger status");
    for (const key of ["quantityBefore", "quantityAfter", "costBasisBefore", "costBasisAfter", "amount"] as const) if (recordValue[key] !== undefined) nonNegativeFinite(recordValue[key], `corporate action ledger ${key}`);
    if (recordValue.reason !== undefined && typeof recordValue.reason !== "string") fail("Invalid corporate action ledger reason");
  }
}

function validateOrder(value: Record<string, unknown>, instrumentIds: ReadonlySet<string>, ids: Set<string>): void {
  const id = nonEmptyString(value.id, "order id");
  if (ids.has(id)) fail(`Duplicate order id: ${id}`);
  ids.add(id);
  validateInstrumentRef(value.instrumentId, instrumentIds);
  nonEmptyString(value.strategyId, "order strategy id");
  nonEmptyString(value.signalId, "order signal id");
  if (!["enter-long", "exit-long", "enter-short", "exit-short"].includes(String(value.action))) fail("Invalid order action");
  if (!["submitted", "pending", "filled", "rejected", "cancelled"].includes(String(value.status))) fail("Invalid order status");
  safeInteger(value.signalTime, "order signal time");
  safeInteger(value.submissionTime, "order submission time");
  nonNegativeFinite(value.quantity, "order quantity");
  nonNegativeFinite(value.commission, "order commission");
  nonNegativeFinite(value.slippage, "order slippage");
  if (value.fillTime !== undefined) safeInteger(value.fillTime, "order fill time");
  if (value.referencePrice !== undefined) positiveFinite(value.referencePrice, "order reference price");
  if (value.executionPrice !== undefined) positiveFinite(value.executionPrice, "order execution price");
  if (value.reason !== undefined && typeof value.reason !== "string") fail("Invalid order reason");
  if (value.status === "filled" && (value.fillTime === undefined || value.executionPrice === undefined || Number(value.quantity) <= 0)) fail("Filled orders require execution details");
}

function validateTrade(value: Record<string, unknown>, instrumentIds: ReadonlySet<string>, ids: Set<string>): void {
  const id = nonEmptyString(value.id, "trade id");
  if (ids.has(id)) fail(`Duplicate trade id: ${id}`);
  ids.add(id);
  validateInstrumentRef(value.instrumentId, instrumentIds);
  if (value.direction !== "long") fail("Invalid trade direction");
  safeInteger(value.entrySignalTime, "trade entry signal time");
  safeInteger(value.entryFillTime, "trade entry fill time");
  safeInteger(value.exitSignalTime, "trade exit signal time");
  safeInteger(value.exitFillTime, "trade exit fill time");
  positiveFinite(value.entryPrice, "trade entry price");
  positiveFinite(value.exitPrice, "trade exit price");
  positiveFinite(value.quantity, "trade quantity");
  finite(value.grossPnl, "trade gross pnl");
  finite(value.netPnl, "trade net pnl");
  nonNegativeFinite(value.fees, "trade fees");
  nonNegativeFinite(value.holdingDurationMs, "trade holding duration");
  if (typeof value.exitReason !== "string") fail("Invalid trade exit reason");
}

function validatePosition(value: Record<string, unknown>, instrumentIds: ReadonlySet<string>, ids: Set<string>): void {
  const id = validateInstrumentRef(value.instrumentId, instrumentIds);
  if (ids.has(id)) fail(`Duplicate position for instrument: ${id}`);
  ids.add(id);
  nonEmptyString(value.symbol, "position symbol");
  if (value.direction !== "long") fail("Invalid position direction");
  positiveFinite(value.quantity, "position quantity");
  safeInteger(value.entrySignalTime, "position entry signal time");
  safeInteger(value.entryFillTime, "position entry fill time");
  positiveFinite(value.entryPrice, "position entry price");
  nonNegativeFinite(value.entryFees, "position entry fees");
  nullableFinite(value.markPrice, "position mark price");
  nullableSafeInteger(value.markTime, "position mark time");
  if (!["fresh", "stale", "unknown", "execution"].includes(String(value.markQuality))) fail("Invalid position mark quality");
  nullableFinite(value.unrealizedPnl, "position unrealized pnl");
  if (value.aggregateCostBasis !== undefined) nonNegativeFinite(value.aggregateCostBasis, "position aggregate cost basis");
}

function validateSnapshot(value: Record<string, unknown>, instrumentIds: ReadonlySet<string>): void {
  nullableSafeInteger(value.time, "snapshot time");
  finite(value.cash, "snapshot cash");
  finite(value.availableCash, "snapshot available cash");
  finite(value.realizedPnl, "snapshot realized pnl");
  nullableFinite(value.unrealizedPnl, "snapshot unrealized pnl");
  nullableFinite(value.equity, "snapshot equity");
  nullableFinite(value.peakEquity, "snapshot peak equity");
  nullableFinite(value.drawdown, "snapshot drawdown");
  nullableFinite(value.drawdownPercent, "snapshot drawdown percent");
  if (value.dividendReceivable !== undefined) nonNegativeFinite(value.dividendReceivable, "snapshot dividend receivable");
  if (value.dividendIncome !== undefined) nonNegativeFinite(value.dividendIncome, "snapshot dividend income");
  nonNegativeFinite(value.grossExposure, "snapshot gross exposure");
  finite(value.netExposure, "snapshot net exposure");
  nonNegativeInteger(value.activePositionCount, "snapshot active positions");
  if (!["complete", "partial", "unknown"].includes(String(value.valuationStatus))) fail("Invalid snapshot valuation status");
  const marks = array(value.marks, "snapshot marks", MAX_INSTRUMENTS);
  const ids = new Set<string>();
  for (const item of marks) {
    const mark = record(item, "snapshot mark");
    const id = validateInstrumentRef(mark.instrumentId, instrumentIds);
    if (ids.has(id)) fail(`Duplicate snapshot mark: ${id}`);
    ids.add(id);
    nullableFinite(mark.price, "mark price");
    nullableSafeInteger(mark.observedAt, "mark observed time");
    if (!["fresh", "stale", "unknown", "execution"].includes(String(mark.quality))) fail("Invalid mark quality");
    nullableFinite(mark.ageMs, "mark age");
  }
}

function validateMetrics(value: Record<string, unknown>, instrumentIds: ReadonlySet<string>): void {
  nullableFinite(value.totalReturn, "metric total return");
  nullableFinite(value.netProfit, "metric net profit");
  finite(value.grossProfit, "metric gross profit");
  finite(value.grossLoss, "metric gross loss");
  nullableFinite(value.maxDrawdown, "metric max drawdown");
  nullableFinite(value.maxDrawdownPercent, "metric max drawdown percent");
  finite(value.realizedPnl, "metric realized pnl");
  nullableFinite(value.unrealizedPnl, "metric unrealized pnl");
  nonNegativeFinite(value.totalCommissions, "metric commissions");
  nullableFinite(value.grossExposure, "metric gross exposure");
  nullableFinite(value.netExposure, "metric net exposure");
  nullableFinite(value.portfolioTurnover, "metric turnover");
  for (const key of ["completedTradeCount", "winningTradeCount", "losingTradeCount"] as const) nonNegativeInteger(value[key], `metric ${key}`);
  nullableFinite(value.winRate, "metric win rate");
  const contributions = array(value.perInstrument, "instrument contributions", MAX_INSTRUMENTS);
  const ids = new Set<string>();
  for (const item of contributions) {
    const contribution = record(item, "instrument contribution");
    const id = validateInstrumentRef(contribution.instrumentId, instrumentIds);
    if (ids.has(id)) fail(`Duplicate instrument contribution: ${id}`);
    ids.add(id);
    finite(contribution.realizedPnl, "contribution realized pnl");
    nullableFinite(contribution.unrealizedPnl, "contribution unrealized pnl");
    nullableFinite(contribution.netPnl, "contribution net pnl");
    nonNegativeFinite(contribution.fees, "contribution fees");
    nonNegativeFinite(contribution.grossExposure, "contribution exposure");
    nonNegativeInteger(contribution.tradeCount, "contribution trade count");
    nullableFinite(contribution.returnOnAllocatedCapital, "contribution return");
    if (contribution.dividendIncome !== undefined) nonNegativeFinite(contribution.dividendIncome, "contribution dividend income");
    if (contribution.corporateActionIds !== undefined) {
      const actionIds = array(contribution.corporateActionIds, "contribution corporate action ids", MAX_ARRAY_LENGTH);
      actionIds.forEach((actionId) => nonEmptyString(actionId, "contribution corporate action id"));
    }
  }
  if (value.dividendIncome !== undefined) nonNegativeFinite(value.dividendIncome, "metric dividend income");
  if (value.priceReturn !== undefined) nullableFinite(value.priceReturn, "metric price return");
  if (value.corporateActionCount !== undefined) nonNegativeInteger(value.corporateActionCount, "metric corporate action count");
}

function validateSizing(value: Record<string, unknown>): void {
  if (value.type === "fixed-quantity") positiveFinite(value.quantity, "fixed quantity");
  else if (value.type === "fixed-notional") positiveFinite(value.amount, "fixed notional");
  else if (value.type === "percent-equity") fraction(value.percent, "percent equity");
  else if (value.type === "target-weight") fraction(value.weight, "target weight");
  else fail("Invalid position sizing");
}

function validateCost(value: Record<string, unknown>): void {
  if (value.type !== "percent" && value.type !== "fixed") fail("Invalid transaction cost type");
  nonNegativeFinite(value.value, "transaction cost");
  if (value.type === "percent" && Number(value.value) > 1) fail("Transaction cost percent exceeds one");
}

function validateRisk(value: Record<string, unknown>): void {
  for (const key of ["maxTotalGrossExposure", "maxSingleInstrumentExposure", "minimumAvailableCash", "maxDrawdown"] as const) if (value[key] !== undefined) nonNegativeFinite(value[key], `risk ${key}`);
  for (const key of ["maxAllocationPerInstrument", "maxDrawdownPercent"] as const) if (value[key] !== undefined) fraction(value[key], `risk ${key}`);
  if (value.maxActivePositions !== undefined && (!Number.isSafeInteger(value.maxActivePositions) || Number(value.maxActivePositions) < 1)) fail("Invalid risk active position limit");
  if (value.stopNewOrdersOnDrawdown !== undefined && typeof value.stopNewOrdersOnDrawdown !== "boolean") fail("Invalid drawdown stop policy");
}

function validateInstrumentRef(value: unknown, instrumentIds: ReadonlySet<string>): string {
  const id = nonEmptyString(value, "instrument reference");
  if (!instrumentIds.has(id)) fail(`Unknown instrument reference: ${id}`);
  return id;
}

function cloneResult(result: PortfolioBacktestResult): PortfolioBacktestResult {
  return {
    engineVersion: result.engineVersion,
    accountCurrency: result.accountCurrency,
    assumptions: cloneAssumptions(result.assumptions),
    instruments: result.instruments.map(cloneInstrument),
    strategyInputs: result.strategyInputs.map((input) => JSON.parse(JSON.stringify(input)) as typeof input),
    signals: result.signals.map((signal) => ({ ...signal })),
    timeline: result.timeline.map((event) => ({ ...event })),
    orders: result.orders.map((order) => ({ ...order })),
    trades: result.trades.map((trade) => ({ ...trade })),
    positions: result.positions.map((position) => ({ ...position })),
    equityCurve: result.equityCurve.map(cloneSnapshot),
    finalAccount: cloneSnapshot(result.finalAccount),
    metrics: cloneMetrics(result.metrics),
    inputFingerprint: result.inputFingerprint,
    ...(result.corporateActions === undefined ? {} : { corporateActions: result.corporateActions.map(cloneCorporateAction) }),
    ...(result.dividendReceivables === undefined ? {} : { dividendReceivables: result.dividendReceivables.map((receivable) => ({ ...receivable })) }),
    ...(result.corporateActionLedger === undefined ? {} : { corporateActionLedger: result.corporateActionLedger.map((record) => ({ ...record })) }),
  };
}

function cloneAssumptions(value: PortfolioBacktestAssumptions): PortfolioBacktestAssumptions {
  return {
    ...value,
    eventPriority: [...value.eventPriority],
    positionSizing: { ...value.positionSizing },
    commission: { ...value.commission },
    slippage: { ...value.slippage },
    risk: { ...value.risk },
    valuation: { ...value.valuation },
    ...(value.corporateActionPolicy === undefined ? {} : { corporateActionPolicy: { ...value.corporateActionPolicy } }),
    ...(value.corporateActionEventPriority === undefined ? {} : { corporateActionEventPriority: [...value.corporateActionEventPriority] }),
  };
}

function cloneInstrument(value: PortfolioInstrumentSummary): PortfolioInstrumentSummary {
  return { ...value, ...(value.calendar === null ? {} : { calendar: { ...value.calendar } }) };
}

function cloneSnapshot(value: PortfolioAccountSnapshot): PortfolioAccountSnapshot {
  return { ...value, marks: value.marks.map((mark) => ({ ...mark })) };
}

function cloneMetrics(value: PortfolioPerformanceMetrics): PortfolioPerformanceMetrics {
  return { ...value, perInstrument: value.perInstrument.map((item: PortfolioInstrumentContribution) => ({ ...item, ...(item.corporateActionIds === undefined ? {} : { corporateActionIds: [...item.corporateActionIds] }) })) };
}

function cloneCorporateAction(value: CorporateAction): CorporateAction {
  return { ...value, source: { ...value.source } } as CorporateAction;
}

function array(value: unknown, label: string, maximum: number): unknown[] {
  if (!Array.isArray(value)) fail(`Invalid ${label}`);
  if (value.length > maximum) fail(`${label} exceeds the supported import limit of ${maximum}`);
  return value;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) fail(`Invalid ${label}`);
  return value;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) fail(`Invalid ${label}`);
  return value;
}

function finite(value: unknown, label: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`Invalid ${label}`);
}

function positiveFinite(value: unknown, label: string): void {
  finite(value, label);
  if (Number(value) <= 0) fail(`Invalid ${label}`);
}

function nonNegativeFinite(value: unknown, label: string): void {
  finite(value, label);
  if (Number(value) < 0) fail(`Invalid ${label}`);
}

function fraction(value: unknown, label: string): void {
  finite(value, label);
  if (Number(value) <= 0 || Number(value) > 1) fail(`Invalid ${label}`);
}

function safeInteger(value: unknown, label: string): void {
  if (!Number.isSafeInteger(value)) fail(`Invalid ${label}`);
}

function nullableSafeInteger(value: unknown, label: string): void {
  if (value !== null) safeInteger(value, label);
}

function nullableFinite(value: unknown, label: string): void {
  if (value !== null) finite(value, label);
}

function nonNegativeInteger(value: unknown, label: string): void {
  if (!Number.isSafeInteger(value) || Number(value) < 0) fail(`Invalid ${label}`);
}

function fail(message: string): never {
  throw new TypeError(`Invalid portfolio backtest result document: ${message}`);
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function* jsonArray(values: readonly unknown[]): IterableIterator<string> {
  yield "[";
  for (let index = 0; index < values.length; index += 1) {
    if (index > 0) yield ",";
    yield json(values[index]);
  }
  yield "]";
}

function json(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new TypeError("Portfolio result contains a value that cannot be serialized");
  return serialized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
