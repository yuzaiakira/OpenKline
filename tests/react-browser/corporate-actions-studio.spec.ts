import { expect, test } from "./studio-test.js";

test("Studio exposes replay-safe corporate-action views and persists only the canonical source reference", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");

  const panel = page.getByRole("region", { name: "Corporate Actions & Total Return" });
  await expect(panel).toHaveAttribute("data-corporate-actions-status", "ready", { timeout: 15_000 });
  await expect(panel).toContainText("2:1 stock split");
  await expect(panel).toContainText("1 USD cash dividend");
  await expect(panel).toHaveAttribute("data-corporate-actions-source", "openkline-studio-corporate-actions-illustration");
  await expect(panel.locator('[data-corporate-actions-portfolio="ready"]')).toBeVisible();

  await panel.getByLabel("Corporate action display mode").selectOption("split-adjusted");
  await expect(panel).toHaveAttribute("data-corporate-actions-mode", "split-adjusted");
  await panel.getByLabel("Show corporate-action markers").uncheck();
  await expect(panel.getByLabel("Show corporate-action markers")).not.toBeChecked();
  await panel.getByLabel("Corporate action display mode").selectOption("total-return");
  await expect(panel).toHaveAttribute("data-corporate-actions-mode", "total-return");
  await expect(panel).toContainText("Index only");

  await page.getByRole("button", { name: "Enter replay", exact: true }).click();
  await expect(panel).toHaveAttribute("data-corporate-actions-replay", "active");
  await expect(panel.getByLabel("Corporate action display mode")).toBeDisabled();
  await expect(panel).toContainText("future events are masked");
  await page.getByRole("button", { name: "Exit replay", exact: true }).click();
  await expect(panel).toHaveAttribute("data-corporate-actions-replay", "idle");

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => page.evaluate(() => {
    const stored = JSON.parse(window.localStorage.getItem("openkline-studio-workspaces-v1") ?? "null") as { workspaces?: Array<{ charts?: Array<{ workspace?: { corporateActions?: Record<string, unknown> } }> }> };
    return stored.workspaces?.[0]?.charts?.[0]?.workspace?.corporateActions ?? null;
  })).toMatchObject({ mode: "total-return", sourceId: "openkline-studio-corporate-actions-illustration", sourceVersion: "1.0.0" });
  const persisted = await page.evaluate(() => {
    const stored = JSON.parse(window.localStorage.getItem("openkline-studio-workspaces-v1") ?? "null") as { workspaces?: Array<{ charts?: Array<{ workspace?: { corporateActions?: Record<string, unknown> } }> }> };
    return stored.workspaces?.[0]?.charts?.[0]?.workspace?.corporateActions ?? null;
  });
  expect(persisted).not.toHaveProperty("actions");
  expect(errors).toEqual([]);
});

