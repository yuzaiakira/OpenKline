import { expect, test } from "@playwright/test";

test("Studio paper trading is visibly simulated, fills causally, and stays chart-scoped", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Paper Trading" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Simulated trading only" })).toHaveText("SIMULATED · NO REAL MONEY");
  await expect(page.getByText("No broker, exchange, or live order is connected.")).toBeVisible();
  await page.getByLabel("Paper order quantity").fill("0.1");
  await page.getByRole("button", { name: "Submit simulated buy", exact: true }).click();
  await expect(page.getByText("pending", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Advance simulated quote", exact: true }).click();
  await expect(page.getByText("filled", { exact: true })).toBeVisible();
  await expect(page.getByText("Position audit").locator("..")?.getByText(/BTC-USD/)).toBeVisible();
  await page.getByRole("button", { name: "Save account locally", exact: true }).click();
  await page.getByLabel("Paper order side").selectOption("sell");
  await page.getByRole("button", { name: "Submit simulated sell", exact: true }).click();
  await page.getByRole("button", { name: "Advance simulated quote", exact: true }).click();
  await expect(page.getByText("Flat", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Restore account locally", exact: true }).click();
  await expect(page.getByText(/0\.1 BTC-USD @/)).toBeVisible();
  await page.getByLabel("Paper order side").selectOption("buy");
  await page.getByRole("button", { name: "Risk halt", exact: true }).click();
  await expect(page.getByRole("button", { name: "Order entry halted", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Resume order entry", exact: true }).click();
  await expect(page.getByRole("button", { name: "Submit simulated buy", exact: true })).toBeEnabled();

  await page.getByLabel("Chart layout").selectOption("two-horizontal");
  await page.getByLabel("Active chart panel").selectOption("chart-2");
  const paperPanel = page.getByRole("region", { name: "Paper trading for BTC-USD" });
  await expect(paperPanel.getByRole("heading", { name: "Paper Trading" })).toBeVisible();
  await expect(paperPanel.getByText("chart-2 · BTC-USD · 1h", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
