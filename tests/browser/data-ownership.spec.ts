import { expect, test } from "@playwright/test";

test("direct data works offline with corrections, analysis, drawings, and cleanup", async ({ page }) => {
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
  await page.goto("/examples/vanilla/direct-data.html");
  await page.waitForFunction(() => Boolean((globalThis as { __openklineDirectExample?: unknown }).__openklineDirectExample));
  await expect(page.locator("canvas")).toHaveCount(1);

  const before = await page.evaluate(() => {
    const state = (globalThis as unknown as { __openklineDirectExample: { chart: { getData(): Array<{ time: number; close: number }>; getDrawings(): unknown[]; getSeriesIds(): string[]; getPriceScaleOptions(): { mode: string }; addIndicator(id: string, options: object): { id: string }; update(candle: object): void } } }).__openklineDirectExample;
    const latest = state.chart.getData().at(-1)!;
    state.chart.update({ time: latest.time, open: latest.close, high: latest.close + 2, low: latest.close - 2, close: latest.close + 0.75, volume: 2_000 });
    state.chart.update({ time: latest.time + 60 * 60 * 1000, open: latest.close + 0.75, high: latest.close + 2.1, low: latest.close + 0.2, close: latest.close + 1.4, volume: 2_100 });
    const extra = state.chart.addIndicator("EMA", { period: 4, pane: "main" });
    return { initialLength: state.chart.getData().length - 1, latestClose: state.chart.getData().at(-2)?.close, finalLength: state.chart.getData().length, drawings: state.chart.getDrawings().length, series: state.chart.getSeriesIds(), extraId: extra.id, scale: state.chart.getPriceScaleOptions() };
  });
  expect(before.initialLength).toBe(32);
  expect(before.latestClose).toBeGreaterThan(100);
  expect(before.finalLength).toBe(33);
  expect(before.drawings).toBe(1);
  expect(before.series.some((id) => id.startsWith("candlestick-"))).toBe(true);
  expect(before.scale.mode).toBe("linear");
  expect(externalRequests).toEqual([]);
  expect(pageErrors).toEqual([]);

  const remainingCanvas = await page.evaluate(() => {
    const state = (globalThis as unknown as { __openklineDirectExample: { chart: { destroy(): void } } }).__openklineDirectExample;
    state.chart.destroy();
    return document.querySelectorAll("canvas").length;
  });
  expect(remainingCanvas).toBe(0);
});
