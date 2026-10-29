import { expect, test } from "@playwright/test";

test("public comparison engine renders normalized lines, aligns crosshair values, and cleans up", async ({ page }) => {
  await page.goto("/examples/vanilla/index.html");
  const result = await page.evaluate(async () => {
    const moduleUrl: string = "/dist/src/index.js";
    const { ComparisonEngine, createChart } = await import(moduleUrl);
    const host = document.createElement("div");
    host.style.width = "640px";
    host.style.height = "320px";
    document.body.append(host);
    const chart = createChart(host, { autoSize: false, width: 640, height: 320, timeZone: "UTC" });
    const engine = new ComparisonEngine({ mode: "percentage" });
    engine.addAsset("BTC-USD", [{ time: 1_000, price: 100 }, { time: 2_000, price: 110 }, { time: 3_000, price: 105 }], { color: "#f59e0b" });
    engine.addAsset("ETH-USD", [{ time: 1_500, price: 50 }, { time: 2_000, price: 55 }, { time: 3_000, price: 60 }], { color: "#60a5fa" });
    engine.setBaseline(2_000, { maxAgeMs: 1_000 });
    type BrowserComparisonOutput = { id: string; label: string; color?: string; baselineTime: number | null; baselinePrice: number | null; data: Array<{ time: number; value: number }> };
    type BrowserCrosshairEvent = { time: number | null; series: Array<{ id: string; value: unknown }> };
    const outputs = engine.getNormalizedData() as BrowserComparisonOutput[];
    const series = outputs.map((output: BrowserComparisonOutput) => {
      const line = chart.addLineSeries({ id: `comparison-${output.id}`, title: output.label, style: { color: output.color, lineWidth: 2 } });
      line.setData(output.data);
      return { id: output.id, baselineTime: output.baselineTime, baselinePrice: output.baselinePrice, data: output.data, seriesLength: line.getData().length };
    });
    const events: Array<{ time: number | null; values: number }> = [];
    chart.subscribe("crosshairMove", (event: BrowserCrosshairEvent) => events.push({ time: event.time, values: event.series.filter((item: { id: string; value: unknown }) => item.id.startsWith("comparison-") && item.value !== null).length }));
    chart.setCrosshairAtTime(3_000);
    const info = chart.getSeriesInfo().filter((item: { id: string }) => item.id.startsWith("comparison-"));
    const raw = engine.getRawData("ETH-USD");
    const crosshairTime = events.at(-1)?.time ?? null;
    engine.removeAsset("ETH-USD");
    chart.removeSeries("comparison-ETH-USD");
    const remaining = engine.getAssetIds();
    chart.destroy();
    engine.dispose();
    host.remove();
    return { series, info, crosshairTime, raw, remaining, canvases: document.querySelectorAll("canvas").length };
  });

  expect(result.series).toHaveLength(2);
  expect(result.series[0]).toMatchObject({ id: "BTC-USD", baselineTime: 2_000, baselinePrice: 110, seriesLength: 2 });
  expect(result.series[0]?.data[0]).toEqual({ time: 2_000, value: 0 });
  expect(result.series[0]?.data[1]?.value).toBeCloseTo(((105 / 110) - 1) * 100, 8);
  expect(result.series[1]).toMatchObject({ id: "ETH-USD", baselineTime: 2_000, baselinePrice: 55, seriesLength: 2 });
  expect(result.series[1]?.data[0]).toEqual({ time: 2_000, value: 0 });
  expect(result.series[1]?.data[1]?.value).toBeCloseTo(((60 / 55) - 1) * 100, 8);
  expect(result.info).toHaveLength(2);
  expect(result.crosshairTime).toBe(3_000);
  expect(result.raw).toEqual([{ time: 1_500, price: 50 }, { time: 2_000, price: 55 }, { time: 3_000, price: 60 }]);
  expect(result.remaining).toEqual(["BTC-USD"]);
  expect(result.canvases).toBe(1); // the vanilla fixture remains mounted; the comparison chart is gone.
});
