import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryDatafeed } from "../src/datafeed.js";
import type { Candle } from "../src/types.js";

const candles: Candle[] = [
  { time: 1_700_000_000_000, open: 100, high: 110, low: 95, close: 105 },
  { time: 1_700_000_060_000, open: 105, high: 112, low: 102, close: 108 },
];

test("InMemoryDatafeed resolves symbols and filters historical bars", async () => {
  const datafeed = new InMemoryDatafeed({ symbol: "TEST", timezone: "UTC", pricePrecision: 2 }, candles);
  assert.deepEqual(await datafeed.resolveSymbol("TEST"), { symbol: "TEST", timezone: "UTC", pricePrecision: 2 });
  assert.deepEqual(
    await datafeed.getBars({
      symbol: "TEST",
      timeframe: "1m",
      from: candles[0]!.time,
      to: candles[1]!.time,
    }),
    [candles[0]],
  );
});

test("InMemoryDatafeed delivers updates and cleans subscriptions", () => {
  const datafeed = new InMemoryDatafeed({ symbol: "TEST", timezone: "UTC", pricePrecision: 2 }, candles);
  const received: Candle[] = [];
  const unsubscribe = datafeed.subscribeBars({
    symbol: "TEST",
    timeframe: "1m",
    onBar: (candle) => received.push(candle),
  });

  datafeed.pushBar({ ...candles[1]!, close: 109 });
  unsubscribe();
  datafeed.pushBar({ time: 1_700_000_120_000, open: 109, high: 113, low: 108, close: 112 });

  assert.equal(received.length, 1);
  assert.equal(received[0]?.close, 109);
});

test("InMemoryDatafeed rejects aborted and unknown requests", async () => {
  const datafeed = new InMemoryDatafeed({ symbol: "TEST", timezone: "UTC", pricePrecision: 2 });
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    datafeed.getBars({ symbol: "TEST", timeframe: "1m", from: 0, to: 1, signal: controller.signal }),
    (error: unknown) => error instanceof Error && error.name === "AbortError",
  );
  await assert.rejects(datafeed.resolveSymbol("OTHER"), /Unknown symbol/);
});
