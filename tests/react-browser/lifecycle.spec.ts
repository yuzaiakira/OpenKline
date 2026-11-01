import { expect, test } from "@playwright/test";

interface Snapshot {
  candles: number;
  indicators: string[];
  drawings: Array<{ id: string; pointTime: number }>;
  plugins: number;
  theme: string;
  setup: number;
  cleanup: number;
}

async function snapshot(page: import("@playwright/test").Page): Promise<Snapshot> {
  await expect(page.getByTestId("lifecycle-snapshot")).not.toHaveText("null");
  return JSON.parse(await page.getByTestId("lifecycle-snapshot").textContent() ?? "null") as Snapshot;
}

test("FinancialChart reconciles stable React identities through Strict Mode, workspace restore, and remount", async ({ page }) => {
  await page.goto("/lifecycle-verification");
  await expect(page.locator("canvas")).toHaveCount(1);
  const initial = await snapshot(page);
  expect(initial.candles).toBe(16);
  expect(initial.indicators).toEqual(["lifecycle-rsi"]);
  expect(initial.drawings).toHaveLength(1);
  expect(initial.plugins).toBe(1);
  expect(initial.setup).toBeGreaterThanOrEqual(1);

  await page.getByRole("button", { name: "Move declarative drawing", exact: true }).click();
  const moved = await snapshot(page);
  const movedTime = moved.drawings[0]?.pointTime;
  expect(movedTime).toBeGreaterThan(initial.drawings[0]?.pointTime ?? Number.MAX_SAFE_INTEGER);

  await page.getByRole("button", { name: "Rerender equivalent props", exact: true }).click();
  await expect.poll(() => snapshot(page)).toMatchObject({
    candles: 16,
    indicators: ["lifecycle-rsi"],
    drawings: [{ id: "lifecycle-trend", pointTime: movedTime }],
    plugins: 1,
    setup: initial.setup,
    cleanup: initial.cleanup,
  });

  await page.getByRole("button", { name: "Remove declarative drawing imperatively" }).click();
  await expect.poll(async () => (await snapshot(page)).drawings).toEqual([]);
  await page.getByRole("button", { name: "Rerender equivalent props", exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).drawings).toEqual([
    { id: "lifecycle-trend", pointTime: initial.drawings[0]?.pointTime },
  ]);

  await page.getByRole("button", { name: "Restore workspace without data props" }).click();
  await expect.poll(() => snapshot(page)).toMatchObject({
    candles: 16,
    indicators: ["lifecycle-rsi"],
    drawings: [{ id: "lifecycle-trend", pointTime: initial.drawings[0]?.pointTime }],
    plugins: 1,
  });

  const beforeTheme = (await snapshot(page)).theme;
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await expect.poll(async () => (await snapshot(page)).theme).not.toBe(beforeTheme);

  const beforeUnmount = await snapshot(page);
  await page.getByRole("button", { name: "Unmount" }).click();
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.getByRole("button", { name: "Remount" }).click();
  await expect(page.locator("canvas")).toHaveCount(1);
  // Production React invokes plugin setup/cleanup once per mount. Strict Mode
  // (next dev) may double-invoke; accept either delta while requiring exactly
  // one live instance after remount (setup === cleanup + 1).
  await expect.poll(async () => {
    const current = await snapshot(page);
    return {
      plugins: current.plugins,
      setupAdvanced: current.setup > beforeUnmount.setup,
      cleanupAdvanced: current.cleanup > beforeUnmount.cleanup,
      liveInstances: current.setup - current.cleanup,
    };
  }).toMatchObject({ plugins: 1, setupAdvanced: true, cleanupAdvanced: true, liveInstances: 1 });
  const remounted = await snapshot(page);
  expect(remounted.setup).toBe(remounted.cleanup + 1);
  expect([1, 2]).toContain(remounted.setup - beforeUnmount.setup);
  expect([1, 2]).toContain(remounted.cleanup - beforeUnmount.cleanup);
});
