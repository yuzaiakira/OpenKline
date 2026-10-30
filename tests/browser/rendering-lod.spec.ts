import { expect, test } from "@playwright/test";

test("dense candle LOD reduces display work without changing source data", async ({ page }) => {
  await page.goto("/examples/vanilla/index.html");
  const result = await page.evaluate(async () => {
    const moduleUrl = new URL("/dist/src/index.js", location.href).href;
    const { createChart } = await import(moduleUrl);
    const host = document.createElement("div");
    host.style.width = "640px";
    host.style.height = "360px";
    document.body.append(host);
    const chart = createChart(host, { autoSize: false, width: 640, height: 360 });
    const start = Date.UTC(2026, 0, 1);
    const makeCandles = (count: number) => Array.from({ length: count }, (_, index) => {
      const open = 100 + Math.sin(index / 19) * 3;
      const close = open + Math.cos(index / 11) * 1.5;
      return {
        time: start + index * 60_000,
        open,
        high: Math.max(open, close) + 2 + index % 3,
        low: Math.min(open, close) - 2 - index % 2,
        close,
        volume: 10 + index,
      };
    });
    const exactCandles = makeCandles(100);
    const denseCandles = makeCandles(10_000);
    const contextPrototype = CanvasRenderingContext2D.prototype;
    const originalFillRect = contextPrototype.fillRect;
    let fillRectCalls = 0;
    contextPrototype.fillRect = function(this: CanvasRenderingContext2D, ...args: Parameters<typeof originalFillRect>) {
      fillRectCalls += 1;
      return originalFillRect.apply(this, args);
    };
    const flushFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    chart.setData(exactCandles);
    chart.fitContent();
    await flushFrame();
    fillRectCalls = 0;
    chart.fitContent();
    await flushFrame();
    const exactBodyCalls = fillRectCalls;
    chart.setData(denseCandles);
    fillRectCalls = 0;
    chart.fitContent();
    await flushFrame();
    const denseBodyCalls = fillRectCalls;
    const source = chart.getData();
    contextPrototype.fillRect = originalFillRect;
    chart.destroy();
    host.remove();
    return {
      exactBodyCalls,
      denseBodyCalls,
      sourceLength: source.length,
      sourceFirst: source[0],
      sourceLast: source.at(-1),
      expectedFirst: denseCandles[0],
      expectedLast: denseCandles.at(-1),
    };
  });

  expect(result.exactBodyCalls).toBeGreaterThanOrEqual(100);
  expect(result.denseBodyCalls).toBeLessThan(result.sourceLength / 4);
  expect(result.sourceLength).toBe(10_000);
  expect(result.sourceFirst).toEqual(result.expectedFirst);
  expect(result.sourceLast).toEqual(result.expectedLast);
});
