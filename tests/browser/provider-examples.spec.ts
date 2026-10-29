import { expect, test } from "@playwright/test";

test("offline JSON and generic REST examples use local sources", async ({ page }) => {
  const externalRequests: string[] = [];
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.startsWith("http://127.0.0.1:4173/")) await route.continue();
    else { externalRequests.push(url); await route.abort(); }
  });
  await page.goto("/examples/vanilla/offline-data.html");
  await page.waitForFunction(() => Boolean((globalThis as { __openklineOfflineExample?: unknown }).__openklineOfflineExample));
  const offline = await page.evaluate(() => (globalThis as unknown as { __openklineOfflineExample: { chart: { getData(): unknown[]; getDrawings(): unknown[] } } }).__openklineOfflineExample.chart);
  expect(offline).toBeTruthy();
  expect(await page.evaluate(() => (globalThis as unknown as { __openklineOfflineExample: { chart: { getData(): unknown[]; getDrawings(): unknown[] } } }).__openklineOfflineExample.chart.getData().length)).toBe(8);
  expect(await page.evaluate(() => (globalThis as unknown as { __openklineOfflineExample: { chart: { getDrawings(): unknown[] } } }).__openklineOfflineExample.chart.getDrawings().length)).toBe(1);
  await page.evaluate(() => (globalThis as unknown as { __openklineOfflineExample: { chart: { destroy(): void } } }).__openklineOfflineExample.chart.destroy());

  await page.goto("/examples/vanilla/rest-datafeed.html");
  await page.waitForFunction(() => Boolean((globalThis as { __openklineRestExample?: unknown }).__openklineRestExample));
  const rest = await page.evaluate(async () => {
    const state = (globalThis as unknown as { __openklineRestExample: { ready: Promise<void>; chart: { getData(): unknown[] }; requests: string[] } }).__openklineRestExample;
    await state.ready;
    return { dataLength: state.chart.getData().length, requests: state.requests.length };
  });
  expect(rest).toEqual({ dataLength: 3, requests: 2 });
  expect(externalRequests).toEqual([]);
});

test("generic WebSocket and optional Binance adapters normalize injected fixtures", async ({ page }) => {
  await page.goto("/examples/vanilla/websocket-datafeed.html");
  await page.waitForFunction(() => Boolean((globalThis as { __openklineWebSocketExample?: unknown }).__openklineWebSocketExample));
  const websocket = await page.evaluate(async () => {
    const state = (globalThis as unknown as { __openklineWebSocketExample: { ready: Promise<void>; socket: { open(): void; message(data: string): void; sent: string[] }; chart: { getData(): Array<{ close: number }> } } }).__openklineWebSocketExample;
    await state.ready;
    state.socket.open();
    state.socket.message(JSON.stringify({ symbol: "LOCAL-USD", timeframe: "1h", candle: { time: 1767229200000, open: 11, high: 13, low: 10, close: 12, volume: 120 } }));
    return { sent: state.socket.sent.length, close: state.chart.getData().at(-1)?.close, length: state.chart.getData().length };
  });
  expect(websocket.sent).toBe(1);
  expect(websocket.close).toBe(12);
  expect(websocket.length).toBe(2);

  await page.goto("/examples/vanilla/binance-datafeed.html?fixture=1");
  await page.waitForFunction(() => Boolean((globalThis as { __openklineBinanceFixture?: unknown }).__openklineBinanceFixture));
  const binance = await page.evaluate(async () => {
    const state = (globalThis as unknown as { __openklineBinanceFixture: { datafeed: { resolveSymbol(symbol: string): Promise<{ exchange?: string }>; getBars(query: object): Promise<Array<{ time: number; close: number }>>; subscribeBars(args: object): () => void }; socket: { open(): void; message(data: string): void }; bars: Array<Array<string | number>>; requests: number[] } }).__openklineBinanceFixture;
    const symbol = await state.datafeed.resolveSymbol("BTCUSDT");
    const bars = await state.datafeed.getBars({ symbol: "BTCUSDT", timeframe: "1m", from: 0, to: 2_000 });
    const received: number[] = [];
    const unsubscribe = state.datafeed.subscribeBars({ symbol: "BTCUSDT", timeframe: "1m", onBar: (bar: { close: number }) => received.push(bar.close) });
    state.socket.open();
    state.socket.message(JSON.stringify({ s: "BTCUSDT", k: { t: 1_000, o: "101", h: "103", l: "100", c: "102", v: "44", i: "1m" } }));
    unsubscribe();
    return { exchange: symbol.exchange, count: bars.length, first: [bars[0]?.time, bars[0]?.close], last: [bars.at(-1)?.time, bars.at(-1)?.close], requests: state.requests, received };
  });
  expect(binance.exchange).toBe("BINANCE");
  expect(binance.count).toBe(1_001);
  expect(binance.first).toEqual([0, 101]);
  expect(binance.last).toEqual([1_000, 1_101]);
  expect(binance.requests).toEqual([0, 1_000]);
  expect(binance.received).toEqual([102]);
});
