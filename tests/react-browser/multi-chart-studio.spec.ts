import { expect, test } from "@playwright/test";

test("multi-chart Studio preserves panel identity, isolated state, sync settings, watchlists, and named workspaces", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("[data-panel-id]")).toHaveCount(1);

  await page.getByLabel("Chart layout").selectOption("four-grid");
  await expect(page.locator("[data-panel-id]")).toHaveCount(4);
  await expect(page.locator("canvas")).toHaveCount(4);

  await page.getByLabel("Active chart panel").selectOption("chart-2");
  await page.getByLabel("Indicator").selectOption("EMA");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.locator('[data-panel-id="chart-2"]').getByText("3 indicators", { exact: true })).toBeVisible();
  await expect(page.locator('[data-panel-id="chart-1"]').getByText("2 indicators", { exact: true })).toBeVisible();

  await page.getByLabel("Sync symbols").check();
  await page.getByLabel("Active symbol").selectOption("AAPL");
  await expect(page.locator('[data-panel-id="chart-1"]').getByText(/AAPL/)).toBeVisible();
  await expect(page.locator('[data-panel-id="chart-4"]').getByText(/AAPL/)).toBeVisible();
  await page.getByLabel("Sync crosshair").check();
  await page.getByLabel("Sync visible range").check();
  await expect(page.getByLabel("Sync crosshair")).toBeChecked();
  await expect(page.getByLabel("Sync visible range")).toBeChecked();

  await page.getByRole("button", { name: "Favorite ETH-USD", exact: true }).click();
  await expect(page.getByRole("button", { name: "Unfavorite ETH-USD", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Move ETH-USD up", exact: true }).click();
  await expect(page.getByRole("button", { name: "Move BTC-USD down", exact: true })).toBeVisible();

  await page.getByLabel("Workspace name").fill("Four Panel Verification");
  await page.getByRole("button", { name: "Save As", exact: true }).click();
  await expect(page.getByText(/saved locally/)).toBeVisible();
  const savedWorkspaceId = await page.getByLabel("Workspace", { exact: true }).inputValue();
  const saved = await page.evaluate(() => JSON.parse(window.localStorage.getItem("openkline-studio-workspaces-v1") ?? "null") as { workspaces: Array<{ name: string; layout: string; charts: Array<{ workspace: { indicators: unknown[] } }> }> });
  const savedDocument = saved.workspaces.find((workspace) => workspace.name === "Four Panel Verification");
  expect(savedDocument).toMatchObject({ layout: "four-grid", charts: expect.any(Array) });
  expect(savedDocument?.charts).toHaveLength(4);
  expect(savedDocument?.charts[1]?.workspace.indicators).toHaveLength(3);

  await page.getByRole("button", { name: "New", exact: true }).first().click();
  await expect(page.locator("[data-panel-id]")).toHaveCount(1);
  await page.getByLabel("Workspace", { exact: true }).selectOption(savedWorkspaceId);
  await expect(page.locator("[data-panel-id]")).toHaveCount(4);
  await expect(page.locator('[data-panel-id="chart-2"]').getByText("3 indicators", { exact: true })).toBeVisible();

  await page.getByLabel("Active chart panel").selectOption("chart-4");
  await page.getByRole("button", { name: "Remove chart", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Remove chart-4" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.locator("[data-panel-id]")).toHaveCount(3);
  expect(errors).toEqual([]);
});

test("mobile multi-chart Studio switches the visible panel through the accessible selector", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("Chart layout").selectOption("four-grid");
  await expect(page.locator("[data-panel-id]")).toHaveCount(4);
  await expect(page.locator('[data-panel-id="chart-1"]')).toBeVisible();
  await expect(page.locator('[data-panel-id="chart-2"]')).toBeHidden();
  const thirdPanelId = await page.locator("[data-panel-id]").nth(2).getAttribute("data-panel-id");
  expect(thirdPanelId).not.toBeNull();
  if (thirdPanelId === null) return;
  await page.getByLabel("Active chart panel").selectOption(thirdPanelId);
  await expect(page.locator(`[data-panel-id="${thirdPanelId}"]`)).toBeVisible();
  await expect(page.locator('[data-panel-id="chart-1"]')).toBeHidden();
  await expect(page.getByRole("button", { name: "Fit", exact: true })).toBeVisible();
});

test("Studio management actions use accessible dialogs instead of browser blocking prompts", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Rename watchlist", exact: true }).click();
  const renameDialog = page.getByRole("dialog", { name: "Rename watchlist" });
  await expect(renameDialog).toBeVisible();
  await renameDialog.getByLabel("Dialog value").fill("Analysis symbols");
  await renameDialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByLabel("Watchlist", { exact: true })).toHaveValue("watchlist-favorites");
  await expect(page.getByLabel("Watchlist", { exact: true })).toContainText("Analysis symbols");

  await page.getByRole("button", { name: "Delete watchlist", exact: true }).click();
  await expect(page.getByRole("dialog", { name: /Delete watchlist/ })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByLabel("Watchlist", { exact: true })).toContainText("Analysis symbols");

  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("dialog", { name: /Delete workspace/ })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
});

test("Studio snaps drawing anchors to visible candle timestamps and preserves raw anchors across scale changes", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Snap drawings to visible OHLC").check();
  const canvas = page.locator("canvas");
  await page.getByRole("button", { name: "Ray", exact: true }).click();
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.25);
  await page.mouse.click(box.x + box.width * 0.72, box.y + box.height * 0.45);
  await expect(page.getByText("Drawings (1)", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const before = await page.evaluate(() => (JSON.parse(window.localStorage.getItem("openkline-studio-workspace-v1") ?? "null") as { drawings: { drawings: Array<{ points: Array<{ time: number; price: number }> }> } }).drawings.drawings[0]?.points);
  expect(before).toHaveLength(2);
  const start = Date.UTC(2026, 0, 1) - 239 * 60 * 60 * 1_000;
  expect(before?.every((point) => (point.time - start) % (60 * 60 * 1_000) === 0)).toBe(true);
  await page.getByLabel("Price scale").selectOption("logarithmic");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const after = await page.evaluate(() => (JSON.parse(window.localStorage.getItem("openkline-studio-workspace-v1") ?? "null") as { drawings: { drawings: Array<{ points: Array<{ time: number; price: number }> }> } }).drawings.drawings[0]?.points);
  expect(after).toEqual(before);
});
