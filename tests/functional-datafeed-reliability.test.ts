import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryDatafeed } from "../src/datafeed.js";
import { RestDatafeed } from "../src/datafeed-rest.js";
import { WebSocketDatafeed, type WebSocketLike } from "../src/datafeed-websocket.js";
import type { Candle } from "../src/types.js";

function bar(time: number, close: number): Candle {
  return { time, open: close - 1, high: close + 1, low: close - 2, close, volume: 10 };
}

class FakeSocket implements WebSocketLike {
  public readonly readyState = 0;
  public onopen: (() => void) | null = null;
  public onmessage: ((event: { data: unknown }) => void) | null = null;
  public onerror: ((event: unknown) => void) | null = null;
  public onclose: (() => void) | null = null;

  public send(): void {}

  public close(): void {
    this.onclose?.();
  }

  public open(): void {
    this.onopen?.();
  }

  public emit(data: unknown): void {
    this.onmessage?.({ data });
  }

  public fail(): void {
    this.onerror?.(new Error("disconnect"));
    this.close();
  }
}

test("paginated historical backfill deduplicates and orders bars", async () => {
  const t1 = 1_700_000_000_000;
  const t2 = 1_700_000_060_000;
  const t3 = 1_700_000_120_000;
  const pages = [
    { bars: [bar(t3, 3), bar(t1, 1)], next: "page-2" },
    { bars: [bar(t2, 2), bar(t3, 30)], next: null },
  ];
  let page = 0;
  const datafeed = new RestDatafeed({
    baseUrl: "https://market.example.test",
    symbols: { AAA: { symbol: "AAA", timezone: "UTC", pricePrecision: 2 } },
    fetcher: async () => new Response(JSON.stringify(pages[page++] ?? { bars: [] }), { status: 200 }),
  });
  const bars = await datafeed.getBars({ symbol: "AAA", timeframe: "1m", from: t1, to: t3 + 1 });
  assert.deepEqual(bars.map((candle) => [candle.time, candle.close]), [[t1, 1], [t2, 2], [t3, 30]]);
});

test("live updates support current-candle revisions and new insertions without duplicates", () => {
  const datafeed = new InMemoryDatafeed({ symbol: "AAA", timezone: "UTC", pricePrecision: 2 }, [bar(1_000, 10)]);
  const received: Candle[] = [];
  const unsubscribe = datafeed.subscribeBars({
    symbol: "AAA",
    timeframe: "1m",
    onBar: (candle) => received.push({ ...candle }),
  });
  datafeed.pushBar(bar(1_000, 11));
  datafeed.pushBar(bar(1_000, 12));
  datafeed.pushBar(bar(2_000, 13));
  unsubscribe();
  assert.deepEqual(received.map((candle) => [candle.time, candle.close]), [[1_000, 11], [1_000, 12], [2_000, 13]]);
});

test("historical corrections replace prior bars by timestamp", async () => {
  const datafeed = new InMemoryDatafeed({ symbol: "AAA", timezone: "UTC", pricePrecision: 2 }, [
    bar(1_000, 10),
    bar(2_000, 20),
    bar(3_000, 30),
  ]);
  datafeed.pushBar(bar(2_000, 25));
  const bars = await datafeed.getBars({ symbol: "AAA", timeframe: "1m", from: 0, to: 4_000 });
  assert.deepEqual(bars.map((candle) => candle.close), [10, 25, 30]);
});

test("websocket reconnect delivers later messages and ignores duplicates", async () => {
  const sockets: FakeSocket[] = [];
  const historical = new InMemoryDatafeed({ symbol: "AAA", timezone: "UTC", pricePrecision: 2 }, [bar(1_000, 10)]);
  const datafeed = new WebSocketDatafeed({
    url: "ws://market.example.test/stream",
    symbols: { AAA: { symbol: "AAA", timezone: "UTC", pricePrecision: 2 } },
    historical,
    initialBackoffMs: 1,
    maxBackoffMs: 1,
    maxReconnectAttempts: 3,
    createSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      queueMicrotask(() => socket.open());
      return socket;
    },
  });

  const received: Array<[number, number]> = [];
  const unsubscribe = datafeed.subscribeBars({
    symbol: "AAA",
    timeframe: "1m",
    onBar: (candle) => received.push([candle.time, candle.close]),
  });
  await new Promise((resolve) => setTimeout(resolve, 5));
  sockets[0]!.emit(JSON.stringify({ symbol: "AAA", timeframe: "1m", candle: bar(2_000, 20) }));
  sockets[0]!.emit(JSON.stringify({ symbol: "AAA", timeframe: "1m", candle: bar(2_000, 20) }));
  sockets[0]!.fail();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(sockets.length >= 2, "reconnect must open a replacement socket");
  sockets.at(-1)!.emit(JSON.stringify({ symbol: "AAA", timeframe: "1m", candle: bar(3_000, 30) }));
  unsubscribe();
  assert.deepEqual(received, [[2_000, 20], [3_000, 30]]);
});

test("out-of-order websocket inserts preserve chronological store order for consumers that re-query", async () => {
  const sockets: FakeSocket[] = [];
  const historical = new InMemoryDatafeed({ symbol: "AAA", timezone: "UTC", pricePrecision: 2 }, [bar(1_000, 10)]);
  const datafeed = new WebSocketDatafeed({
    url: "ws://market.example.test/stream",
    symbols: { AAA: { symbol: "AAA", timezone: "UTC", pricePrecision: 2 } },
    historical,
    createSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      queueMicrotask(() => socket.open());
      return socket;
    },
  });
  const live: Candle[] = [];
  const unsubscribe = datafeed.subscribeBars({
    symbol: "AAA",
    timeframe: "1m",
    onBar: (candle) => live.push({ ...candle }),
  });
  await new Promise((resolve) => setTimeout(resolve, 5));
  sockets[0]!.emit(JSON.stringify({ symbol: "AAA", timeframe: "1m", candle: bar(3_000, 30) }));
  sockets[0]!.emit(JSON.stringify({ symbol: "AAA", timeframe: "1m", candle: bar(2_000, 20) }));
  unsubscribe();
  assert.deepEqual(live.map((candle) => candle.time), [3_000, 2_000], "live callbacks preserve arrival order");
});

test("stale symbol and timeframe messages are ignored by websocket subscriptions", async () => {
  const sockets: FakeSocket[] = [];
  const historical = new InMemoryDatafeed({ symbol: "AAA", timezone: "UTC", pricePrecision: 2 }, [bar(1_000, 10)]);
  const datafeed = new WebSocketDatafeed({
    url: "ws://market.example.test/stream",
    symbols: {
      AAA: { symbol: "AAA", timezone: "UTC", pricePrecision: 2 },
      BBB: { symbol: "BBB", timezone: "UTC", pricePrecision: 2 },
    },
    historical,
    createSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      queueMicrotask(() => socket.open());
      return socket;
    },
  });
  const received: string[] = [];
  const unsubscribe = datafeed.subscribeBars({
    symbol: "AAA",
    timeframe: "1m",
    onBar: (candle) => received.push(`${candle.time}:${candle.close}`),
  });
  await new Promise((resolve) => setTimeout(resolve, 5));
  sockets[0]!.emit(JSON.stringify({ symbol: "BBB", timeframe: "1m", candle: bar(2_000, 99) }));
  sockets[0]!.emit(JSON.stringify({ symbol: "AAA", timeframe: "5m", candle: bar(2_000, 98) }));
  sockets[0]!.emit(JSON.stringify({ symbol: "AAA", timeframe: "1m", candle: bar(2_000, 20) }));
  unsubscribe();
  assert.deepEqual(received, ["2000:20"]);
});

test("cancellation during paginated request stops further fetches", async () => {
  const controller = new AbortController();
  let requests = 0;
  const datafeed = new RestDatafeed({
    baseUrl: "https://market.example.test",
    symbols: { AAA: { symbol: "AAA", timezone: "UTC", pricePrecision: 2 } },
    fetcher: async () => {
      requests += 1;
      controller.abort();
      return new Response(JSON.stringify({ bars: [bar(1_000, 1)], next: "more" }), { status: 200 });
    },
  });
  await assert.rejects(
    datafeed.getBars({ symbol: "AAA", timeframe: "1m", from: 0, to: 10_000, signal: controller.signal }),
    (error: unknown) => error instanceof Error && error.name === "AbortError",
  );
  assert.equal(requests, 1);
});

test("multiple independent subscribers receive shared pushes and clean up independently", () => {
  const datafeed = new InMemoryDatafeed({ symbol: "AAA", timezone: "UTC", pricePrecision: 2 }, [bar(1_000, 10)]);
  const first: number[] = [];
  const second: number[] = [];
  const unsubscribeFirst = datafeed.subscribeBars({
    symbol: "AAA",
    timeframe: "1m",
    onBar: (candle) => first.push(candle.close),
  });
  const unsubscribeSecond = datafeed.subscribeBars({
    symbol: "AAA",
    timeframe: "1m",
    onBar: (candle) => second.push(candle.close),
  });
  datafeed.pushBar(bar(2_000, 20));
  unsubscribeFirst();
  datafeed.pushBar(bar(3_000, 30));
  unsubscribeSecond();
  datafeed.pushBar(bar(4_000, 40));
  assert.deepEqual(first, [20]);
  assert.deepEqual(second, [20, 30]);
});
