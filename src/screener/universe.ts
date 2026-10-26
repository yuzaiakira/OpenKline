import type { Watchlist, WatchlistDocument, WatchlistSymbol } from "../studio/watchlist.js";
import { canonicalInstrumentIdentity, normalizeScreenerInstrument } from "./identity.js";
import {
  DEFAULT_SCREENER_LIMITS,
  OPENKLINE_SCREENER_VERSION,
  ScreenerValidationError,
  type ScreenerInstrument,
  type ScreenerLimits,
  type ScreenerUniverse,
  type ScreenerUniverseSource,
} from "./types.js";

export interface UniverseValidationOptions {
  readonly limits?: Partial<ScreenerLimits>;
}

export function validateScreenerUniverse(
  universe: ScreenerUniverse,
  options: UniverseValidationOptions = {},
): ScreenerUniverse {
  if (universe.version !== OPENKLINE_SCREENER_VERSION) throw new ScreenerValidationError("Unsupported screener universe version");
  assertSource(universe.source);
  if (!Array.isArray(universe.instruments)) throw new ScreenerValidationError("Screener universe instruments must be an array");
  const limits = resolveLimits(options.limits);
  if (universe.instruments.length > limits.maxInstruments) {
    throw new ScreenerValidationError(`Screener universe exceeds maxInstruments=${limits.maxInstruments}`);
  }
  const identities = new Set<string>();
  const instruments = universe.instruments.map((instrument) => {
    const normalized = normalizeScreenerInstrument(instrument);
    const identity = canonicalInstrumentIdentity(normalized);
    if (identities.has(identity)) throw new ScreenerValidationError(`Duplicate screener instrument: ${identity}`);
    identities.add(identity);
    return normalized;
  });
  return { version: OPENKLINE_SCREENER_VERSION, source: universe.source, instruments };
}

export function createScreenerUniverse(
  instruments: readonly ScreenerInstrument[],
  source: ScreenerUniverseSource = "explicit",
  options: UniverseValidationOptions = {},
): ScreenerUniverse {
  return validateScreenerUniverse({ version: OPENKLINE_SCREENER_VERSION, source, instruments }, options);
}

export function createUniverseFromWatchlist(
  document: WatchlistDocument,
  watchlistId: string | null = document.selectedWatchlistId,
  provider: string,
  options: UniverseValidationOptions = {},
): ScreenerUniverse {
  if (typeof provider !== "string" || provider.trim().length === 0) throw new ScreenerValidationError("Watchlist provider must not be empty");
  const list = findWatchlist(document, watchlistId);
  const instruments = list.symbols.map((symbol) => instrumentFromWatchlistSymbol(symbol, provider));
  return createScreenerUniverse(instruments, "watchlist", options);
}

export function instrumentFromWatchlistSymbol(symbol: WatchlistSymbol, provider: string): ScreenerInstrument {
  return normalizeScreenerInstrument({
    symbol: symbol.displaySymbol,
    provider,
    exchange: symbol.exchange ?? "UNKNOWN",
    assetClass: symbol.assetCategory ?? "UNKNOWN",
    quoteCurrency: symbol.quoteCurrency ?? "UNKNOWN",
    instrumentId: symbol.id,
    name: symbol.name,
  });
}

function findWatchlist(document: WatchlistDocument, watchlistId: string | null): Watchlist {
  if (watchlistId === null) throw new ScreenerValidationError("A watchlist must be selected");
  const list = document.lists.find((candidate) => candidate.id === watchlistId);
  if (list === undefined) throw new ScreenerValidationError(`Unknown watchlist: ${watchlistId}`);
  return list;
}

function resolveLimits(overrides: Partial<ScreenerLimits> | undefined): ScreenerLimits {
  const limits = { ...DEFAULT_SCREENER_LIMITS, ...(overrides ?? {}) };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isInteger(value) || value < 1) throw new ScreenerValidationError(`Screener limit ${name} must be a positive integer`);
  }
  return limits;
}

function assertSource(source: string): asserts source is ScreenerUniverseSource {
  if (source !== "explicit" && source !== "watchlist" && source !== "demo") {
    throw new ScreenerValidationError(`Unsupported screener universe source: ${source}`);
  }
}

