import type { JsonValue } from "../extensions/types.js";
import type { PortfolioBacktestOptions, PortfolioPositionSizing, PortfolioRiskOptions, PortfolioValuationOptions } from "./types.js";

export const OPENKLINE_PORTFOLIO_WORKSPACE_VERSION = 1 as const;

export interface PortfolioBacktestWorkspaceInstrument {
  readonly id: string;
  readonly symbol: string;
  readonly quoteCurrency: string;
  readonly timeframe: string;
  readonly strategy: string;
  readonly parameters: Readonly<Record<string, JsonValue>>;
  readonly calendar?: { readonly id: string; readonly version: string };
  readonly positionSizing?: PortfolioPositionSizing;
  readonly allowFractionalQuantity?: boolean;
}

export interface PortfolioBacktestWorkspaceDocument {
  readonly version: typeof OPENKLINE_PORTFOLIO_WORKSPACE_VERSION;
  readonly accountCurrency: string;
  readonly initialCapital: number;
  readonly instruments: readonly PortfolioBacktestWorkspaceInstrument[];
  readonly positionSizing: PortfolioPositionSizing;
  readonly commission: PortfolioBacktestOptions["commission"];
  readonly slippage: PortfolioBacktestOptions["slippage"];
  readonly risk: PortfolioRiskOptions;
  readonly valuation: PortfolioValuationOptions;
}

export class PortfolioBacktestWorkspaceValidationError extends Error {
  public constructor(message: string) { super(message); this.name = "PortfolioBacktestWorkspaceValidationError"; }
}

export function parsePortfolioBacktestWorkspace(value: unknown): PortfolioBacktestWorkspaceDocument {
  if (!isRecord(value) || value.version !== OPENKLINE_PORTFOLIO_WORKSPACE_VERSION || typeof value.accountCurrency !== "string" || typeof value.initialCapital !== "number" || !Number.isFinite(value.initialCapital) || value.initialCapital <= 0 || !Array.isArray(value.instruments) || value.instruments.length === 0 || value.instruments.length > 5 || !isRecord(value.positionSizing) || !isCost(value.commission) || !isCost(value.slippage) || !isRecord(value.risk) || !isValuation(value.valuation)) throw new PortfolioBacktestWorkspaceValidationError("Invalid portfolio backtest workspace configuration");
  const ids = new Set<string>();
  const instruments = value.instruments.map((item) => {
    if (!isRecord(item) || !nonEmpty(item.id) || !nonEmpty(item.symbol) || !nonEmpty(item.quoteCurrency) || !nonEmpty(item.timeframe) || !nonEmpty(item.strategy) || !isJsonObject(item.parameters) || ids.has(item.id)) throw new PortfolioBacktestWorkspaceValidationError("Invalid or duplicate portfolio workspace instrument");
    ids.add(item.id);
    const calendar = item.calendar === undefined ? undefined : parseCalendar(item.calendar);
    const positionSizing = item.positionSizing === undefined ? undefined : parseSizing(item.positionSizing);
    return { id: item.id, symbol: item.symbol, quoteCurrency: item.quoteCurrency, timeframe: item.timeframe, strategy: item.strategy, parameters: cloneJsonObject(item.parameters), ...(calendar === undefined ? {} : { calendar }), ...(positionSizing === undefined ? {} : { positionSizing }), ...(item.allowFractionalQuantity === undefined ? {} : { allowFractionalQuantity: item.allowFractionalQuantity === true }) };
  });
  return { version: 1, accountCurrency: value.accountCurrency, initialCapital: value.initialCapital, instruments, positionSizing: parseSizing(value.positionSizing), commission: { type: value.commission.type, value: value.commission.value }, slippage: { type: value.slippage.type, value: value.slippage.value }, risk: parseRisk(value.risk), valuation: { policy: "last-known-price", maxAgeMs: value.valuation.maxAgeMs, incomplete: value.valuation.incomplete } };
}

export function createPortfolioBacktestWorkspace(options: Pick<PortfolioBacktestOptions, "accountCurrency" | "initialCapital" | "positionSizing" | "commission" | "slippage"> & { readonly instruments: readonly PortfolioBacktestWorkspaceInstrument[]; readonly risk?: PortfolioRiskOptions; readonly valuation?: PortfolioValuationOptions }): PortfolioBacktestWorkspaceDocument {
  return parsePortfolioBacktestWorkspace({ version: 1, accountCurrency: options.accountCurrency, initialCapital: options.initialCapital, instruments: options.instruments, positionSizing: options.positionSizing, commission: options.commission, slippage: options.slippage, risk: options.risk ?? {}, valuation: options.valuation ?? { policy: "last-known-price", maxAgeMs: 86_400_000, incomplete: "allow" } });
}

function parseSizing(value: unknown): PortfolioPositionSizing {
  if (!isRecord(value) || typeof value.type !== "string") throw new PortfolioBacktestWorkspaceValidationError("Invalid portfolio position sizing");
  if (value.type === "fixed-quantity" && finitePositive(value.quantity)) return { type: "fixed-quantity", quantity: value.quantity };
  if (value.type === "fixed-notional" && finitePositive(value.amount)) return { type: "fixed-notional", amount: value.amount };
  if (value.type === "percent-equity" && finiteFraction(value.percent)) return { type: "percent-equity", percent: value.percent };
  if (value.type === "target-weight" && finiteFraction(value.weight)) return { type: "target-weight", weight: value.weight };
  throw new PortfolioBacktestWorkspaceValidationError("Invalid portfolio position sizing");
}

function parseRisk(value: Record<string, unknown>): PortfolioRiskOptions {
  const result: Record<string, number | boolean> = {};
  for (const key of ["maxTotalGrossExposure", "maxSingleInstrumentExposure", "minimumAvailableCash", "maxDrawdown"] as const) if (value[key] !== undefined) { if (!finiteNonNegative(value[key])) throw new PortfolioBacktestWorkspaceValidationError(`Invalid portfolio risk value: ${key}`); result[key] = value[key] as number; }
  for (const key of ["maxAllocationPerInstrument", "maxDrawdownPercent"] as const) if (value[key] !== undefined) { if (!finiteFraction(value[key])) throw new PortfolioBacktestWorkspaceValidationError(`Invalid portfolio risk fraction: ${key}`); result[key] = value[key] as number; }
  if (value.maxActivePositions !== undefined) { if (!Number.isInteger(value.maxActivePositions) || (value.maxActivePositions as number) < 1) throw new PortfolioBacktestWorkspaceValidationError("Invalid maximum active positions"); result.maxActivePositions = value.maxActivePositions as number; }
  if (value.stopNewOrdersOnDrawdown !== undefined) result.stopNewOrdersOnDrawdown = value.stopNewOrdersOnDrawdown === true;
  return result as PortfolioRiskOptions;
}

function parseCalendar(value: unknown): { readonly id: string; readonly version: string } {
  if (!isRecord(value) || !nonEmpty(value.id) || !nonEmpty(value.version)) throw new PortfolioBacktestWorkspaceValidationError("Invalid portfolio calendar identity");
  return { id: value.id, version: value.version };
}

function isValuation(value: unknown): value is { readonly policy: "last-known-price"; readonly maxAgeMs: number; readonly incomplete: "allow" | "reject" } {
  if (!isRecord(value) || value.policy !== "last-known-price" || typeof value.maxAgeMs !== "number" || !Number.isSafeInteger(value.maxAgeMs) || value.maxAgeMs < 0) return false;
  return value.incomplete === "allow" || value.incomplete === "reject";
}
function isCost(value: unknown): value is { readonly type: "percent" | "fixed"; readonly value: number } { return isRecord(value) && (value.type === "percent" || value.type === "fixed") && typeof value.value === "number" && Number.isFinite(value.value) && value.value >= 0; }
function finitePositive(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value > 0; }
function finiteNonNegative(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value >= 0; }
function finiteFraction(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 1; }
function nonEmpty(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function isJsonObject(value: unknown): value is Record<string, JsonValue> { return isRecord(value) && Object.values(value).every(isJsonValue); }
function isJsonValue(value: unknown): value is JsonValue { return value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number" || Array.isArray(value) && value.every(isJsonValue) || isRecord(value) && Object.values(value).every(isJsonValue); }
function cloneJsonObject(value: Record<string, JsonValue>): Record<string, JsonValue> { return JSON.parse(JSON.stringify(value)) as Record<string, JsonValue>; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
