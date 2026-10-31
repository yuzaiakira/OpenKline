import type { CorporateAction } from "../corporate-actions.js";
import type { MarketTrade } from "../market-trades.js";

/**
 * Canonical identity helpers for replay records.
 *
 * JSON tuple encoding is intentional: delimiters are not safe when provider
 * identifiers can contain arbitrary text. Source `version` is treated as a
 * dataset generation, so a correction from one generation can never replace
 * a record from another generation.
 */
export function marketTradeLogicalIdentity(trade: Pick<MarketTrade, "id" | "instrumentId" | "venueId" | "source">): string {
  return tupleIdentity("trade", [trade.instrumentId, trade.venueId ?? null, trade.source.id, trade.source.version, trade.id]);
}

export function corporateActionLogicalIdentity(action: Pick<CorporateAction, "id" | "instrumentId" | "source">): string {
  return tupleIdentity("corporate-action", [action.instrumentId, action.source.id, action.source.version, action.id]);
}

export function replayStreamIdentity(value: { readonly instrumentId: string; readonly venueId?: string; readonly source: { readonly id: string; readonly version: string } }): string {
  return tupleIdentity("stream", [value.instrumentId, value.venueId ?? null, value.source.id, value.source.version]);
}

export function replayCandleIdentity(value: { readonly instrumentId: string; readonly venueId?: string; readonly intervalMs?: number; readonly source: { readonly id: string; readonly version: string }; readonly time: number }): string {
  return tupleIdentity("candle", [value.instrumentId, value.venueId ?? null, value.source.id, value.source.version, value.intervalMs ?? null, value.time]);
}

export function replayFootprintIdentity(value: { readonly instrumentId: string; readonly time: number; readonly price: number }): string {
  return tupleIdentity("footprint", [value.instrumentId, value.time, Number(value.price.toPrecision(15))]);
}

function tupleIdentity(namespace: string, values: readonly (string | number | null)[]): string {
  return `${namespace}:${JSON.stringify(values)}`;
}
