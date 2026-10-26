import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalInstrumentIdentity,
  createDeterministicScreenerUniverse,
  createScreenerUniverse,
  createUniverseFromWatchlist,
  DeterministicScreenerMarketDataProvider,
  type ScreenerInstrument,
  ScreenerValidationError,
} from "../src/index.js";

const btc: ScreenerInstrument = {
  symbol: " btc-usd ", provider: "demo", exchange: "Demo", assetClass: "Crypto", quoteCurrency: "usd", instrumentId: "btc-1", name: "Bitcoin",
};

test("screener instrument identity is normalized and remains venue/provider scoped", () => {
  const first = canonicalInstrumentIdentity(btc);
  const normalized = canonicalInstrumentIdentity({ ...btc, symbol: "BTC-USD", provider: "DEMO", exchange: "DEMO", assetClass: "CRYPTO", quoteCurrency: "USD", instrumentId: "BTC-1" });
  assert.equal(first, normalized);
  assert.notEqual(first, canonicalInstrumentIdentity({ ...btc, provider: "other" }));
  assert.notEqual(first, canonicalInstrumentIdentity({ ...btc, exchange: "other" }));
  assert.notEqual(first, canonicalInstrumentIdentity({ ...btc, instrumentId: "other" }));
});

test("universe validation rejects duplicate identities and enforces source/version", () => {
  assert.equal(createScreenerUniverse([btc]).instruments[0]?.symbol, "BTC-USD");
  assert.throws(() => createScreenerUniverse([btc, { ...btc, name: "duplicate" }]), ScreenerValidationError);
  assert.throws(() => createScreenerUniverse([], "unsupported" as never), ScreenerValidationError);
});

test("watchlist symbols become explicit history identities without using quote values", () => {
  const universe = createUniverseFromWatchlist({ version: 1, selectedWatchlistId: "favorites", lists: [{ id: "favorites", name: "Favorites", symbols: [{ id: "btc-1", displaySymbol: "BTC-USD", name: "Bitcoin", exchange: "Demo", assetCategory: "Crypto", quoteCurrency: "USD", favorite: true }] }] }, "favorites", "demo");
  assert.equal(universe.source, "watchlist");
  assert.deepEqual(universe.instruments[0], { symbol: "BTC-USD", provider: "DEMO", exchange: "DEMO", assetClass: "CRYPTO", quoteCurrency: "USD", instrumentId: "BTC-1", name: "Bitcoin" });
});

test("deterministic provider paginates repeatable completed bars", async () => {
  assert.equal(createDeterministicScreenerUniverse(2).instruments.length, 2);
  const provider = new DeterministicScreenerMarketDataProvider({ symbolCount: 1, barsPerInstrument: 7, pageSize: 3 });
  const instrument = provider.getUniverse().instruments[0];
  assert.ok(instrument);
  const first = await provider.getHistory({ instrument, timeframe: "1h", limit: 3 });
  const second = await provider.getHistory({ instrument, timeframe: "1h", limit: 3, ...(first.nextCursor === null ? {} : { cursor: first.nextCursor }) });
  const repeated = await provider.getHistory({ instrument, timeframe: "1h", limit: 3 });
  assert.equal(first.bars.length, 3);
  assert.equal(second.bars.length, 3);
  assert.equal(second.nextCursor, "6");
  assert.equal(first.bars[0]?.finality, "confirmed");
  assert.deepEqual(first, repeated);
  assert.ok(first.bars[0]!.candle.time < first.bars[1]!.candle.time);
});

test("deterministic provider supports provider-scoped watchlist symbols and cleanup", async () => {
  const provider = new DeterministicScreenerMarketDataProvider({ barsPerInstrument: 3, pageSize: 3 });
  const instrument: ScreenerInstrument = {
    symbol: "AAPL",
    provider: "OPENKLINE-DEMO",
    exchange: "NASDAQ",
    assetClass: "EQUITY",
    quoteCurrency: "USD",
    instrumentId: "nasdaq-aapl",
  };
  const resolved = await provider.resolveInstrument(instrument);
  assert.equal(resolved.symbol, "AAPL");
  const events: number[] = [];
  const unsubscribe = provider.subscribeBars({ instrument: resolved, timeframe: "1h", signal: new AbortController().signal }, (bar) => events.push(bar.candle.time));
  provider.step();
  assert.equal(events.length, 1);
  unsubscribe();
  provider.step();
  assert.equal(events.length, 1);
  const page = await provider.getHistory({ instrument: resolved, timeframe: "1h", limit: 3 });
  assert.equal(page.bars.length, 3);
  assert.equal(page.bars[0]?.source, "OPENKLINE-DEMO");
});

