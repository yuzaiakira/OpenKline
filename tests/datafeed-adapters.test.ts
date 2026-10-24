import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryDatafeed } from "../src/datafeed.js";
import { RestDatafeed } from "../src/datafeed-rest.js";
import { WebSocketDatafeed, type WebSocketLike } from "../src/datafeed-websocket.js";

test("RestDatafeed paginates, normalizes timestamps, deduplicates, and sorts", async () => {
  const requests: string[] = [];
  const pages = [
    { bars: [
      { time: 1_700_000_060, open: 2, high: 3, low: 1, close: 2.5 },
      { time: "2023-11-14T22:13:20.000Z", open: 1, high: 2, low: 0.5, close: 1.5 },
    ], next: "page-2" },
    { bars: [{ time: 1_700_000_060_000, open: 2, high: 4, low: 1, close: 3 }], next: null },
  ];
  let pageIndex = 0;
  const datafeed = new RestDatafeed({
    baseUrl: "https://prices.example.test",
    symbols: { TEST: { symbol: "TEST", timezone: "UTC", pricePrecision: 2 } },
    fetcher: async (input) => {
      requests.push(input);
      return new Response(JSON.stringify(pages[pageIndex++] ?? { bars: [] }), { status: 200 });
    },
  });

  const result = await datafeed.getBars({ symbol: "TEST", timeframe: "1m", from: 1_700_000_000_000, to: 1_700_000_120_000 });
  assert.deepEqual(result.map((bar) => [bar.time, bar.close]), [
    [1_700_000_000_000, 1.5],
    [1_700_000_060_000, 3],
  ]);
  assert.equal(requests.length, 2);
  assert.match(requests[1] ?? "", /cursor=page-2/);
});

test("WebSocketDatafeed reconnects with a bounded schedule and unsubscribes", async () => {
  const sockets: FakeSocket[] = [];
  const historical = new InMemoryDatafeed({ symbol: "TEST", timezone: "UTC", pricePrecision: 2 });
  const received: number[] = [];
  const datafeed = new WebSocketDatafeed({
    url: "wss://prices.example.test",
    symbols: { TEST: { symbol: "TEST", timezone: "UTC", pricePrecision: 2 } },
    historical,
    createSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    createSubscribeMessage: (args) => ({ subscribe: args.symbol }),
    initialBackoffMs: 0,
    maxBackoffMs: 0,
    maxReconnectAttempts: 2,
  });

  const unsubscribe = datafeed.subscribeBars({
    symbol: "TEST",
    timeframe: "1m",
    onBar: (bar) => received.push(bar.close),
  });
  sockets[0]!.open();
  sockets[0]!.message(JSON.stringify({ symbol: "TEST", timeframe: "1m", candle: { time: 1, open: 1, high: 2, low: 0, close: 1.5 } }));
  sockets[0]!.message(JSON.stringify({ symbol: "TEST", timeframe: "1m", candle: { time: 1, open: 1, high: 2, low: 0, close: 1.5 } }));
  sockets[0]!.close();
  await new Promise((resolve) => setTimeout(resolve, 5));
  sockets[1]!.open();
  sockets[1]!.message(JSON.stringify({ symbol: "TEST", timeframe: "1m", candle: { time: 2, open: 1.5, high: 2, low: 1, close: 1.75 } }));
  sockets[1]!.message(JSON.stringify({ symbol: "TEST", timeframe: "1m", candle: { time: 1, open: 1, high: 2.1, low: 0, close: 1.6 } }));
  unsubscribe();
  await new Promise((resolve) => setTimeout(resolve, 5));

  assert.deepEqual(received, [1.5, 1.75, 1.6]);
  assert.equal(sockets.length, 2);
  assert.equal(sockets[1]!.closeCount, 1);
});

class FakeSocket implements WebSocketLike {
  public readonly readyState = 0;
  public onopen: (() => void) | null = null;
  public onmessage: ((event: { data: unknown }) => void) | null = null;
  public onerror: ((event: unknown) => void) | null = null;
  public onclose: (() => void) | null = null;
  public sent: string[] = [];
  public closeCount = 0;

  public send(data: string): void {
    this.sent.push(data);
  }

  public close(): void {
    this.closeCount += 1;
    this.onclose?.();
  }

  public open(): void {
    this.onopen?.();
  }

  public message(data: unknown): void {
    this.onmessage?.({ data });
  }
}

