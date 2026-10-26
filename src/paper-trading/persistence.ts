import {
  OPENKLINE_PAPER_TRADING_VERSION,
  PaperTradingPersistenceError,
  type PaperAccountSnapshot,
  type PaperMarketEvent,
  type PaperOrder,
  type PaperOrderFill,
  type PaperPosition,
  type PaperTrade,
  type PaperTradingDocument,
  type PaperTradingJournalEvent,
  type PaperJsonValue,
} from "./types.js";

/** Parse a versioned paper-account document without executing any user input. */
export function parsePaperTradingDocument(value: unknown): PaperTradingDocument {
  if (!isRecord(value)) throw new PaperTradingPersistenceError("Paper Trading state must be a JSON object");
  if (value.version !== OPENKLINE_PAPER_TRADING_VERSION) throw new PaperTradingPersistenceError(`Unsupported Paper Trading state version: ${String(value.version)}`);
  if (!isNonNegativeInteger(value.revision)) throw new PaperTradingPersistenceError("Paper Trading state revision must be a non-negative integer");
  const account = parseAccount(value.account);
  const snapshot = parseSnapshot(value.snapshot, account);
  const orders = parseArray(value.orders, "orders", parseOrder);
  const trades = parseArray(value.trades, "trades", parseTrade);
  const journal = parseArray(value.journal, "journal", parseJournalEvent);
  const processedMarketEventIds = parseStringArray(value.processedMarketEventIds, "processedMarketEventIds");
  assertUnique(orders.map((order) => order.id), "order ids");
  assertUnique(orders.map((order) => order.idempotencyKey), "order idempotency keys");
  assertUnique(journal.map((event) => event.id), "journal ids");
  assertUnique(processedMarketEventIds, "processed market event ids");
  for (const order of orders) if (order.accountId !== account.id || order.symbol !== account.symbol) throw new PaperTradingPersistenceError(`Order ${order.id} does not belong to account ${account.id}`);
  for (const trade of trades) if (trade.accountId !== account.id || trade.symbol !== account.symbol) throw new PaperTradingPersistenceError(`Trade ${trade.id} does not belong to account ${account.id}`);
  return { version: OPENKLINE_PAPER_TRADING_VERSION, revision: value.revision, account, snapshot, orders, trades, journal, processedMarketEventIds };
}

/** Serialize only validated, JSON-compatible state. Functions and clock objects are excluded. */
export function serializePaperTradingDocument(document: PaperTradingDocument): string {
  const parsed = parsePaperTradingDocument(document);
  return JSON.stringify(parsed);
}

function parseAccount(value: unknown): PaperTradingDocument["account"] {
  if (!isRecord(value)) throw new PaperTradingPersistenceError("Paper Trading account is missing");
  const execution = value.execution;
  if (!isRecord(execution) || !isCost(execution.commission) || !isCost(execution.slippage) || !isNonNegativeInteger(execution.maxQuoteAgeMs) || typeof execution.allowFractionalQuantity !== "boolean") throw new PaperTradingPersistenceError("Paper Trading execution configuration is invalid");
  const risk = value.risk;
  if (risk !== undefined && (!isRecord(risk) || !optionalPositive(risk.maxOrderNotional) || !optionalPositive(risk.maxOrderQuantity) || !optionalPositive(risk.maxPositionExposure) || !optionalPositive(risk.maxSessionLoss) || !optionalFraction(risk.maxDrawdownPercent) || !optionalInteger(risk.maxPendingOrders))) throw new PaperTradingPersistenceError("Paper Trading risk configuration is invalid");
  if (!isString(value.id) || !isString(value.displayName) || !isString(value.symbol) || !isString(value.currency) || !isPositive(value.initialBalance)) throw new PaperTradingPersistenceError("Paper Trading account identity is invalid");
  return {
    id: value.id,
    displayName: value.displayName,
    symbol: value.symbol,
    currency: value.currency,
    initialBalance: value.initialBalance,
    execution: {
      commission: execution.commission,
      slippage: execution.slippage,
      maxQuoteAgeMs: execution.maxQuoteAgeMs,
      allowFractionalQuantity: execution.allowFractionalQuantity,
      ...(execution.minimumQuantity === undefined ? {} : { minimumQuantity: requirePositive(execution.minimumQuantity, "minimumQuantity") }),
    },
    ...(risk === undefined ? {} : { risk: { ...risk } }),
  };
}

function parseSnapshot(value: unknown, account: PaperTradingDocument["account"]): PaperAccountSnapshot {
  if (!isRecord(value)) throw new PaperTradingPersistenceError("Paper Trading snapshot is missing");
  const position = value.position === null ? null : parsePosition(value.position, account.symbol);
  const lastMarketEvent = value.lastMarketEvent === null ? null : parseMarketEvent(value.lastMarketEvent);
  const initialBalance = numberField(value, "initialBalance");
  const cash = numberField(value, "cash");
  const reservedCash = numberField(value, "reservedCash");
  const availableCash = numberField(value, "availableCash");
  const realizedPnl = numberField(value, "realizedPnl");
  const unrealizedPnl = numberField(value, "unrealizedPnl");
  const equity = numberField(value, "equity");
  const totalFees = numberField(value, "totalFees");
  const highWaterMark = numberField(value, "highWaterMark");
  const drawdown = numberField(value, "drawdown");
  if (value.drawdownPercent !== null && !isFiniteNumber(value.drawdownPercent)) throw new PaperTradingPersistenceError("Snapshot drawdownPercent must be finite or null");
  if (value.version !== OPENKLINE_PAPER_TRADING_VERSION || value.accountId !== account.id || value.displayName !== account.displayName || value.symbol !== account.symbol || value.currency !== account.currency || value.status !== "active" && value.status !== "disposed" || typeof value.lastDiagnostic !== "string" && value.lastDiagnostic !== null || value.tradingHalted !== undefined && typeof value.tradingHalted !== "boolean" || value.haltReason !== undefined && typeof value.haltReason !== "string" && value.haltReason !== null) throw new PaperTradingPersistenceError("Paper Trading snapshot identity is invalid");
  return { version: OPENKLINE_PAPER_TRADING_VERSION, accountId: account.id, displayName: account.displayName, symbol: account.symbol, currency: account.currency, status: value.status, initialBalance, cash, reservedCash, availableCash, position, realizedPnl, unrealizedPnl, equity, totalFees, highWaterMark, drawdown, drawdownPercent: value.drawdownPercent, tradingHalted: value.tradingHalted ?? false, haltReason: value.haltReason ?? null, lastMarketEvent, lastDiagnostic: value.lastDiagnostic };
}

function parseOrder(value: unknown): PaperOrder {
  if (!isRecord(value) || !isString(value.id) || !isString(value.idempotencyKey) || !isString(value.accountId) || !isString(value.symbol) || (value.side !== "buy" && value.side !== "sell") || value.type !== "market" || !isSizing(value.requestedSizing) || !isPositive(value.quantity) || !isNonNegativeInteger(value.submittedAt) || !isNonNegativeInteger(value.reservedCash) || !isOrderStatus(value.status)) throw new PaperTradingPersistenceError("Paper Trading order is invalid");
  if (value.status === "filled" && !isRecord(value.fill)) throw new PaperTradingPersistenceError(`Filled order ${value.id} is missing its fill`);
  let fill: PaperOrderFill | undefined;
  if (value.fill !== undefined) {
    if (!isRecord(value.fill)) throw new PaperTradingPersistenceError(`Order ${value.id} has an invalid fill`);
    fill = parseFill(value.fill);
  }
  return { id: value.id, idempotencyKey: value.idempotencyKey, accountId: value.accountId, symbol: value.symbol, side: value.side, type: "market", requestedSizing: value.requestedSizing, quantity: value.quantity, reservedCash: value.reservedCash, status: value.status, submittedAt: value.submittedAt, ...(value.acceptedAt === undefined ? {} : { acceptedAt: requireTime(value.acceptedAt, "acceptedAt") }), ...(fill === undefined ? {} : { fill }), ...(value.rejectedAt === undefined ? {} : { rejectedAt: requireTime(value.rejectedAt, "rejectedAt") }), ...(value.cancelledAt === undefined ? {} : { cancelledAt: requireTime(value.cancelledAt, "cancelledAt") }), ...(value.rejectionReason === undefined ? {} : { rejectionReason: requireString(value.rejectionReason, "rejectionReason") }), ...(value.cancellationReason === undefined ? {} : { cancellationReason: requireString(value.cancellationReason, "cancellationReason") }), ...(value.reason === undefined ? {} : { reason: requireString(value.reason, "reason") }) };
}

function parseFill(value: Record<string, unknown>): PaperOrderFill {
  if (!isString(value.marketEventId) || !isPositive(value.referencePrice) || !isPositive(value.executionPrice) || !isPositive(value.quantity) || !isNonNegative(value.fee) || !isNonNegative(value.slippage) || !isNonNegativeInteger(value.time)) throw new PaperTradingPersistenceError("Paper Trading fill is invalid");
  return { marketEventId: value.marketEventId, referencePrice: value.referencePrice, executionPrice: value.executionPrice, quantity: value.quantity, fee: value.fee, slippage: value.slippage, time: value.time };
}

function parsePosition(value: unknown, symbol: string): PaperPosition {
  if (!isRecord(value) || value.symbol !== symbol || !isPositive(value.quantity) || !isNonNegative(value.costBasis) || !isPositive(value.averageEntryPrice) || !isNonNegative(value.openEntryFees) || value.markPrice !== null && !isPositive(value.markPrice) || !isFiniteNumber(value.unrealizedPnl) || !isNonNegative(value.marketValue)) throw new PaperTradingPersistenceError("Paper Trading position is invalid");
  return { symbol, quantity: value.quantity, costBasis: value.costBasis, averageEntryPrice: value.averageEntryPrice, openEntryFees: value.openEntryFees, markPrice: value.markPrice, unrealizedPnl: value.unrealizedPnl, marketValue: value.marketValue };
}

function parseTrade(value: unknown): PaperTrade {
  if (!isRecord(value) || !isString(value.id) || !isString(value.accountId) || !isString(value.symbol) || !isString(value.entryOrderId) || !isString(value.exitOrderId) || !isNonNegativeInteger(value.entryTime) || !isNonNegativeInteger(value.exitTime) || !isPositive(value.entryPrice) || !isPositive(value.exitPrice) || !isPositive(value.quantity) || !isFiniteNumber(value.grossPnl) || !isFiniteNumber(value.netPnl) || !isNonNegative(value.entryFee) || !isNonNegative(value.exitFee)) throw new PaperTradingPersistenceError("Paper Trading trade is invalid");
  return { id: value.id, accountId: value.accountId, symbol: value.symbol, entryOrderId: value.entryOrderId, exitOrderId: value.exitOrderId, entryTime: value.entryTime, exitTime: value.exitTime, entryPrice: value.entryPrice, exitPrice: value.exitPrice, quantity: value.quantity, grossPnl: value.grossPnl, netPnl: value.netPnl, entryFee: value.entryFee, exitFee: value.exitFee, ...(value.reason === undefined ? {} : { reason: requireString(value.reason, "reason") }) };
}

function parseJournalEvent(value: unknown): PaperTradingJournalEvent {
  if (!isRecord(value) || !isString(value.id) || !isString(value.accountId) || !isString(value.type) || !isNonNegativeInteger(value.time) || !isString(value.source) || value.orderId !== undefined && !isString(value.orderId) || value.marketEventId !== undefined && !isString(value.marketEventId)) throw new PaperTradingPersistenceError("Paper Trading journal event is invalid");
  const base: PaperTradingJournalEvent = { id: value.id, accountId: value.accountId, type: value.type as PaperTradingJournalEvent["type"], time: value.time, source: value.source, ...(value.orderId === undefined ? {} : { orderId: value.orderId }), ...(value.marketEventId === undefined ? {} : { marketEventId: value.marketEventId }) };
  if (value.payload === undefined) return base;
  if (!isJsonValue(value.payload)) throw new PaperTradingPersistenceError(`Journal event ${value.id} has a non-JSON payload`);
  return { ...base, payload: value.payload };
}

function parseMarketEvent(value: unknown): PaperMarketEvent {
  if (!isRecord(value) || !isString(value.id) || !isString(value.symbol) || !isNonNegativeInteger(value.time) || !isPositive(value.price) || !isString(value.source) || !isQuoteStatus(value.quoteStatus) || !isMode(value.mode) || value.sourceSequence !== undefined && !isNonNegativeInteger(value.sourceSequence)) throw new PaperTradingPersistenceError("Paper Trading market event is invalid");
  return { id: value.id, symbol: value.symbol, time: value.time, price: value.price, source: value.source, quoteStatus: value.quoteStatus, mode: value.mode, ...(value.sourceSequence === undefined ? {} : { sourceSequence: value.sourceSequence }) };
}

function parseArray<T>(value: unknown, name: string, parser: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new PaperTradingPersistenceError(`${name} must be an array`);
  return value.map(parser);
}

function parseStringArray(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.some((item) => !isString(item))) throw new PaperTradingPersistenceError(`${name} must be an array of strings`);
  return [...value];
}

function assertUnique(values: readonly string[], name: string): void {
  if (new Set(values).size !== values.length) throw new PaperTradingPersistenceError(`${name} must be unique`);
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isString(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
function isFiniteNumber(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function numberField(record: Record<string, unknown>, name: string): number { if (!isFiniteNumber(record[name])) throw new PaperTradingPersistenceError(`Snapshot field ${name} must be finite`); return record[name]; }
function isPositive(value: unknown): value is number { return isFiniteNumber(value) && value > 0; }
function isNonNegative(value: unknown): value is number { return isFiniteNumber(value) && value >= 0; }
function isNonNegativeInteger(value: unknown): value is number { return isNonNegative(value) && Number.isInteger(value); }
function optionalPositive(value: unknown): boolean { return value === undefined || isPositive(value); }
function optionalInteger(value: unknown): boolean { return value === undefined || isNonNegativeInteger(value); }
function optionalFraction(value: unknown): boolean { return value === undefined || isFiniteNumber(value) && value > 0 && value <= 1; }
function requirePositive(value: unknown, name: string): number { if (!isPositive(value)) throw new PaperTradingPersistenceError(`${name} must be positive`); return value; }
function requireTime(value: unknown, name: string): number { if (!isNonNegativeInteger(value)) throw new PaperTradingPersistenceError(`${name} must be a non-negative integer`); return value; }
function requireString(value: unknown, name: string): string { if (!isString(value)) throw new PaperTradingPersistenceError(`${name} must be a non-empty string`); return value; }
function isCost(value: unknown): value is { readonly type: "percent" | "fixed"; readonly value: number } { return isRecord(value) && (value.type === "percent" || value.type === "fixed") && isNonNegative(value.value); }
function isSizing(value: unknown): value is PaperOrder["requestedSizing"] { return isRecord(value) && ((isPositive(value.quantity) && value.notional === undefined && value.percentageOfAvailableCash === undefined) || (isPositive(value.notional) && value.quantity === undefined && value.percentageOfAvailableCash === undefined) || (isPositive(value.percentageOfAvailableCash) && value.percentageOfAvailableCash <= 1 && value.quantity === undefined && value.notional === undefined)); }
function isOrderStatus(value: unknown): value is PaperOrder["status"] { return value === "submitted" || value === "accepted" || value === "pending" || value === "filled" || value === "rejected" || value === "cancelled"; }
function isQuoteStatus(value: unknown): value is PaperMarketEvent["quoteStatus"] { return value === "fresh" || value === "stale" || value === "disconnected"; }
function isMode(value: unknown): value is PaperMarketEvent["mode"] { return value === "simulated" || value === "live" || value === "replay"; }
function isJsonValue(value: unknown): value is PaperJsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}
