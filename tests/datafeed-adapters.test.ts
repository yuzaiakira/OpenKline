import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryDatafeed } from "../src/datafeed.js";
import { RestDatafeed } from "../src/datafeed-rest.js";
import { WebSocketDatafeed, type WebSocketLike } from "../src/datafeed-websocket.js";
import type { DatafeedRealtimeSubscriptionArgs } from "../src/types.js";

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

test("RestDatafeed stops paginated loading when its signal is aborted", async () => {
  const controller = new AbortController();
  let requests = 0;
  const datafeed = new RestDatafeed({
    baseUrl: "https://prices.example.test",
    symbols: { TEST: { symbol: "TEST", timezone: "UTC", pricePrecision: 2 } },
    fetcher: async () => {
      requests += 1;
      controller.abort();
      return new Response(JSON.stringify({ bars: [], next: "page-2" }), { status: 200 });
    },
  });

  await assert.rejects(
    datafeed.getBars({ symbol: "TEST", timeframe: "1m", from: 0, to: 10, signal: controller.signal }),
    (error: unknown) => error instanceof Error && error.name === "AbortError",
  );
  assert.equal(requests, 1);
});

test("RestDatafeed rejects unsafe and untrusted pagination destinations before requesting them", async () => {
  for (const next of ["https://evil.example.test/steal", "javascript:alert(1)", "//evil.example.test/steal"]) {
    const requests: string[] = [];
    const datafeed = new RestDatafeed({
      baseUrl: "https://prices.example.test",
      symbols: { TEST: { symbol: "TEST", timezone: "UTC", pricePrecision: 2 } },
      headers: { authorization: "Bearer private" },
      fetcher: async (input) => {
        requests.push(input);
        return new Response(JSON.stringify({ bars: [], next }), { status: 200 });
      },
    });

    await assert.rejects(
      datafeed.getBars({ symbol: "TEST", timeframe: "1m", from: 0, to: 10 }),
      /pagination URL (origin is not trusted|must use http or https)/,
    );
    assert.equal(requests.length, 1, `must not request ${next}`);
  }
});

test("RestDatafeed follows same-origin redirects but rejects cross-origin redirects before credentials leave the origin", async () => {
  const requests: Array<{ input: string; authorization: string | null; redirect: RequestRedirect | undefined }> = [];
  const datafeed = new RestDatafeed({
    baseUrl: "https://prices.example.test",
    symbols: { TEST: { symbol: "TEST", timezone: "UTC", pricePrecision: 2 } },
    headers: { authorization: "Bearer private" },
    fetcher: async (input, init) => {
      requests.push({ input, authorization: new Headers(init?.headers).get("authorization"), redirect: init?.redirect });
      if (requests.length === 1) return new Response(null, { status: 302, headers: { location: "/redirected-bars" } });
      return new Response(JSON.stringify({ bars: [], next: null }), { status: 200 });
    },
  });

  await datafeed.getBars({ symbol: "TEST", timeframe: "1m", from: 0, to: 10 });
  assert.equal(requests.length, 2);
  assert.equal(requests[0]?.authorization, "Bearer private");
  assert.equal(requests[1]?.authorization, "Bearer private");
  assert.equal(requests[0]?.redirect, "manual");
  assert.match(requests[1]?.input ?? "", /redirected-bars/);

  const crossOriginRequests: string[] = [];
  const crossOrigin = new RestDatafeed({
    baseUrl: "https://prices.example.test",
    symbols: { TEST: { symbol: "TEST", timezone: "UTC", pricePrecision: 2 } },
    headers: { authorization: "Bearer private" },
    fetcher: async (input) => {
      crossOriginRequests.push(input);
      return new Response(null, { status: 302, headers: { location: "https://evil.example.test/redirected-bars" } });
    },
  });
  await assert.rejects(
    crossOrigin.getBars({ symbol: "TEST", timeframe: "1m", from: 0, to: 10 }),
    /origin is not trusted/,
  );
  assert.equal(crossOriginRequests.length, 1);
});

test("RestDatafeed does not forward headers to an explicitly trusted foreign pagination origin by default", async () => {
  const requests: Array<{ input: string; authorization: string | null }> = [];
  const createDatafeed = (forwardHeadersToTrustedOrigins: boolean) => new RestDatafeed({
    baseUrl: "https://prices.example.test",
    trustedPaginationOrigins: ["https://archive.example.test"],
    forwardHeadersToTrustedOrigins,
    symbols: { TEST: { symbol: "TEST", timezone: "UTC", pricePrecision: 2 } },
    headers: { authorization: "Bearer private" },
    fetcher: async (input, init) => {
      requests.push({ input, authorization: new Headers(init?.headers).get("authorization") });
      return new Response(JSON.stringify(requests.length === 1
        ? { bars: [], next: "https://archive.example.test/bars?page=2" }
        : { bars: [], next: null }), { status: 200 });
    },
  });

  await createDatafeed(false).getBars({ symbol: "TEST", timeframe: "1m", from: 0, to: 10 });
  assert.equal(requests[0]?.authorization, "Bearer private");
  assert.equal(requests[1]?.authorization, null);

  requests.length = 0;
  await createDatafeed(true).getBars({ symbol: "TEST", timeframe: "1m", from: 0, to: 10 });
  assert.equal(requests[1]?.authorization, "Bearer private");
});

test("RestDatafeed rejects pagination loops and malformed server payloads", async () => {
  const repeated = new RestDatafeed({
    baseUrl: "https://prices.example.test",
    symbols: { TEST: { symbol: "TEST", timezone: "UTC", pricePrecision: 2 } },
    fetcher: async () => new Response(JSON.stringify({ bars: [], next: "https://prices.example.test/repeated" }), { status: 200 }),
  });
  await assert.rejects(
    repeated.getBars({ symbol: "TEST", timeframe: "1m", from: 0, to: 10 }),
    /pagination repeated a URL/,
  );

  for (const payload of [{ bars: {} }, { bars: [], next: 42 }, { bars: [{ time: 1, open: 1 }] }]) {
    const malformed = new RestDatafeed({
      baseUrl: "https://prices.example.test",
      symbols: { TEST: { symbol: "TEST", timezone: "UTC", pricePrecision: 2 } },
      fetcher: async () => new Response(JSON.stringify(payload), { status: 200 }),
    });
    await assert.rejects(
      malformed.getBars({ symbol: "TEST", timeframe: "1m", from: 0, to: 10 }),
      /REST bars response/,
    );
  }
});

test("WebSocketDatafeed reconnects with a bounded schedule and unsubscribes", async () => {
  const sockets: FakeSocket[] = [];
  const historical = new InMemoryDatafeed({ symbol: "TEST", timezone: "UTC", pricePrecision: 2 });
  const received: number[] = [];
  const statuses: string[] = [];
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

  const subscription: DatafeedRealtimeSubscriptionArgs = {
    symbol: "TEST",
    timeframe: "1m",
    onBar: (bar) => received.push(bar.close),
    onStatus: (status) => statuses.push(status),
  };
  const unsubscribe = datafeed.subscribeBars(subscription);
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
  assert.deepEqual(statuses, ["connecting", "connected", "disconnected", "connecting", "reconnected", "stopped"]);
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

