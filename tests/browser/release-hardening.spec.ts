import { expect, test } from "@playwright/test";

test("repeated chart creation, update, subscription, and destruction leaves no canvases", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/examples/vanilla/direct-data.html");
  await page.waitForFunction(() => Boolean((globalThis as { __openklineDirectExample?: unknown }).__openklineDirectExample));

  const result = await page.evaluate(async () => {
    const initial = (globalThis as unknown as { __openklineDirectExample: { chart: { destroy(): void } } }).__openklineDirectExample;
    initial.chart.destroy();
    const moduleUrl = new URL("/dist/src/index.js", location.href).href;
    const { createChart } = await import(moduleUrl);
    const bars = Array.from({ length: 24 }, (_, index) => ({ time: 1_700_000_000_000 + index * 60_000, open: 100, high: 105, low: 95, close: 101 + index * 0.1, volume: 10 }));
    for (let index = 0; index < 5; index += 1) {
      const host = document.createElement("div");
      host.style.width = "320px";
      host.style.height = "180px";
      document.body.append(host);
      const chart = createChart(host, { autoSize: false, width: 320, height: 180 });
      chart.setData(bars);
      chart.addIndicator("SMA", { period: 5 });
      chart.addDrawing("horizontal-line", { points: [{ time: bars[0]!.time, price: 100 }] });
      const unsubscribe = chart.subscribe("dataUpdated", () => undefined);
      const close = 102 + index;
      chart.update({ ...bars.at(-1)!, open: close - 1, high: close + 2, low: close - 2, close });
      unsubscribe();
      chart.destroy();
      host.remove();
    }
    return { canvases: document.querySelectorAll("canvas").length };
  });

  expect(result.canvases).toBe(0);
  expect(errors).toEqual([]);
});
