import { expect, test } from "@playwright/test";

test("Next.js client Widget integration mounts under Strict Mode and cleans up", async ({ page }) => {
  await page.goto("/widget-integration");
  await expect(page.getByRole("heading", { name: "Internal Widget — Next.js client integration" })).toBeVisible();
  await expect(page.locator("[data-openkline-widget-ready]")).toHaveText("ready", { timeout: 20_000 });
  await expect(page.locator("[data-openkline-widget-host] canvas").first()).toBeVisible();
  await expect(page.locator("[data-openkline-widget-events]")).toContainText("ready");

  await page.getByRole("button", { name: "Remount" }).click();
  await expect(page.locator("[data-openkline-widget-ready]")).toHaveText("ready", { timeout: 20_000 });

  await page.getByRole("button", { name: "Unmount" }).click();
  await expect(page.locator("[data-openkline-widget-unmounted]")).toBeVisible();
  await expect(page.locator("[data-openkline-widget-host]")).toHaveCount(0);

  await page.getByRole("button", { name: "Mount", exact: true }).click();
  await expect(page.locator("[data-openkline-widget-ready]")).toHaveText("ready", { timeout: 20_000 });
});
