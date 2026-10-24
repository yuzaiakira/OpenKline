import { expect, test } from "@playwright/test";

test("renders candles and supports interaction and cleanup", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/examples/vanilla/index.html");
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveCount(1);
  await page.waitForFunction(() => Boolean((globalThis as { __openklineChart?: unknown }).__openklineChart));

  const initial = await page.evaluate(() => {
    const chart = (globalThis as unknown as { __openklineChart: { getVisibleRange(): { from: number; to: number } } }).__openklineChart;
    const element = document.querySelector("canvas") as HTMLCanvasElement;
    const context = element.getContext("2d");
    const pixel = context?.getImageData(100, 100, 1, 1).data ?? new Uint8ClampedArray();
    return { range: chart.getVisibleRange(), pixel: Array.from(pixel), width: element.width, height: element.height };
  });

  expect(initial.range.to).toBeGreaterThan(initial.range.from);
  expect(initial.width).toBeGreaterThan(0);
  expect(initial.height).toBeGreaterThan(0);
  expect(initial.pixel.length).toBe(4);

  const seriesIds = await page.evaluate(() => (globalThis as unknown as { __openklineChart: { getSeriesIds(): string[] } }).__openklineChart.getSeriesIds());
  expect(seriesIds.slice(0, 4)).toEqual(["price", "trend", "area", "volume"]);
  expect(seriesIds).toHaveLength(13);
  const paneIds = await page.evaluate(() => (globalThis as unknown as { __openklineChart: { getPaneIds(): string[] } }).__openklineChart.getPaneIds());
  expect(paneIds).toHaveLength(5);

  await page.evaluate(() => {
    const chart = (globalThis as unknown as { __openklineChart: { subscribe(name: string, handler: (event: unknown) => void): void } }).__openklineChart;
    chart.subscribe("crosshairMove", (event) => {
      (globalThis as unknown as { __lastCrosshair?: unknown }).__lastCrosshair = event;
    });
  });

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) {
    return;
  }

  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.45);
  await expect(page).toHaveTitle(/OpenKline \d/);
  await page.waitForFunction(() => {
    const event = (globalThis as unknown as { __lastCrosshair?: { series?: unknown[] } }).__lastCrosshair;
    return (event?.series?.length ?? 0) === 13;
  });

  const beforeZoom = await page.evaluate(() => (globalThis as unknown as { __openklineChart: { getVisibleRange(): { from: number; to: number } } }).__openklineChart.getVisibleRange());
  await page.mouse.wheel(0, -500);
  const afterZoom = await page.evaluate(() => (globalThis as unknown as { __openklineChart: { getVisibleRange(): { from: number; to: number } } }).__openklineChart.getVisibleRange());
  expect(afterZoom.to - afterZoom.from).toBeLessThan(beforeZoom.to - beforeZoom.from);

  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.5);
  await page.mouse.up();
  const afterPan = await page.evaluate(() => (globalThis as unknown as { __openklineChart: { getVisibleRange(): { from: number; to: number } } }).__openklineChart.getVisibleRange());
  expect(afterPan.from).toBeGreaterThan(afterZoom.from);

  const beforeTheme = await page.evaluate(() => Array.from((document.querySelector("canvas") as HTMLCanvasElement).getContext("2d")!.getImageData(0, 0, 1, 1).data));
  await page.evaluate(() => (globalThis as unknown as { __openklineChart: { setOptions(options: { theme: string }): void } }).__openklineChart.setOptions({ theme: "light" }));
  const afterTheme = await page.evaluate(() => Array.from((document.querySelector("canvas") as HTMLCanvasElement).getContext("2d")!.getImageData(0, 0, 1, 1).data));
  expect(afterTheme).not.toEqual(beforeTheme);

  await page.evaluate(() => {
    const chart = (globalThis as unknown as { __openklineChart: { update(candle: object): void; addLineSeries(options: object): { setData(data: object[]): void; remove(): void }; destroy(): void } }).__openklineChart;
    chart.update({ time: Date.UTC(2026, 0, 1) + 79 * 60 * 60 * 1000, open: 101, high: 104, low: 99, close: 103 });
    const temporary = chart.addLineSeries({ id: "temporary" });
    temporary.setData([{ time: Date.UTC(2026, 0, 1), value: 100 }]);
    temporary.remove();
  });

  const finalSeriesIds = await page.evaluate(() => (globalThis as unknown as { __openklineChart: { getSeriesIds(): string[] } }).__openklineChart.getSeriesIds());
  expect(finalSeriesIds).toHaveLength(13);
  expect(finalSeriesIds).not.toContain("temporary");

  const replacementIndicatorId = await page.evaluate(() => {
    const chart = (globalThis as unknown as {
      __openklineChart: {
        removeIndicator(id: string): void;
        addIndicator(id: string, options: object): { id: string; remove(): void };
      };
    }).__openklineChart;
    chart.removeIndicator("indicator-1");
    const replacement = chart.addIndicator("RSI", { period: 7 });
    const id = replacement.id;
    replacement.remove();
    return id;
  });
  expect(replacementIndicatorId).toBe("indicator-5");

  const filledBandPixels = await page.evaluate(() => {
    const chart = (globalThis as unknown as {
      __openklineChart: {
        addIndicator(id: string, options: object): { setOutputStyle(outputId: string, style: object): void; remove(): void };
      };
    }).__openklineChart;
    const band = chart.addIndicator("BOLLINGER_BANDS", { period: 5, standardDeviations: 1, pane: "main" });
    band.setOutputStyle("upper", { fillColor: "#ff00ff", fillOpacity: 0.5 });
    band.setOutputStyle("lower", { color: "#ff00ff" });
    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    const pixels = canvas.getContext("2d")!.getImageData(68, 14, canvas.width - 80, canvas.height - 44).data;
    const count = Array.from({ length: Math.floor(pixels.length / 4) }, (_, index) => index)
      .filter((index) => {
        const offset = index * 4;
        return (pixels[offset] ?? 0) > 100 && (pixels[offset + 2] ?? 0) > 100 && (pixels[offset + 1] ?? 0) < 100;
      }).length;
    band.remove();
    return count;
  });
  expect(filledBandPixels).toBeGreaterThan(0);

  const drawingState = await page.evaluate(() => {
    const chart = (globalThis as unknown as {
      __openklineChart: {
        getData(): Array<{ time: number; high: number; low: number }>;
        addDrawing(type: string, options: object): { id: string };
        getDrawings(): Array<{ id: string; type: string }>;
        serializeDrawings(): { version: number; drawings: unknown[] };
      };
    }).__openklineChart;
    const data = chart.getData();
    chart.addDrawing("trend-line", {
      id: "browser-trend",
      points: [
        { time: data[10]!.time, price: data[10]!.low },
        { time: data[30]!.time, price: data[30]!.high },
      ],
      style: { color: "#f59e0b", lineWidth: 2 },
    });
    return { count: chart.getDrawings().length, document: chart.serializeDrawings() };
  });
  expect(drawingState.count).toBe(1);
  expect(drawingState.document.version).toBe(1);
  await page.evaluate(() => (globalThis as unknown as { __openklineChart: { startDrawing(type: string): void } }).__openklineChart.startDrawing("vertical-line"));
  await page.mouse.click(box.x + 120, box.y + 42);
  const interactiveDrawingCount = await page.evaluate(() => (globalThis as unknown as { __openklineChart: { getDrawings(): unknown[] } }).__openklineChart.getDrawings().length);
  expect(interactiveDrawingCount).toBe(2);

  const widthBeforeResize = await canvas.evaluate((element) => (element as HTMLCanvasElement).width);
  await page.setViewportSize({ width: 800, height: 700 });
  await expect.poll(() => canvas.evaluate((element) => (element as HTMLCanvasElement).width)).toBeLessThan(widthBeforeResize);

  await page.evaluate(() => {
    const chart = (globalThis as unknown as { __openklineChart: { destroy(): void } }).__openklineChart;
    chart.destroy();
  });
  await expect(canvas).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
