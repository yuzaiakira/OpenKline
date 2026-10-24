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

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) {
    return;
  }

  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.45);
  await expect(page).toHaveTitle(/OpenKline \d/);

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
    const chart = (globalThis as unknown as { __openklineChart: { update(candle: object): void; destroy(): void } }).__openklineChart;
    chart.update({ time: Date.UTC(2026, 0, 1) + 79 * 60 * 60 * 1000, open: 101, high: 104, low: 99, close: 103 });
  });

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
