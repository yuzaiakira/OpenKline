import { expect, test } from "./studio-test.js";

test("Studio runs a deterministic multi-instrument portfolio backtest and persists its bounded configuration", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");

  const panel = page.getByRole("region", { name: "Portfolio Backtesting" });
  await expect(panel).toBeVisible();
  await expect(panel.locator('input[aria-label="Portfolio instrument BTC-USD"]')).toBeChecked();
  await expect(panel.locator('input[aria-label="Portfolio instrument ETH-USD"]')).toBeChecked();
  await panel.locator('input[aria-label="Portfolio instrument AAPL"]').uncheck();
  await panel.locator('input[aria-label="Portfolio instrument AAPL"]').check();
  await panel.getByLabel("Portfolio strategy BTC-USD").selectOption("EMA_TREND");
  await panel.getByLabel("Portfolio initial capital").fill("120000");
  await panel.getByLabel("Portfolio max gross exposure").fill("5000");
  await panel.getByLabel("Portfolio max active positions").fill("1");
  await panel.getByRole("button", { name: "Run portfolio backtest", exact: true }).click();

  await expect(panel).toHaveAttribute("data-portfolio-status", "completed", { timeout: 15_000 });
  await expect(panel.locator("[data-portfolio-metrics]")).toBeVisible();
  await expect(panel.getByText(/Final account:/)).toBeVisible();
  expect(await panel.getAttribute("data-portfolio-accepted-orders")).toBe("11");
  expect(await panel.getAttribute("data-portfolio-rejected-orders")).toBe("21");
  expect(await panel.getAttribute("data-portfolio-final-equity")).toBe("120632.79353620987");
  await expect(panel.locator('[data-portfolio-equity-curve]')).toBeVisible();
  await panel.getByRole("tab", { name: /Orders/ }).click();
  await expect(panel.getByText("Deterministic order ledger")).toBeVisible();
  await panel.getByRole("button", { name: "Export JSON", exact: true }).click();

  await page.getByRole("button", { name: "Enter replay", exact: true }).click();
  await expect(page.getByText("Replay: ready", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Replay next bar", exact: true }).click();
  await expect(page.getByText("Replay: paused", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Exit replay", exact: true }).click();
  await expect(page.getByText("Replay: idle", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => page.evaluate(() => {
    const raw = window.localStorage.getItem("openkline-studio-workspaces-v1");
    if (raw === null) return null;
    const stored = JSON.parse(raw) as { workspaces?: Array<{ portfolioBacktest?: { initialCapital?: number } }> };
    return stored.workspaces?.[0]?.portfolioBacktest?.initialCapital ?? null;
  })).toBe(120000);

  await page.reload();
  const restoredPanel = page.getByRole("region", { name: "Portfolio Backtesting" });
  await expect(restoredPanel.getByLabel("Portfolio initial capital")).toHaveValue("120000");
  expect(errors).toEqual([]);
});
