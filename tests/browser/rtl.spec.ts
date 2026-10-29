import { expect, test } from "@playwright/test";

test("RTL wheel zoom keeps the crosshair time anchored under the pointer", async ({ page }) => {
  await page.goto("/examples/vanilla/index.html");
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveCount(1);
  await page.waitForFunction(() => Boolean((globalThis as { __openklineChart?: unknown }).__openklineChart));

  await page.evaluate(() => {
    const chart = (globalThis as unknown as {
      __openklineChart: {
        setOptions(options: { direction: "rtl" }): void;
        subscribe(name: "crosshairMove", handler: (event: { time: number | null }) => void): void;
      };
    }).__openklineChart;
    chart.setOptions({ direction: "rtl" });
    chart.subscribe("crosshairMove", (event) => {
      (globalThis as unknown as { __rtlCrosshair?: { time: number | null } }).__rtlCrosshair = event;
    });
  });

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;

  const pointer = { x: box.x + box.width * 0.82, y: box.y + 60 };
  await page.mouse.move(pointer.x, pointer.y);
  await expect.poll(async () => page.evaluate(() => (globalThis as { __rtlCrosshair?: { time: number | null } }).__rtlCrosshair?.time ?? null)).not.toBeNull();
  const beforeState = await page.evaluate(() => ({
    time: (globalThis as { __rtlCrosshair?: { time: number | null } }).__rtlCrosshair?.time ?? null,
    range: (globalThis as unknown as { __openklineChart: { getVisibleRange(): { from: number; to: number } } }).__openklineChart.getVisibleRange(),
  }));
  const before = beforeState.time;
  expect(before).not.toBeNull();

  await page.mouse.wheel(0, -500);
  await page.mouse.move(pointer.x, pointer.y);
  const afterState = await page.evaluate(() => ({
    time: (globalThis as { __rtlCrosshair?: { time: number | null } }).__rtlCrosshair?.time ?? null,
    range: (globalThis as unknown as { __openklineChart: { getVisibleRange(): { from: number; to: number } } }).__openklineChart.getVisibleRange(),
  }));
  const after = afterState.time;
  expect(after).not.toBeNull();
  expect(Math.abs(after! - before!)).toBeLessThan(60 * 60 * 1_000);
});
