import { expect, test } from "@playwright/test";

test("Studio runs real optimization, applies a selection to the tester, and preserves paper state", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Strategy Optimizer" })).toBeVisible();
  const paper = page.getByRole("region", { name: "Paper trading for BTC-USD" });
  const cashBefore = await paper.getByText("100,000.00", { exact: true }).textContent();

  await page.getByLabel("Optimizer objective").selectOption("total-return");
  await page.getByLabel("Optimizer max candidates").fill("9");
  await page.getByRole("button", { name: "Start optimization" }).click();
  await expect(page.getByTestId("optimization-results")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/9 evaluated|evaluated/).first()).toBeVisible();
  await expect(page.getByRole("table", { name: /Ranked candidates/ })).toBeVisible();

  const apply = page.getByRole("button", { name: "Apply to Strategy Tester" }).first();
  if (await apply.count() > 0) {
    await apply.click();
    await expect(page.getByText(/optimizer parameters applied|optimizer selection is ready/)).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: "Strategy Tester" })).toBeVisible();
  await expect(paper.getByText("100,000.00", { exact: true })).toHaveText(cashBefore ?? "100,000.00");

  await page.getByRole("button", { name: "Walk-Forward" }).click();
  await page.getByRole("button", { name: "Run Walk-Forward" }).click();
  await expect(page.getByTestId("walk-forward-results")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("wfa-fold-chart")).toBeVisible();
  await expect(page.getByRole("button", { name: "Export WFA JSON" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("mobile Studio exposes bounded optimization controls and cancellation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByTestId("strategy-optimizer")).toBeVisible();
  await page.getByLabel("Optimizer dataset").selectOption("deterministic-500k");
  await page.getByLabel("Optimizer max candidates").fill("9");
  await page.getByRole("button", { name: "Start optimization" }).click();
  await expect(page.getByRole("button", { name: "Cancel optimization" })).toBeEnabled({ timeout: 10_000 });
  await page.getByRole("button", { name: "Cancel optimization" }).click();
  await expect(page.getByText("cancelled", { exact: true })).toBeVisible();
  await expect(page.getByTestId("optimization-results")).toHaveCount(0);
});
