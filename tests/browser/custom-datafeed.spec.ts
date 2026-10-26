import { expect, test } from "@playwright/test";

test("custom exchange owns history and stream without external network", async ({ page }) => {
  const externalRequests: string[] = [];
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.startsWith("http://127.0.0.1:4173/")) await route.continue();
    else {
      externalRequests.push(url);
      await route.abort();
    }
  });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/examples/vanilla/custom-datafeed.html");
  await page.waitForFunction(() => Boolean((globalThis as { __openklineCustomExchange?: unknown }).__openklineCustomExchange));

  const initial = await page.evaluate(async () => {
    const state = (globalThis as unknown as { __openklineCustomExchange: { ready: Promise<void>; exchange: { resolveCalls: number; historyCalls: number }; chart: { getData(): unknown[]; getDrawings(): unknown[]; getSeriesIds(): string[] } } }).__openklineCustomExchange;
    await state.ready;
    return { resolveCalls: state.exchange.resolveCalls, historyCalls: state.exchange.historyCalls, dataLength: state.chart.getData().length, drawingCount: state.chart.getDrawings().length, series: state.chart.getSeriesIds() };
  });
  expect(initial.resolveCalls).toBe(1);
  expect(initial.historyCalls).toBe(1);
  expect(initial.dataLength).toBe(24);
  expect(initial.drawingCount).toBe(1);
  expect(initial.series.some((id) => id.startsWith("candlestick-"))).toBe(true);

  const streamed = await page.evaluate(() => {
    const state = (globalThis as unknown as { __openklineCustomExchange: { exchange: { bars: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>; pushBar(bar: object): void }; chart: { getData(): Array<{ time: number; close: number }>; stopDatafeed(): void; destroy(): void } } }).__openklineCustomExchange;
    const latest = state.exchange.bars.at(-1)!;
    state.exchange.pushBar({ ...latest, close: latest.close + 0.5, high: latest.high + 0.5 });
    const corrected = state.chart.getData().at(-1)!.close;
    state.exchange.pushBar({ time: latest.time + 60 * 60 * 1000, open: latest.close + 0.5, high: latest.close + 1.5, low: latest.close, close: latest.close + 1, volume: latest.volume + 5 });
    const appended = state.chart.getData().length;
    state.chart.stopDatafeed();
    state.exchange.pushBar({ time: latest.time + 2 * 60 * 60 * 1000, open: latest.close + 1, high: latest.close + 2, low: latest.close + 0.5, close: latest.close + 1.5, volume: latest.volume + 10 });
    const afterStop = state.chart.getData().length;
    state.chart.destroy();
    return { corrected, appended, afterStop };
  });
  expect(streamed.corrected).toBeGreaterThan(50);
  expect(streamed.appended).toBe(25);
  expect(streamed.afterStop).toBe(25);
  expect(externalRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});
