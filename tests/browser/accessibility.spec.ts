import { expect, test } from "@playwright/test";

test("empty Canvas charts expose an explicit accessible state", async ({ page }) => {
  await page.goto("/examples/vanilla/direct-data.html");
  await page.waitForFunction(() => Boolean((globalThis as { __openklineDirectExample?: unknown }).__openklineDirectExample));
  const emptySummary = await page.evaluate(async () => {
    const host = document.createElement("div");
    host.style.width = "320px";
    host.style.height = "180px";
    document.body.append(host);
    const moduleUrl = new URL("/dist/src/index.js", location.href).href;
    const { createChart } = await import(moduleUrl);
    const chart = createChart(host, { autoSize: false, width: 320, height: 180 });
    const canvas = host.querySelector("canvas");
    const label = canvas?.getAttribute("aria-label");
    const tabIndex = canvas?.getAttribute("tabindex");
    chart.destroy();
    host.remove();
    return { label, tabIndex };
  });
  expect(emptySummary.label).toBe("Financial price chart; no data loaded");
  expect(emptySummary.tabIndex).toBe("0");
});
