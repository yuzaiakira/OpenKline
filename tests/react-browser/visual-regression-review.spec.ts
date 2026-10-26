import { expect, test } from "@playwright/test";

test("captures deterministic desktop and light-theme review artifacts", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await expect(page.locator("canvas")).toHaveCount(1);
  const dark = await page.screenshot({ path: testInfo.outputPath("studio-dark.png"), fullPage: true });
  await page.getByLabel("Theme").selectOption("light");
  const light = await page.screenshot({ path: testInfo.outputPath("studio-light.png"), fullPage: true });
  expect(dark.byteLength).toBeGreaterThan(10_000);
  expect(light.byteLength).toBeGreaterThan(10_000);
});

test("captures a deterministic narrow-layout review artifact", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("canvas")).toHaveCount(1);
  const mobile = await page.screenshot({ path: testInfo.outputPath("studio-mobile.png"), fullPage: true });
  expect(mobile.byteLength).toBeGreaterThan(5_000);
});
