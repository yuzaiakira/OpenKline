import { expect, test } from "./studio-test.js";

test("Studio screener runs a real watchlist scan, filters results, and starts deterministic watch mode", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Market Screener" })).toBeVisible();
  await page.getByRole("button", { name: "Run scan", exact: true }).click();
  await expect(page.getByText("completed", { exact: true })).toBeVisible();
  const resultRows = page.locator("table").filter({ hasText: "Screening results. Developing bars are not eligible." }).locator("tbody tr");
  await expect(resultRows).toHaveCount(3);
  await page.getByLabel("Screener match filter").selectOption("matched");
  await expect(resultRows).toHaveCount(3);
  await page.getByLabel("Screener rule").selectOption("SMA");
  await page.getByLabel("Screener indicator threshold").fill("0");
  await page.getByRole("button", { name: "Run scan", exact: true }).click();
  await expect(page.getByText("completed", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save preset", exact: true }).click();
  await expect(page.getByText(/preset “Demo screener” saved/)).toBeVisible();
  await page.getByRole("button", { name: "Watch", exact: true }).click();
  await expect(page.getByText(/watching/)).toBeVisible();
  await page.getByRole("button", { name: "Step demo", exact: true }).click();
  await page.getByRole("button", { name: "Open chart", exact: true }).first().click();
  await expect(page.locator("p").filter({ hasText: /BTC-USD|ETH-USD|AAPL/ }).last()).toBeVisible();
  expect(errors).toEqual([]);
});

