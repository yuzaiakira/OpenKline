import { createExpectedState } from "./expected-state.mjs";

const INTERVAL_MS = 60_000;
const SYMBOLS = ["BTCUSD", "ETHUSD", "SOLUSD"];
const TIMEFRAMES = ["1m", "5m", "15m"];

function makeCandle(time, close, volume = 10) {
  return {
    time,
    open: close - 0.5,
    high: close + 1,
    low: close - 1,
    close,
    volume,
  };
}

function invalidCandle(time) {
  return { time, open: 10, high: 9, low: 8, close: 10, volume: 1 };
}

/**
 * Builds a deterministic stream of market activity against an independent oracle.
 * Product CandleStore is applied in parallel by the caller for integrity checks.
 */
export function createMarketScenario(rng, options = {}) {
  const symbol = options.symbol ?? "BTCUSD";
  const timeframe = options.timeframe ?? "1m";
  const start = options.startTime ?? Date.UTC(2026, 0, 1);
  const seedCount = options.seedCount ?? 64;
  const seed = Array.from({ length: seedCount }, (_, index) => makeCandle(start + index * INTERVAL_MS, 100 + index));
  const expected = createExpectedState(seed);
  let nextTime = start + seedCount * INTERVAL_MS;
  let activeSymbol = symbol;
  let activeTimeframe = timeframe;
  let generation = 0;
  let insertCursor = 0;
  const meta = {
    symbolSwitches: 0,
    timeframeSwitches: 0,
    reconnects: 0,
    delayedRest: 0,
    abortedRest: 0,
    staleCrossSymbolBlocked: 0,
  };

  const kinds = [
    "append",
    "append",
    "append",
    "revise",
    "correction",
    "out_of_order",
    "duplicate",
    "invalid",
    "reconnect",
    "symbol_switch",
    "timeframe_switch",
    "delayed_rest",
    "aborted_rest",
  ];

  function nextEvent() {
    for (let attempt = 0; attempt < 32; attempt += 1) {
      generation += 1;
      const kind = rng.pick(kinds);
      const closes = expected.closes();
      const times = expected.times();
      const lastClose = closes[closes.length - 1] ?? 100;
      const lastTime = times[times.length - 1] ?? start;

      switch (kind) {
        case "append": {
          const candle = makeCandle(nextTime, lastClose + (rng.next() - 0.45) * 2, 10 + rng.int(20));
          nextTime += INTERVAL_MS;
          expected.apply(candle);
          return { kind, symbol: activeSymbol, timeframe: activeTimeframe, generation, candle };
        }
        case "revise": {
          const candle = makeCandle(lastTime, lastClose + (rng.next() - 0.5), 10 + rng.int(5));
          expected.apply(candle);
          return { kind, symbol: activeSymbol, timeframe: activeTimeframe, generation, candle };
        }
        case "correction": {
          if (times.length < 3) continue;
          const index = 1 + rng.int(Math.min(8, times.length - 1));
          const time = times[times.length - 1 - index];
          const candle = makeCandle(time, 50 + rng.int(40), 10 + rng.int(5));
          expected.apply(candle);
          return { kind, symbol: activeSymbol, timeframe: activeTimeframe, generation, candle };
        }
        case "out_of_order": {
          insertCursor += 1;
          const slot = start - insertCursor;
          const candle = makeCandle(slot, lastClose - 1, 11);
          expected.apply(candle);
          return { kind, symbol: activeSymbol, timeframe: activeTimeframe, generation, candle };
        }
        case "duplicate": {
          const existing = expected.snapshot()[expected.size() - 1];
          if (existing === undefined) continue;
          expected.apply({ ...existing });
          return { kind, symbol: activeSymbol, timeframe: activeTimeframe, generation, candle: { ...existing } };
        }
        case "invalid": {
          const candle = invalidCandle(lastTime + INTERVAL_MS);
          expected.apply(candle);
          return { kind, symbol: activeSymbol, timeframe: activeTimeframe, generation, candle };
        }
        case "reconnect": {
          meta.reconnects += 1;
          return { kind, symbol: activeSymbol, timeframe: activeTimeframe, generation };
        }
        case "symbol_switch": {
          const nextSymbol = rng.pick(SYMBOLS.filter((item) => item !== activeSymbol));
          activeSymbol = nextSymbol;
          meta.symbolSwitches += 1;
          return { kind, symbol: activeSymbol, timeframe: activeTimeframe, generation, previousSymbol: symbol };
        }
        case "timeframe_switch": {
          const nextTf = rng.pick(TIMEFRAMES.filter((item) => item !== activeTimeframe));
          activeTimeframe = nextTf;
          meta.timeframeSwitches += 1;
          return { kind, symbol: activeSymbol, timeframe: activeTimeframe, generation };
        }
        case "delayed_rest": {
          meta.delayedRest += 1;
          return {
            kind,
            symbol: activeSymbol,
            timeframe: activeTimeframe,
            generation,
            delayMs: 5 + rng.int(25),
            bars: expected.snapshot().slice(-16),
          };
        }
        case "aborted_rest": {
          meta.abortedRest += 1;
          return { kind, symbol: activeSymbol, timeframe: activeTimeframe, generation };
        }
        default:
          throw new Error(`unknown kind ${kind}`);
      }
    }
    // Guaranteed progress path if the RNG keeps selecting unusable branches.
    const closes = expected.closes();
    const lastClose = closes[closes.length - 1] ?? 100;
    const candle = makeCandle(nextTime, lastClose + 0.25, 12);
    nextTime += INTERVAL_MS;
    generation += 1;
    expected.apply(candle);
    return { kind: "append", symbol: activeSymbol, timeframe: activeTimeframe, generation, candle };
  }

  return {
    seed,
    expected,
    meta,
    SYMBOLS,
    INTERVAL_MS,
    getActive() {
      return { symbol: activeSymbol, timeframe: activeTimeframe, generation };
    },
    nextEvent,
    markStaleCrossSymbolBlocked() {
      meta.staleCrossSymbolBlocked += 1;
    },
  };
}
