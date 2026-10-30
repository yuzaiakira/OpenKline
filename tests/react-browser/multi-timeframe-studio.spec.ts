import { expect, test } from "./studio-test.js";

test("Studio exposes causal multi-timeframe analysis per panel and persists configuration", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  const panel = page.locator('[data-panel-id="chart-1"]');
  const target = page.getByLabel("Higher-timeframe target");
  await expect(target).toHaveValue("4h");
  await page.locator('select[aria-label="Higher-timeframe indicator"]').selectOption("EMA");
  await page.getByLabel("Higher-timeframe period").fill("8");
  await page.getByLabel("Higher-timeframe finality").selectOption("complete-only");
  await page.getByRole("button", { name: "Toggle higher-timeframe indicator", exact: true }).click();
  await expect(page.locator('[data-multi-timeframe-indicator]')).toContainText("EMA");
  await expect(panel).toBeVisible();

  await page.getByRole("button", { name: "Toggle previous timeframe levels", exact: true }).click();
  await expect(page.locator('[data-multi-timeframe-reference]')).toContainText("Previous OHLC");

  await page.getByLabel("Workspace name", { exact: true }).fill("Multi-timeframe Verification");
  await page.getByRole("button", { name: "Save As", exact: true }).click();
  const saved = await page.evaluate(() => {
    const value = JSON.parse(window.localStorage.getItem("openkline-studio-workspaces-v1") ?? "null") as { workspaces?: Array<{ name: string; charts: Array<{ workspace: { multiTimeframe?: { indicators: Array<{ indicatorId: string; targetTimeframe: string }>; references: Array<{ targetTimeframe: string }> } } }> }> } | null;
    return value?.workspaces?.find((workspace) => workspace.name === "Multi-timeframe Verification") ?? null;
  });
  expect(saved?.charts[0]?.workspace.multiTimeframe?.indicators).toMatchObject([{ id: expect.any(String), indicatorId: "EMA", targetTimeframe: "4h" }]);
  expect(saved?.charts[0]?.workspace.multiTimeframe?.references).toHaveLength(1);

  await page.getByRole("button", { name: "Enter replay", exact: true }).click();
  await expect(page.locator('select[aria-label="Higher-timeframe indicator"]')).toBeDisabled();
  await expect(page.getByLabel("Higher-timeframe target")).toBeDisabled();
  await page.getByRole("button", { name: "Exit replay", exact: true }).click();
  await expect(page.locator('select[aria-label="Higher-timeframe indicator"]')).toBeEnabled();

  await page.getByLabel("Chart layout").selectOption("two-horizontal");
  await expect(page.locator("[data-panel-id]")).toHaveCount(2);
  const panelIds = await page.getByLabel("Active chart panel").locator("option").evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
  const secondPanelId = panelIds.find((id) => id !== "chart-1");
  expect(secondPanelId).toBeDefined();
  if (secondPanelId === undefined) return;
  await page.getByLabel("Active chart panel").selectOption(secondPanelId);
  await expect(page.locator('[data-multi-timeframe-indicator]')).toHaveCount(0);
  await page.getByLabel("Active chart panel").selectOption("chart-1");
  await expect(page.locator('[data-multi-timeframe-indicator]')).toContainText("EMA");

  await page.getByRole("button", { name: "Comparison mode", exact: true }).click();
  await expect(page.locator('select[aria-label="Higher-timeframe indicator"]')).toBeDisabled();
  await page.getByRole("button", { name: "Comparison mode", exact: true }).click();
  await expect(page.locator('select[aria-label="Higher-timeframe indicator"]')).toBeEnabled();
  expect(errors).toEqual([]);
});
