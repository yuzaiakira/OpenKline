import { expect, test } from "@playwright/test";

test("Studio exposes deterministic order-flow controls and preserves canonical settings", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");

  const panel = page.getByRole("region", { name: "Order Flow and Market Depth" });
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("data-order-flow-trade-count", "192");
  // The default display intentionally keeps source coverage unknown until a
  // provider declares completeness; unknown/estimated prints are never
  // silently promoted to a complete side classification.
  await expect(panel).toHaveAttribute("data-order-flow-coverage", "unknown-coverage");
  await expect(panel).toHaveAttribute("data-order-book-status", "live");
  await expect(panel.getByText("Illustrative offline fixtures only", { exact: false })).toBeVisible();
  await expect(panel.getByText("Time & Sales (8)", { exact: true })).toBeVisible();

  await panel.getByLabel("Enable Footprint").check();
  await panel.getByLabel("Enable CVD").check();
  await panel.getByLabel("CVD reset policy").selectOption("session");
  await panel.getByLabel("Enable Market Depth").check();
  await panel.getByLabel("Enable Liquidity Heatmap").check();
  await expect(panel.getByLabel("Enable Footprint")).toBeChecked();
  await expect(panel.getByLabel("Enable CVD")).toBeChecked();
  await expect(panel.getByLabel("CVD reset policy")).toHaveValue("session");
  await expect(panel.getByLabel("Enable Market Depth")).toBeChecked();
  await expect(panel.getByLabel("Enable Liquidity Heatmap")).toBeChecked();
  await expect(page.getByText("Session CVD uses the Studio's illustrative trading calendar", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Save", exact: true }).click();
  const persisted = await page.evaluate(() => JSON.parse(window.localStorage.getItem("openkline-studio-workspace-v1") ?? "null") as {
    orderFlow?: { footprint?: { visible?: boolean }; cvd?: { visible?: boolean; reset?: string }; depth?: { visible?: boolean; showHeatmap?: boolean } };
  });
  expect(persisted.orderFlow).toMatchObject({ footprint: { visible: true }, cvd: { visible: true, reset: "session" }, depth: { visible: true, showHeatmap: true } });
  expect(errors).toEqual([]);
});
