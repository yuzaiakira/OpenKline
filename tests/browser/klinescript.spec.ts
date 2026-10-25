import { expect, test } from "@playwright/test";

test("KlineScript playground compiles, reports diagnostics, updates inputs, and cleans up", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/examples/vanilla/klinescript.html");
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.locator("#status")).toContainText("Compiled EMA");
  await expect(page.locator("#inputs input")).toHaveCount(1);

  const initial = await page.evaluate(() => (globalThis as unknown as { __openklineScriptPlayground: { chart: { getSeriesIds(): string[] } } }).__openklineScriptPlayground.chart.getSeriesIds());
  expect(initial.some((id) => id.includes(":plot-1"))).toBe(true);

  await page.locator("#inputs input").fill("21");
  await page.locator("#inputs input").press("Enter");
  await page.locator("#source").fill('indicator("Broken")\nplot(eval(close))');
  await page.locator("#compile").click();
  await expect(page.locator("#diagnostics")).toContainText("KS3063");
  await expect(page.locator("#status")).toHaveText("");

  await page.locator("#source").fill('indicator("Oscillator", overlay=False)\nvalue = ta.rsi(close, 3)\nplot(value)\nhline(70)');
  await page.locator("#compile").click();
  await expect(page.locator("#status")).toContainText("Compiled Oscillator");
  await expect(page.locator("#inputs input")).toHaveCount(0);
  const afterCompile = await page.evaluate(() => {
    const chart = (globalThis as unknown as { __openklineScriptPlayground: { chart: { getPaneIds(): string[]; getSeriesIds(): string[] } } }).__openklineScriptPlayground.chart;
    return { paneCount: chart.getPaneIds().length, seriesIds: chart.getSeriesIds() };
  });
  expect(afterCompile.paneCount).toBeGreaterThan(1);
  expect(afterCompile.seriesIds.some((id) => id.includes(":hline-2"))).toBe(true);

  await page.locator("#remove").click();
  await expect(page.locator("#status")).toHaveText("Indicator removed");
  expect(pageErrors).toEqual([]);
});
