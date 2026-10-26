import { ScreenerValidationError, type ScreenerInstrument } from "./types.js";

const IDENTITY_FIELDS = ["provider", "exchange", "assetClass", "quoteCurrency", "symbol", "instrumentId"] as const;

/** Normalizes identity fields without dropping any field that distinguishes markets. */
export function normalizeScreenerInstrument(instrument: ScreenerInstrument): ScreenerInstrument {
  assertInstrumentShape(instrument);
  return {
    provider: normalizeIdentityPart(instrument.provider, "provider"),
    exchange: normalizeIdentityPart(instrument.exchange, "exchange"),
    assetClass: normalizeIdentityPart(instrument.assetClass, "assetClass"),
    quoteCurrency: normalizeIdentityPart(instrument.quoteCurrency, "quoteCurrency"),
    symbol: normalizeIdentityPart(instrument.symbol, "symbol"),
    instrumentId: normalizeIdentityPart(instrument.instrumentId, "instrumentId"),
    ...(instrument.name === undefined ? {} : { name: requireText(instrument.name, "name") }),
  };
}

/** Canonical identity is deliberately provider and venue scoped; symbols alone never identify a market. */
export function canonicalInstrumentIdentity(instrument: ScreenerInstrument): string {
  const normalized = normalizeScreenerInstrument(instrument);
  return IDENTITY_FIELDS.map((field) => encodeIdentityPart(normalized[field])).join("|");
}

export function sameScreenerInstrument(left: ScreenerInstrument, right: ScreenerInstrument): boolean {
  return canonicalInstrumentIdentity(left) === canonicalInstrumentIdentity(right);
}

function assertInstrumentShape(instrument: ScreenerInstrument): void {
  if (typeof instrument !== "object" || instrument === null) {
    throw new ScreenerValidationError("Instrument must be an object");
  }
  for (const field of IDENTITY_FIELDS) {
    const value = instrument[field];
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new ScreenerValidationError(`Instrument ${field} must be a non-empty string`);
    }
  }
  if (instrument.name !== undefined && typeof instrument.name !== "string") {
    throw new ScreenerValidationError("Instrument name must be a string when provided");
  }
}

function normalizeIdentityPart(value: string, field: string): string {
  return requireText(value, field).normalize("NFKC").toUpperCase();
}

function requireText(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new ScreenerValidationError(`Instrument ${field} must not be empty`);
  return trimmed;
}

function encodeIdentityPart(value: string): string {
  return encodeURIComponent(value);
}

