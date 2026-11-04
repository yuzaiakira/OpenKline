import { expect, placeVisibleChartPoint, studioChartCanvas, test, type Locator } from "./studio-test.js";

async function expectHitTestTarget(locator: Locator): Promise<void> {
  await locator.scrollIntoViewIfNeeded();
  const receivesPointer = await locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return hit === element || (hit !== null && element.contains(hit));
  });
  expect(receivesPointer).toBe(true);
}

test("multi-chart Studio preserves panel identity, isolated state, sync settings, watchlists, and named workspaces", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("[data-panel-id]")).toHaveCount(1);

  await test.step("configure four-grid layout", async () => {
    await page.getByLabel("Chart layout").selectOption("four-grid");
    await expect(page.locator("[data-panel-id]")).toHaveCount(4);
    await expect(studioChartCanvas(page)).toHaveCount(4);
  });

  await page.getByLabel("Active chart panel").selectOption("chart-2");
  await page.getByLabel("Indicator", { exact: true }).selectOption("EMA");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.locator('[data-panel-id="chart-2"]').getByText("3 indicators", { exact: true })).toBeVisible();
  if (await page.evaluate(() => window.matchMedia("(max-width: 720px)").matches)) {
    await expect(page.locator('[data-panel-id="chart-1"]').getByText("2 indicators", { exact: true })).toBeHidden();
    await page.getByLabel("Active chart panel").selectOption("chart-1");
    await expect(page.locator('[data-panel-id="chart-1"]').getByText("2 indicators", { exact: true })).toBeVisible();
    await page.getByLabel("Active chart panel").selectOption("chart-2");
  } else {
    await expect(page.locator('[data-panel-id="chart-1"]').getByText("2 indicators", { exact: true })).toBeVisible();
  }

  await test.step("verify synchronized symbols in visible panels", async () => {
    await page.getByLabel("Sync symbols").check();
    await page.getByLabel("Active symbol").selectOption("AAPL");
    if (await page.evaluate(() => window.matchMedia("(max-width: 720px)").matches)) {
      // Mobile intentionally renders only the active panel. Select each panel
      // before asserting its synchronized state instead of requiring hidden
      // panels to remain visible.
      for (const panelId of ["chart-1", "chart-4"]) {
        await page.getByLabel("Active chart panel").selectOption(panelId);
        await expect(page.locator(`[data-panel-id="${panelId}"]`).getByText(/AAPL/)).toBeVisible();
      }
      await page.getByLabel("Active chart panel").selectOption("chart-2");
    } else {
      await expect(page.locator('[data-panel-id="chart-1"]').getByText(/AAPL/)).toBeVisible();
      await expect(page.locator('[data-panel-id="chart-4"]').getByText(/AAPL/)).toBeVisible();
    }
  });
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
  await test.step("restore and inspect panel visibility", async () => {
    await expect(page.locator("[data-panel-id]")).toHaveCount(4);
    await page.waitForLoadState("domcontentloaded");
    const chartTwoIndicators = page.locator('[data-panel-id="chart-2"]').getByText("3 indicators", { exact: true });
    if (await page.evaluate(() => window.matchMedia("(max-width: 720px)").matches)) {
      // Workspace restoration intentionally selects chart-1. Verify chart-2's
      // persisted state after selecting its visible panel instead of treating
      // the mobile-hidden panel as a failed restoration.
      await expect(chartTwoIndicators).toBeHidden();
      await page.getByLabel("Active chart panel").selectOption("chart-2");
      await expect(chartTwoIndicators).toBeVisible();
      await page.getByLabel("Active chart panel").selectOption("chart-1");
      await expect(page.locator('[data-panel-id="chart-1"]').getByText("2 indicators", { exact: true })).toBeVisible();
      await page.getByLabel("Active chart panel").selectOption("chart-2");
    } else {
      await expect(chartTwoIndicators).toBeVisible();
    }
  });

  await page.getByLabel("Active chart panel").selectOption("chart-4");
  await page.getByRole("button", { name: "Remove chart", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Remove chart-4" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.locator("[data-panel-id]")).toHaveCount(3);
  expect(errors).toEqual([]);
});

test("Studio synchronizes crosshair and visible UTC ranges across different timeframes", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Chart layout").selectOption("two-horizontal");
  await page.getByLabel("Active chart panel").selectOption("chart-2");
  await page.getByLabel("Active timeframe").selectOption("4h");
  await page.getByLabel("Active chart panel").selectOption("chart-1");
  await page.getByLabel("Sync crosshair").check();
  await page.getByLabel("Sync visible range").check();

  const firstCanvas = page.locator('[data-panel-id="chart-1"] canvas');
  const secondPanel = page.locator('[data-panel-id="chart-2"]');
  await firstCanvas.scrollIntoViewIfNeeded();
  const firstBox = await firstCanvas.boundingBox();
  expect(firstBox).not.toBeNull();
  if (firstBox === null) return;

  const initialRange = await secondPanel.getAttribute("data-visible-time-range");
  await page.mouse.move(firstBox.x + firstBox.width * 0.72, firstBox.y + firstBox.height * 0.3);
  await expect.poll(() => page.locator('[data-panel-id="chart-1"]').getAttribute("data-crosshair-time")).not.toBe("");
  await expect.poll(() => secondPanel.getAttribute("data-crosshair-time")).not.toBe("");
  const linkedCrosshair = await secondPanel.getAttribute("data-crosshair-time");
  expect(Number(linkedCrosshair)).toBeGreaterThan(0);

  await page.mouse.wheel(0, -400);
  await expect.poll(() => secondPanel.getAttribute("data-visible-time-range")).not.toBe(initialRange);
  const linkedRange = await secondPanel.getAttribute("data-visible-time-range");
  expect(linkedRange).not.toBe("empty");

  await page.getByLabel("Sync crosshair").uncheck();
  await page.getByLabel("Sync visible range").uncheck();
  const independentCrosshair = await secondPanel.getAttribute("data-crosshair-time");
  const independentRange = await secondPanel.getAttribute("data-visible-time-range");
  await page.mouse.move(firstBox.x + firstBox.width * 0.28, firstBox.y + firstBox.height * 0.3);
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(50);
  expect(await secondPanel.getAttribute("data-crosshair-time")).toBe(independentCrosshair);
  expect(await secondPanel.getAttribute("data-visible-time-range")).toBe(independentRange);

  await page.getByRole("button", { name: "Remove chart", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.locator("[data-panel-id]")).toHaveCount(1);
  await expect(studioChartCanvas(page)).toHaveCount(1);
});

test("Studio comparison mode preserves presentation state, normalizes assets, and persists settings", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");

  await expect(page.locator('[data-panel-id="chart-1"] canvas')).toBeVisible();
  await expect(page.locator('[data-panel-id="chart-1"]').getByText("2 indicators", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Line", exact: true }).click();
  await expect(page.getByRole("button", { name: "Line", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Comparison mode", exact: true }).click();
  await expect(page.getByText("Normalized display values; raw market prices remain unchanged.")).toBeVisible();
  await expect(page.locator('[data-comparison-feed-status="ready"]')).toBeVisible();
  await expect(page.getByRole("list", { name: "Comparison legend" })).toContainText("BTC-USD");
  await expect(page.getByRole("list", { name: "Comparison legend" })).toContainText("ETH-USD");

  await page.getByLabel("Comparison normalization").selectOption("percentage");
  await page.getByLabel("Compare AAPL").check();
  await expect(page.getByRole("list", { name: "Comparison legend" })).toContainText("AAPL");
  await expect(page.getByText(/No future bar is used/)).toBeVisible();

  const comparisonStatus = page.locator('[data-comparison-feed-status="ready"]');
  await page.getByRole("button", { name: "Simulate realtime correction", exact: true }).click();
  await expect(page.getByText(/Simulated a deterministic realtime correction/)).toBeVisible();
  await page.getByRole("button", { name: "Simulate missing history", exact: true }).click();
  await expect(page.getByText(/Simulated a missing BTC-USD observation/)).toBeVisible();
  await expect(comparisonStatus).toContainText("coverage incomplete");
  await page.getByRole("button", { name: "Recover missing history", exact: true }).click();
  await expect(page.getByText("Comparison history recovery completed.", { exact: true })).toBeVisible();
  await expect(comparisonStatus).toContainText("coverage complete");

  await page.getByRole("button", { name: "Enter replay", exact: true }).click();
  await expect(page.getByRole("button", { name: "Exit replay", exact: true })).toBeEnabled();
  const replayCutoff = Number(await comparisonStatus.getAttribute("data-comparison-replay-cutoff"));
  const replayLatest = Number(await comparisonStatus.getAttribute("data-comparison-visible-latest"));
  expect(Number.isFinite(replayCutoff)).toBe(true);
  expect(Number.isFinite(replayLatest)).toBe(true);
  expect(replayLatest).toBeLessThanOrEqual(replayCutoff);
  await page.getByRole("button", { name: "Replay previous bar", exact: true }).click();
  await page.getByRole("button", { name: "Replay next bar", exact: true }).click();
  await page.getByRole("button", { name: "Exit replay", exact: true }).click();
  await expect(page.getByRole("button", { name: "Enter replay", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Line", exact: true }).click();
  await expect(page.getByRole("button", { name: "Line", exact: true })).toHaveAttribute("aria-pressed", "true");

  await page.getByLabel("Workspace name").fill("Comparison Verification");
  await page.getByRole("button", { name: "Save As", exact: true }).click();
  const saved = await page.evaluate(() => JSON.parse(window.localStorage.getItem("openkline-studio-workspaces-v1") ?? "null") as { workspaces: Array<{ name: string; comparison?: { active: boolean; mode: string; assetIds: string[] } }> });
  expect(saved.workspaces.find((workspace) => workspace.name === "Comparison Verification")).toMatchObject({ comparison: { active: true, mode: "percentage", assetIds: ["BTC-USD", "ETH-USD", "AAPL"] } });

  await page.getByRole("button", { name: "Comparison mode", exact: true }).click();
  await expect(page.getByRole("button", { name: "Line", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});

test("Studio comparison follows deterministic realtime, recovers missed bars, and remains replay-safe", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Comparison mode", exact: true }).click();
  const status = page.locator('[data-comparison-feed-status="ready"]');
  await expect(status).toBeVisible();
  const initialLatest = Number(await status.getAttribute("data-comparison-visible-latest"));
  expect(Number.isFinite(initialLatest)).toBe(true);

  await page.getByRole("button", { name: "Advance demo stream", exact: true }).click();
  await expect.poll(async () => Number(await status.getAttribute("data-comparison-visible-latest"))).toBeGreaterThan(initialLatest);
  const connectedLatest = Number(await status.getAttribute("data-comparison-visible-latest"));

  await page.getByRole("button", { name: "Simulate disconnect", exact: true }).click();
  await expect(status).toContainText("disconnected");
  await page.getByRole("button", { name: "Advance demo stream", exact: true }).click();
  await page.getByRole("button", { name: "Advance demo stream", exact: true }).click();
  expect(Number(await status.getAttribute("data-comparison-visible-latest"))).toBe(connectedLatest);

  await page.getByRole("button", { name: "Reconnect and recover", exact: true }).click();
  await expect.poll(async () => Number(await status.getAttribute("data-comparison-visible-latest"))).toBeGreaterThan(connectedLatest);
  await expect(status).toContainText("recovery complete");
  const recoveredLatest = Number(await status.getAttribute("data-comparison-visible-latest"));

  await page.getByRole("button", { name: "Enter replay", exact: true }).click();
  await expect(page.getByRole("button", { name: "Exit replay", exact: true })).toBeEnabled();
  const replayCutoff = Number(await status.getAttribute("data-comparison-replay-cutoff"));
  const replayLatest = Number(await status.getAttribute("data-comparison-visible-latest"));
  expect(Number.isFinite(replayCutoff)).toBe(true);
  expect(replayLatest).toBeLessThanOrEqual(replayCutoff);
  await page.getByRole("button", { name: "Replay previous bar", exact: true }).click();
  await page.getByRole("button", { name: "Replay next bar", exact: true }).click();
  await page.getByRole("button", { name: "Exit replay", exact: true }).click();
  await expect.poll(async () => Number(await status.getAttribute("data-comparison-visible-latest"))).toBeGreaterThanOrEqual(recoveredLatest);

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Comparison mode", exact: true })).toHaveText("Exit comparison");
  await page.getByRole("button", { name: "Comparison mode", exact: true }).click();
  await expect(page.getByRole("button", { name: "Comparison mode", exact: true })).toHaveText("Compare assets");
  expect(errors).toEqual([]);
});

test("Studio reload restores canonical presentation after saving while comparison is active", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.locator('[data-panel-id="chart-1"] canvas')).toBeVisible();
  await expect(page.locator('[data-panel-id="chart-1"]').getByText("2 indicators", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Line", exact: true }).click();
  await page.getByLabel("Price scale").selectOption("logarithmic");
  await expect(page.getByRole("button", { name: "Line", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Price scale")).toHaveValue("logarithmic");

  await page.getByRole("button", { name: "Comparison mode", exact: true }).click();
  await page.getByLabel("Comparison normalization").selectOption("percentage");
  await page.getByLabel("Compare AAPL").check();
  await expect(page.locator('[data-comparison-feed-status="ready"]')).toBeVisible();
  await page.getByLabel("Workspace name").fill("Comparison Reload Verification");
  await page.getByRole("button", { name: "Save As", exact: true }).click();

  const savedWhileActive = await page.evaluate(() => JSON.parse(window.localStorage.getItem("openkline-studio-workspaces-v1") ?? "null") as {
    workspaces: Array<{ name: string; charts: Array<{ workspace: { chart: { priceScale?: { mode?: string }; }; series: Array<{ id: string; style: { visible?: boolean }; data: Array<Record<string, unknown>> }>; indicators: unknown[]; } }>; comparison?: { active: boolean; mode: string; assetIds: string[] } }>;
  });
  const activeDocument = savedWhileActive.workspaces.find((workspace) => workspace.name === "Comparison Reload Verification");
  expect(activeDocument).toMatchObject({ comparison: { active: true, mode: "percentage", assetIds: ["BTC-USD", "ETH-USD", "AAPL"] } });
  expect(activeDocument?.charts[0]?.workspace.series.some((series) => series.id.startsWith("comparison-"))).toBe(false);
  expect(activeDocument?.charts[0]?.workspace.series.find((series) => series.id === "studio-line")).toMatchObject({ style: { visible: true } });
  expect(activeDocument?.charts[0]?.workspace.chart.priceScale?.mode).toBe("logarithmic");
  expect(activeDocument?.charts[0]?.workspace.series).toHaveLength(8);
  expect(activeDocument?.charts[0]?.workspace.series.find((series) => series.id === "studio-price")?.data).toHaveLength(240);
  expect(activeDocument?.charts[0]?.workspace.series.find((series) => series.id === "studio-price")?.data[0]).toMatchObject({ open: expect.any(Number), high: expect.any(Number), low: expect.any(Number), close: expect.any(Number) });
  expect(activeDocument?.charts[0]?.workspace.indicators).toHaveLength(2);

  await page.reload();
  await expect(page.getByRole("button", { name: "Comparison mode", exact: true })).toHaveText("Exit comparison");
  await expect(page.getByLabel("Comparison normalization")).toHaveValue("percentage");
  await expect(page.getByLabel("Compare AAPL")).toBeChecked();
  await expect(page.getByLabel("Price scale")).toHaveValue("logarithmic");
  await page.getByRole("button", { name: "Comparison mode", exact: true }).click();
  await expect(page.getByRole("button", { name: "Line", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Price scale")).toHaveValue("logarithmic");
  await expect(page.locator('[data-panel-id="chart-1"]').getByText("2 indicators", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Save", exact: true }).click();
  const savedAfterExit = await page.evaluate(() => JSON.parse(window.localStorage.getItem("openkline-studio-workspaces-v1") ?? "null") as {
    workspaces: Array<{ name: string; charts: Array<{ workspace: { series: Array<{ id: string; style: { visible?: boolean } }>; chart: { priceScale?: { mode?: string } } } }> }>;
  });
  const restoredDocument = savedAfterExit.workspaces.find((workspace) => workspace.name === "Comparison Reload Verification");
  expect(restoredDocument?.charts[0]?.workspace.series.some((series) => series.id.startsWith("comparison-"))).toBe(false);
  expect(restoredDocument?.charts[0]?.workspace.series.find((series) => series.id === "studio-line")).toMatchObject({ style: { visible: true } });
  expect(restoredDocument?.charts[0]?.workspace.chart.priceScale?.mode).toBe("logarithmic");
  expect(errors).toEqual([]);
});

test("Studio volume analytics remain causal, persistent, isolated, and comparison-safe", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  const analytics = page.locator('details[aria-label="Volume Analytics"]');
  const anchoredVwap = page.getByLabel("Enable Anchored VWAP");
  const volumeProfile = page.getByLabel("Enable Estimated Volume Profile");
  const profileResult = page.getByLabel("Volume Profile result");
  const readProfile = async (): Promise<{ status: string; eligible: number; poc: number; vah: number; val: number }> => page.evaluate(() => {
    const output = document.querySelector<HTMLOutputElement>('[aria-label="Volume Profile result"]');
    if (output === null) throw new Error("Volume Profile result is missing");
    return {
      status: output.dataset.volumeProfileStatus ?? "",
      eligible: Number(output.dataset.volumeProfileEligibleCandles ?? "NaN"),
      poc: Number(output.dataset.volumeProfilePoc ?? "NaN"),
      vah: Number(output.dataset.volumeProfileVah ?? "NaN"),
      val: Number(output.dataset.volumeProfileVal ?? "NaN"),
    };
  });

  await expect(analytics).toBeVisible();
  await anchoredVwap.check();
  await expect(anchoredVwap).toBeChecked();
  const initialAnchor = await page.getByLabel("Anchored VWAP anchor UTC").inputValue();
  await page.getByLabel("Anchored VWAP price source").selectOption("close");
  await page.getByLabel("Anchored VWAP anchor UTC").fill("2025-12-30T00:00");
  await page.getByRole("button", { name: "Select candle anchor", exact: true }).click();
  await placeVisibleChartPoint(page, 0.62, 0.42);
  await expect.poll(() => page.getByLabel("Anchored VWAP anchor UTC").inputValue()).not.toBe(initialAnchor);

  await volumeProfile.check();
  await expect(volumeProfile).toBeChecked();
  await expect(profileResult).toHaveAttribute("data-volume-profile-status", "ready");
  await page.getByLabel("Volume Profile mode").selectOption("fixed");
  await page.getByLabel("Volume Profile allocation").selectOption("range-uniform");
  await page.getByLabel("Volume Profile bins").fill("32");
  await page.getByLabel("Volume Profile value area").fill("0.75");
  await expect(page.getByLabel("Volume Profile range from UTC")).toBeVisible();
  await expect.poll(async () => (await readProfile()).status).toBe("ready");
  const fullProfile = await readProfile();
  expect(fullProfile.eligible).toBe(240);
  expect(Number.isFinite(fullProfile.poc)).toBe(true);
  expect(Number.isFinite(fullProfile.vah)).toBe(true);
  expect(Number.isFinite(fullProfile.val)).toBe(true);
  expect(fullProfile.val).toBeLessThanOrEqual(fullProfile.poc);
  expect(fullProfile.poc).toBeLessThanOrEqual(fullProfile.vah);

  const canvas = page.locator('[data-panel-id="chart-1"] canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box !== null) await page.mouse.wheel(0, -240);
  await expect(profileResult).toHaveAttribute("data-volume-profile-status", "ready");
  await page.getByLabel("Price scale").selectOption("logarithmic");
  await expect(page.getByLabel("Price scale")).toHaveValue("logarithmic");

  await page.getByRole("button", { name: "Enter replay", exact: true }).click();
  await expect(page.getByRole("button", { name: "Exit replay", exact: true })).toBeEnabled();
  await expect(anchoredVwap).toBeDisabled();
  await expect(volumeProfile).toBeDisabled();
  await expect.poll(async () => (await readProfile()).status).toBe("ready");
  const replayProfile = await readProfile();
  expect(replayProfile.eligible).toBeLessThan(fullProfile.eligible);
  expect(replayProfile.eligible).toBeGreaterThan(0);
  expect(Number.isFinite(replayProfile.poc)).toBe(true);
  expect(replayProfile.val).toBeLessThanOrEqual(replayProfile.poc);
  expect(replayProfile.poc).toBeLessThanOrEqual(replayProfile.vah);
  await page.getByRole("button", { name: "Replay previous bar", exact: true }).click();
  await expect.poll(async () => (await readProfile()).eligible).toBe(replayProfile.eligible - 1);
  await page.getByRole("button", { name: "Replay next bar", exact: true }).click();
  await expect.poll(async () => (await readProfile()).eligible).toBe(replayProfile.eligible);
  await page.getByRole("button", { name: "Exit replay", exact: true }).click();
  await expect(anchoredVwap).toBeEnabled();
  await expect(volumeProfile).toBeEnabled();
  await expect.poll(async () => (await readProfile()).eligible).toBe(fullProfile.eligible);

  await page.getByLabel("Workspace name", { exact: true }).fill("Volume Analytics Verification");
  await page.getByRole("button", { name: "Save As", exact: true }).click();
  await expect(page.getByText("Workspace “Volume Analytics Verification” saved locally.", { exact: true })).toBeVisible();
  const savedDocument = await page.evaluate(() => {
    const stored = JSON.parse(window.localStorage.getItem("openkline-studio-workspaces-v1") ?? "null") as { workspaces?: Array<{ name: string; charts: Array<{ workspace: { indicators: Array<{ indicatorId: string }>; volumeAnalytics?: { volumeProfiles: Array<{ mode: string; allocation: string; binCount: number; valueAreaPercentage: number }> } } }> }> } | null;
    return stored?.workspaces?.find((workspace) => workspace.name === "Volume Analytics Verification") ?? null;
  });
  expect(savedDocument?.charts[0]?.workspace.indicators.some((indicator) => indicator.indicatorId === "ANCHORED_VWAP")).toBe(true);
  expect(savedDocument?.charts[0]?.workspace.volumeAnalytics?.volumeProfiles[0]).toMatchObject({ mode: "fixed", allocation: "range-uniform", binCount: 32, valueAreaPercentage: 0.75 });

  await page.reload();
  await expect(anchoredVwap).toBeChecked();
  await expect(volumeProfile).toBeChecked();
  await expect(profileResult).toHaveAttribute("data-volume-profile-status", "ready");
  await page.getByLabel("Chart layout").selectOption("two-horizontal");
  await expect(page.locator("[data-panel-id]")).toHaveCount(2);
  await page.getByLabel("Active chart panel").selectOption("chart-2");
  await expect(page.getByLabel("Enable Anchored VWAP")).not.toBeChecked();
  await expect(page.getByLabel("Enable Estimated Volume Profile")).not.toBeChecked();
  await page.getByLabel("Active chart panel").selectOption("chart-1");
  await expect(page.getByLabel("Enable Anchored VWAP")).toBeChecked();
  await expect(page.getByLabel("Enable Estimated Volume Profile")).toBeChecked();

  await page.getByRole("button", { name: "Comparison mode", exact: true }).click();
  await expect(page.getByText(/Raw-price volume analytics are temporarily hidden/)).toBeVisible();
  await expect(page.getByLabel("Enable Anchored VWAP")).toBeDisabled();
  await expect(page.getByLabel("Enable Estimated Volume Profile")).toBeDisabled();
  await page.getByRole("button", { name: "Comparison mode", exact: true }).click();
  await expect(page.getByLabel("Enable Anchored VWAP")).toBeEnabled();
  await expect(page.getByLabel("Enable Estimated Volume Profile")).toBeEnabled();
  await expect(page.getByLabel("Enable Anchored VWAP")).toBeChecked();
  await expect(page.getByLabel("Enable Estimated Volume Profile")).toBeChecked();
  expect(pageErrors).toEqual([]);
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

test("Studio top actions stay within representative viewport widths", async ({ page }) => {
  for (const width of [390, 412, 640, 800, 1280]) {
    await test.step(`check ${width}px layout`, async () => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await expect(page.locator("header").getByRole("button", { name: "New", exact: true })).toBeVisible();
      await expect(page.getByLabel("Workspace name", { exact: true })).toBeVisible();
      const layout = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        topActions: (() => {
          const header = document.querySelector("header");
          const element = header === null ? null : Array.from(header.querySelectorAll<HTMLElement>("div")).find((candidate) => candidate.querySelector('input[aria-label="Workspace name"]')) ?? null;
          if (element === null) return null;
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right, width: rect.width, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
        })(),
      }));
      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
      expect(layout.topActions).not.toBeNull();
      if (layout.topActions !== null) {
        expect(layout.topActions.left).toBeGreaterThanOrEqual(-1);
        expect(layout.topActions.right).toBeLessThanOrEqual(layout.clientWidth + 1);
        expect(layout.topActions.scrollWidth).toBeLessThanOrEqual(layout.topActions.clientWidth + 1);
      }
    });
  }
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
  await page.getByRole("button", { name: "Ray", exact: true }).click();
  await test.step("place drawing anchors with the active input modality", async () => {
    await placeVisibleChartPoint(page, 0.45, 0.24);
    await placeVisibleChartPoint(page, 0.72, 0.32);
  });
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

test("Studio runs a real chart-scoped backtest, exposes generated results, markers, exports, and isolation", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Strategy Tester" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run Backtest" })).toBeEnabled();

  const chartOneTester = page.getByRole("region", { name: "Strategy Tester for chart-1" });
  const runBacktest = page.getByRole("button", { name: "Run Backtest" });
  await expectHitTestTarget(runBacktest);
  await runBacktest.click();
  await expect(page.getByText("completed", { exact: true })).toBeVisible();
  await expect(chartOneTester.getByRole("button", { name: "Export JSON" })).toBeVisible();
  await expect(chartOneTester.getByRole("button", { name: "Export CSV" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Equity curve generated by the backtest" })).toBeVisible();
  await chartOneTester.getByRole("button", { name: "Hide markers" }).click();
  await expect(chartOneTester.getByRole("button", { name: "Show markers" })).toBeVisible();
  await chartOneTester.getByRole("tab", { name: "Trades" }).click();
  await expect(page.getByText(/Completed trade ledger|No completed trades were generated\./)).toBeVisible();

  await page.getByLabel("Chart layout").selectOption("two-horizontal");
  await page.getByLabel("Active chart panel").selectOption("chart-2");
  await expect(page.getByRole("button", { name: "Run Backtest" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Strategy Tester for chart-2" }).getByRole("button", { name: "Export JSON" })).toHaveCount(0);
  await page.getByLabel("Active chart panel").selectOption("chart-1");
  await expect(page.getByRole("region", { name: "Strategy Tester for chart-1" }).getByRole("button", { name: "Export JSON" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("mobile Studio keeps critical controls visible and hit-testable after responsive layout changes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await test.step("switch to four-grid and add an indicator", async () => {
    await page.getByLabel("Chart layout").selectOption("four-grid");
    await expect(page.locator("[data-panel-id]")).toHaveCount(4);
    await page.getByLabel("Active chart panel").selectOption("chart-2");
    const addIndicator = page.getByRole("button", { name: "Add", exact: true });
    await expectHitTestTarget(addIndicator);
    await addIndicator.click();
    await expect(page.getByLabel("Active chart panel")).toHaveValue("chart-2");
    await expect(page.getByText("Added SMA to chart-2.", { exact: true })).toBeVisible();
    await expect(page.locator('[data-panel-id="chart-2"]').getByText("3 indicators", { exact: true })).toBeVisible();
  });

  await test.step("return to single layout and run a backtest", async () => {
    await page.getByLabel("Chart layout").selectOption("single");
    const runBacktest = page.getByRole("button", { name: "Run Backtest", exact: true });
    await expectHitTestTarget(runBacktest);
    await runBacktest.click();
    await expect(page.getByText("completed", { exact: true })).toBeVisible();
  });
});

test("Studio cancels a large Worker backtest without retaining a partial result", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByLabel("Backtest dataset").selectOption("deterministic-500k");
  await page.getByRole("button", { name: "Run Backtest" }).click();
  await expect(page.getByRole("button", { name: "Cancel Backtest" })).toBeEnabled();
  await page.getByRole("button", { name: "Cancel Backtest" }).click();
  await expect(page.getByText("cancelled", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Strategy Tester for chart-1" }).getByRole("button", { name: "Export JSON" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Studio exposes offline calendar mode, session analysis periods, and persistence", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const sessions = page.getByRole("region", { name: "Trading sessions and calendar analysis" });
  await expect(sessions).toContainText("America/New_York");
  await expect(page.getByLabel("Market session mode")).toHaveValue("calendar");
  await expect(sessions.locator('[data-calendar-status="supported"]')).toContainText("openkline-studio-demo-market@2026.1");

  await page.getByLabel("Session analysis period").selectOption("week");
  await page.getByRole("button", { name: "Toggle session SMA", exact: true }).click();
  await expect(sessions.locator('[data-session-indicator]')).toContainText("week");
  await page.getByRole("button", { name: "Toggle previous session levels", exact: true }).click();
  await expect(sessions.locator('[data-session-reference]')).toContainText("week");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const storedCollection = await page.evaluate(() => JSON.parse(window.localStorage.getItem("openkline-studio-workspaces-v1") ?? "null") as { workspaces: Array<{ charts: Array<{ workspace: { sessionAnalysis?: unknown; tradingCalendar?: unknown } }> }> });
  expect(storedCollection.workspaces[0]?.charts[0]?.workspace).toMatchObject({ sessionAnalysis: { indicators: expect.any(Array), references: expect.any(Array) }, tradingCalendar: { calendarId: "openkline-studio-demo-market", version: "2026.1" } });

  await page.getByLabel("Market session mode").selectOption("utc");
  await expect(page.locator('[data-calendar-status="utc"]')).toContainText("24/7 UTC mode");
  await expect(page.getByLabel("Session analysis period")).toBeDisabled();
  expect(errors).toEqual([]);
});

test("multi-panel Studio keeps drawing property edits chart-local across panel switches and restore", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload({ waitUntil: "load" });

  const objectTree = page.getByRole("complementary", { name: "Object tree" });
  const properties = objectTree.getByRole("region", { name: "Drawing properties" });

  await test.step("draw and style on chart-1 before enabling the second panel", async () => {
    await expect(objectTree).toHaveAttribute("data-object-tree-panel-id", "chart-1");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole("button", { name: "Trend", exact: true }).click();
    await placeVisibleChartPoint(page, 0.35, 0.24);
    await placeVisibleChartPoint(page, 0.65, 0.32);
    await expect(page.getByText("Drawings (1)", { exact: true })).toBeVisible();
    await expect(properties).toHaveAttribute("data-drawing-owner-panel", "chart-1");
    await expect(properties).toHaveAttribute("data-drawing-properties-ready", "true");
    await properties.getByLabel("Drawing color").fill("#ef4444");
    await properties.getByLabel("Drawing line width").fill("5");
    await properties.getByLabel("Drawing locked").check();
    await expect(page.getByText(/Updated drawing-1 on chart-1/)).toBeVisible();
    await expect(objectTree.locator('[data-drawing-id="drawing-1"]')).toHaveAttribute("data-drawing-locked", "true");
  });

  await test.step("draw and style on chart-2 without mutating chart-1", async () => {
    await page.getByLabel("Chart layout").selectOption("two-horizontal");
    await expect(page.locator("[data-panel-id]")).toHaveCount(2);
    await page.getByLabel("Active chart panel").selectOption("chart-2");
    await expect(objectTree).toHaveAttribute("data-object-tree-panel-id", "chart-2");
    await expect(properties).toHaveAttribute("data-drawing-properties-ready", "false");
    // Mobile-style single-panel visibility still keeps chart-2 as the active/draw target.
    await page.getByRole("button", { name: "Activate chart-2", exact: true }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole("button", { name: "Horizontal", exact: true }).click();
    await placeVisibleChartPoint(page, 0.4, 0.3, 'section[aria-label="OpenKline multi-chart workspace"] [data-panel-id="chart-2"] canvas');
    await expect(page.getByText("Drawings (1)", { exact: true })).toBeVisible();
    await expect(properties).toHaveAttribute("data-drawing-owner-panel", "chart-2");
    await expect(properties).toHaveAttribute("data-selected-drawing-id", "drawing-1");
    await properties.getByLabel("Drawing color").fill("#22c55e");
    await properties.getByLabel("Drawing line width").fill("3");
    await properties.getByLabel("Drawing visible").uncheck();
    await expect(page.getByText(/Updated drawing-1 on chart-2/)).toBeVisible();
    await expect(objectTree.locator('[data-drawing-id="drawing-1"]')).toHaveAttribute("data-drawing-visible", "false");
  });

  await test.step("return to chart-1 and verify isolation", async () => {
    await page.getByLabel("Active chart panel").selectOption("chart-1");
    await expect(objectTree).toHaveAttribute("data-object-tree-panel-id", "chart-1");
    await objectTree.getByRole("button", { name: "Select drawing-1", exact: true }).click();
    await expect(properties).toHaveAttribute("data-drawing-properties-ready", "true");
    await expect(properties.getByLabel("Drawing color")).toHaveValue("#ef4444");
    await expect(properties.getByLabel("Drawing line width")).toHaveValue("5");
    await expect(properties.getByLabel("Drawing locked")).toBeChecked();
    await expect(properties.getByLabel("Drawing visible")).toBeChecked();
    await expect(objectTree.locator('[data-drawing-id="drawing-1"]')).toHaveAttribute("data-drawing-locked", "true");
    await expect(objectTree.locator('[data-drawing-id="drawing-1"]')).toHaveAttribute("data-drawing-visible", "true");
  });

  await test.step("persist and restore panel-local drawing styles", async () => {
    await page.getByLabel("Workspace name").fill("Drawing Ownership Isolation");
    await page.getByRole("button", { name: "Save As", exact: true }).click();
    await expect(page.getByText(/saved locally/)).toBeVisible();
    const workspaceId = await page.getByLabel("Workspace", { exact: true }).inputValue();
    const saved = await page.evaluate(() => {
      const collection = JSON.parse(window.localStorage.getItem("openkline-studio-workspaces-v1") ?? "null") as {
        workspaces: Array<{
          name: string;
          charts: Array<{ panelId: string; workspace: { drawings: { drawings: Array<{ style: { color?: string; lineWidth?: number; locked?: boolean; visible?: boolean } }> } } }>;
        }>;
      };
      return collection.workspaces.find((workspace) => workspace.name === "Drawing Ownership Isolation");
    });
    expect(saved?.charts).toHaveLength(2);
    const chartOne = saved?.charts.find((chart) => chart.panelId === "chart-1")?.workspace.drawings.drawings[0]?.style;
    const chartTwo = saved?.charts.find((chart) => chart.panelId === "chart-2")?.workspace.drawings.drawings[0]?.style;
    expect(chartOne).toMatchObject({ color: "#ef4444", lineWidth: 5, locked: true });
    expect(chartTwo).toMatchObject({ color: "#22c55e", lineWidth: 3, visible: false });

    await page.getByRole("button", { name: "New", exact: true }).first().click();
    await expect(page.locator("[data-panel-id]")).toHaveCount(1);
    await page.getByLabel("Workspace", { exact: true }).selectOption(workspaceId);
    await expect(page.locator("[data-panel-id]")).toHaveCount(2);

    await page.getByLabel("Active chart panel").selectOption("chart-1");
    await expect(objectTree).toHaveAttribute("data-object-tree-panel-id", "chart-1");
    await expect(page.getByText("Drawings (1)", { exact: true })).toBeVisible();
    await objectTree.getByRole("button", { name: "Select drawing-1", exact: true }).click();
    await expect(properties.getByLabel("Drawing color")).toHaveValue("#ef4444");
    await expect(properties.getByLabel("Drawing line width")).toHaveValue("5");
    await expect(properties.getByLabel("Drawing locked")).toBeChecked();

    await page.getByLabel("Active chart panel").selectOption("chart-2");
    await expect(objectTree).toHaveAttribute("data-object-tree-panel-id", "chart-2");
    await objectTree.getByRole("button", { name: "Select drawing-1", exact: true }).click();
    await expect(properties.getByLabel("Drawing color")).toHaveValue("#22c55e");
    await expect(properties.getByLabel("Drawing line width")).toHaveValue("3");
    await expect(properties.getByLabel("Drawing visible")).not.toBeChecked();
    await expect(objectTree.locator('[data-drawing-id="drawing-1"]')).toHaveAttribute("data-drawing-visible", "false");
  });

  expect(errors).toEqual([]);
});

test("Studio import validates names, rejects invalid files, and restores multi-panel drawings safely", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload({ waitUntil: "load" });

  const objectTree = page.getByRole("complementary", { name: "Object tree" });
  const properties = objectTree.getByRole("region", { name: "Drawing properties" });
  let exportPath = "";

  await test.step("build and export a two-panel workspace", async () => {
    await page.getByLabel("Workspace name").fill("Import Source Desk");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole("button", { name: "Trend", exact: true }).click();
    await placeVisibleChartPoint(page, 0.35, 0.24);
    await placeVisibleChartPoint(page, 0.65, 0.32);
    await expect(page.getByText("Drawings (1)", { exact: true })).toBeVisible();
    await properties.getByLabel("Drawing color").fill("#ef4444");
    await properties.getByLabel("Drawing line width").fill("5");
    await page.getByLabel("Chart layout").selectOption("two-horizontal");
    await expect(page.locator("[data-panel-id]")).toHaveCount(2);
    await page.getByLabel("Active chart panel").selectOption("chart-2");
    await page.getByRole("button", { name: "Activate chart-2", exact: true }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole("button", { name: "Horizontal", exact: true }).click();
    await placeVisibleChartPoint(page, 0.4, 0.3, 'section[aria-label="OpenKline multi-chart workspace"] [data-panel-id="chart-2"] canvas');
    await expect(page.getByText("Drawings (1)", { exact: true })).toBeVisible();
    await properties.getByLabel("Drawing color").fill("#22c55e");
    await properties.getByLabel("Drawing visible").uncheck();
    await page.getByRole("button", { name: "Save As", exact: true }).click();
    await expect(page.getByText(/saved locally/)).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export workspace", exact: true }).click();
    const download = await downloadPromise;
    exportPath = (await download.path()) ?? "";
    expect(exportPath.length).toBeGreaterThan(0);
  });

  await test.step("reject an invalid import without mutating the live workspace", async () => {
    await page.getByLabel("Workspace name").fill("Should Stay");
    const before = await page.evaluate(() => window.localStorage.getItem("openkline-studio-workspaces-v1"));
    await page.getByLabel("Workspace import file").setInputFiles({
      name: "invalid-workspace.json",
      mimeType: "application/json",
      buffer: Buffer.from("{not-json", "utf8"),
    });
    await expect(page.getByText(/Import rejected: the file is not valid JSON/)).toBeVisible();
    const after = await page.evaluate(() => window.localStorage.getItem("openkline-studio-workspaces-v1"));
    expect(after).toBe(before);
    await expect(page.getByLabel("Workspace name")).toHaveValue("Should Stay");
  });

  await test.step("import the exported workspace through the naming dialog", async () => {
    await page.getByRole("button", { name: "New", exact: true }).first().click();
    await expect(page.locator("[data-panel-id]")).toHaveCount(1);
    await page.getByLabel("Workspace import file").setInputFiles(exportPath);
    const dialog = page.getByRole("dialog", { name: "Import workspace" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Validated/)).toBeVisible();
    await dialog.getByLabel("Dialog value").fill("Imported Multi Panel");
    await dialog.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(page.locator("[data-panel-id]")).toHaveCount(2);
    await expect(page.locator('[data-workspace-restore-panels="2"]')).toBeVisible();
    await expect(page.getByText(/restored with 2 chart panels/)).toBeVisible();

    await page.getByLabel("Active chart panel").selectOption("chart-1");
    await expect(objectTree).toHaveAttribute("data-object-tree-panel-id", "chart-1");
    await expect(page.getByText("Drawings (1)", { exact: true })).toBeVisible();
    await objectTree.getByRole("button", { name: "Select drawing-1", exact: true }).click();
    await expect(properties.getByLabel("Drawing color")).toHaveValue("#ef4444");
    await expect(properties.getByLabel("Drawing line width")).toHaveValue("5");

    await page.getByLabel("Active chart panel").selectOption("chart-2");
    await objectTree.getByRole("button", { name: "Select drawing-1", exact: true }).click();
    await expect(properties.getByLabel("Drawing color")).toHaveValue("#22c55e");
    await expect(objectTree.locator('[data-drawing-id="drawing-1"]')).toHaveAttribute("data-drawing-visible", "false");

    const stored = await page.evaluate(() => {
      const collection = JSON.parse(window.localStorage.getItem("openkline-studio-workspaces-v1") ?? "null") as {
        workspaces: Array<{ id: string; name: string }>;
      };
      return collection.workspaces.map((workspace) => workspace.name);
    });
    expect(stored).toContain("Imported Multi Panel");
    expect(stored).toContain("Import Source Desk");
  });

  expect(errors).toEqual([]);
});

test("Studio multi-panel lifecycle cycles dispose cleanly and import ids never collide", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    (window as Window & { __OPENKLINE_ENABLE_STUDIO_DIAGNOSTICS__?: boolean }).__OPENKLINE_ENABLE_STUDIO_DIAGNOSTICS__ = true;
  });
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload({ waitUntil: "load" });
  await expect(page.locator("[data-panel-id]")).toHaveCount(1);

  await test.step("layout create/dispose cycles keep panel and canvas counts aligned", async () => {
    for (let cycle = 0; cycle < 4; cycle += 1) {
      await page.getByLabel("Chart layout").selectOption("four-grid");
      await expect(page.locator("[data-panel-id]")).toHaveCount(4);
      await expect(studioChartCanvas(page)).toHaveCount(4);
      await page.getByLabel("Sync crosshair").check();
      await page.getByLabel("Sync visible range").check();
      await page.getByLabel("Active chart panel").selectOption("chart-3");
      await page.getByLabel("Chart layout").selectOption("single");
      await expect(page.locator("[data-panel-id]")).toHaveCount(1);
      await expect(studioChartCanvas(page)).toHaveCount(1);
    }
  });

  await test.step("save and restore a four-panel workspace repeatedly", async () => {
    await page.getByLabel("Chart layout").selectOption("four-grid");
    await expect(page.locator("[data-panel-id]")).toHaveCount(4);
    await page.getByLabel("Workspace name").fill("Lifecycle Restore Desk");
    await page.getByRole("button", { name: "Save As", exact: true }).click();
    await expect(page.getByText(/saved locally/)).toBeVisible();
    const workspaceId = await page.getByLabel("Workspace", { exact: true }).inputValue();
    for (let cycle = 0; cycle < 3; cycle += 1) {
      await page.getByRole("button", { name: "New", exact: true }).first().click();
      await expect(page.locator("[data-panel-id]")).toHaveCount(1);
      await expect.poll(async () => page.evaluate(() => {
        const read = (window as Window & {
          __openklineStudioDiagnostics?: () => {
            panelIds: string[];
            syncChartIds: string[];
            snapshotKeys: string[];
            strategyResultCount: number;
            archivedPanelCount: number;
          };
        }).__openklineStudioDiagnostics;
        if (typeof read !== "function") return null;
        const diagnostics = read();
        const orphanSnapshots = diagnostics.snapshotKeys.some((key) => !diagnostics.panelIds.includes(key));
        const orphanSync = diagnostics.syncChartIds.some((id) => !diagnostics.panelIds.includes(id));
        return {
          panels: diagnostics.panelIds.length,
          syncAligned: diagnostics.syncChartIds.length === diagnostics.panelIds.length && !orphanSync,
          snapshotsAligned: !orphanSnapshots && diagnostics.snapshotKeys.length <= diagnostics.panelIds.length,
          strategies: diagnostics.strategyResultCount,
          archived: diagnostics.archivedPanelCount,
        };
      })).toEqual({ panels: 1, syncAligned: true, snapshotsAligned: true, strategies: 0, archived: 0 });
      await page.getByLabel("Workspace", { exact: true }).selectOption(workspaceId);
      await expect(page.locator("[data-panel-id]")).toHaveCount(4);
      await expect(page.locator('[data-workspace-restore-panels="4"]')).toBeVisible();
      await expect.poll(async () => page.evaluate(() => {
        const read = (window as Window & {
          __openklineStudioDiagnostics?: () => {
            panelIds: string[];
            syncChartIds: string[];
            snapshotKeys: string[];
          };
        }).__openklineStudioDiagnostics;
        if (typeof read !== "function") return null;
        const diagnostics = read();
        return {
          sync: diagnostics.syncChartIds.length,
          syncAligned: diagnostics.syncChartIds.every((id) => diagnostics.panelIds.includes(id)),
          snapshotsAligned: diagnostics.snapshotKeys.every((key) => diagnostics.panelIds.includes(key)),
        };
      })).toEqual({ sync: 4, syncAligned: true, snapshotsAligned: true });
    }
  });

  await test.step("rapid imports allocate distinct ids without overwriting", async () => {
    const payload = await page.evaluate(() => window.localStorage.getItem("openkline-studio-workspaces-v1"));
    expect(payload).not.toBeNull();
    const source = JSON.parse(payload!).workspaces[0];
    const ids: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      await page.getByLabel("Workspace import file").setInputFiles({
        name: `collision-${index}.json`,
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(source), "utf8"),
      });
      const dialog = page.getByRole("dialog", { name: "Import workspace" });
      await expect(dialog).toBeVisible();
      await dialog.getByLabel("Dialog value").fill(`Collision Import ${index}`);
      await dialog.getByRole("button", { name: "Apply", exact: true }).click();
      await expect(page.getByText(/restored with/)).toBeVisible();
      ids.push(await page.getByLabel("Workspace", { exact: true }).inputValue());
    }
    expect(new Set(ids).size).toBe(3);
    const storedIds = await page.evaluate(() => {
      const collection = JSON.parse(window.localStorage.getItem("openkline-studio-workspaces-v1") ?? "null") as {
        workspaces: Array<{ id: string }>;
      };
      return collection.workspaces.map((workspace) => workspace.id);
    });
    for (const id of ids) expect(storedIds).toContain(id);
    expect(ids.every((id) => id.startsWith("imported-"))).toBe(true);
  });

  expect(errors).toEqual([]);
});

test("Studio workspace library rename and delete preserve multi-panel content and identity", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload({ waitUntil: "load" });

  const objectTree = page.getByRole("complementary", { name: "Object tree" });
  const properties = objectTree.getByRole("region", { name: "Drawing properties" });
  let primaryId = "";
  let secondaryId = "";

  await test.step("save a multi-panel workspace with panel-local drawings", async () => {
    await page.getByLabel("Workspace name").fill("Library Primary");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole("button", { name: "Trend", exact: true }).click();
    await placeVisibleChartPoint(page, 0.35, 0.24);
    await placeVisibleChartPoint(page, 0.65, 0.32);
    await expect(page.getByText("Drawings (1)", { exact: true })).toBeVisible();
    await properties.getByLabel("Drawing color").fill("#ef4444");
    await properties.getByLabel("Drawing line width").fill("4");
    await page.getByLabel("Chart layout").selectOption("two-horizontal");
    await expect(page.locator("[data-panel-id]")).toHaveCount(2);
    await page.getByLabel("Active chart panel").selectOption("chart-2");
    await page.getByRole("button", { name: "Activate chart-2", exact: true }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole("button", { name: "Horizontal", exact: true }).click();
    await placeVisibleChartPoint(page, 0.42, 0.3, 'section[aria-label="OpenKline multi-chart workspace"] [data-panel-id="chart-2"] canvas');
    await expect(page.getByText("Drawings (1)", { exact: true })).toBeVisible();
    await properties.getByLabel("Drawing color").fill("#22c55e");
    await page.getByRole("button", { name: "Save As", exact: true }).click();
    await expect(page.getByText(/saved locally/)).toBeVisible();
    primaryId = await page.getByLabel("Workspace", { exact: true }).inputValue();
    expect(primaryId.length).toBeGreaterThan(0);
  });

  await test.step("save a second workspace and cancel a rename without mutating storage", async () => {
    await page.getByRole("button", { name: "New", exact: true }).first().click();
    await expect(page.locator("[data-panel-id]")).toHaveCount(1);
    await page.getByLabel("Workspace name").fill("Library Secondary");
    await page.getByRole("button", { name: "Save As", exact: true }).click();
    await expect(page.getByText(/saved locally/)).toBeVisible();
    secondaryId = await page.getByLabel("Workspace", { exact: true }).inputValue();
    expect(secondaryId).not.toBe(primaryId);

    await page.getByLabel("Workspace", { exact: true }).selectOption(primaryId);
    await expect(page.locator("[data-panel-id]")).toHaveCount(2);
    const before = await page.evaluate(() => window.localStorage.getItem("openkline-studio-workspaces-v1"));
    await page.getByRole("button", { name: "Rename", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Rename workspace" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Dialog value").fill("Should Not Persist");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const after = await page.evaluate(() => window.localStorage.getItem("openkline-studio-workspaces-v1"));
    expect(after).toBe(before);
    await expect(page.getByLabel("Workspace name")).toHaveValue("Library Primary");
  });

  await test.step("rename preserves workspace id and restores panel drawings", async () => {
    await page.getByRole("button", { name: "Rename", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Rename workspace" });
    await dialog.getByLabel("Dialog value").fill("Library Primary Renamed");
    await dialog.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(page.getByText(/Renamed workspace to “Library Primary Renamed”/)).toBeVisible();
    await expect(page.getByLabel("Workspace name")).toHaveValue("Library Primary Renamed");
    const renamedId = await page.getByLabel("Workspace", { exact: true }).inputValue();
    expect(renamedId).toBe(primaryId);

    await page.getByRole("button", { name: "New", exact: true }).first().click();
    await page.getByLabel("Workspace", { exact: true }).selectOption(primaryId);
    await expect(page.locator("[data-panel-id]")).toHaveCount(2);
    await expect(page.locator('[data-workspace-restore-panels="2"]')).toBeVisible();
    await page.getByLabel("Active chart panel").selectOption("chart-1");
    await objectTree.getByRole("button", { name: "Select drawing-1", exact: true }).click();
    await expect(properties.getByLabel("Drawing color")).toHaveValue("#ef4444");
    await expect(properties.getByLabel("Drawing line width")).toHaveValue("4");
    await page.getByLabel("Active chart panel").selectOption("chart-2");
    await objectTree.getByRole("button", { name: "Select drawing-1", exact: true }).click();
    await expect(properties.getByLabel("Drawing color")).toHaveValue("#22c55e");
  });

  await test.step("delete the other saved workspace without replacing live charts", async () => {
    await page.getByLabel("Workspace", { exact: true }).selectOption(secondaryId);
    await expect(page.locator("[data-panel-id]")).toHaveCount(1);
    await page.getByLabel("Chart layout").selectOption("two-horizontal");
    await expect(page.locator("[data-panel-id]")).toHaveCount(2);
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    const confirm = page.getByRole("dialog", { name: /Delete workspace/ });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(page.getByText(/Live charts remain open as an unsaved desk/)).toBeVisible();
    await expect(page.locator("[data-panel-id]")).toHaveCount(2);

    const stored = await page.evaluate(() => {
      const collection = JSON.parse(window.localStorage.getItem("openkline-studio-workspaces-v1") ?? "null") as {
        workspaces: Array<{ id: string; name: string; charts: unknown[] }>;
      };
      return collection;
    });
    expect(stored.workspaces.map((item) => item.id)).toEqual([primaryId]);
    expect(stored.workspaces[0]?.name).toBe("Library Primary Renamed");
    expect(stored.workspaces[0]?.charts).toHaveLength(2);

    const selectorValues = await page.getByLabel("Workspace", { exact: true }).locator("option").evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value).filter((value) => value.length > 0),
    );
    expect(selectorValues).toEqual([primaryId]);
  });

  await test.step("reload preserves library state after rename and delete", async () => {
    await page.reload({ waitUntil: "load" });
    const stored = await page.evaluate(() => {
      const collection = JSON.parse(window.localStorage.getItem("openkline-studio-workspaces-v1") ?? "null") as {
        workspaces: Array<{ id: string; name: string }>;
      };
      return collection.workspaces.map((workspace) => ({ id: workspace.id, name: workspace.name }));
    });
    expect(stored).toEqual([{ id: primaryId, name: "Library Primary Renamed" }]);
  });

  expect(errors).toEqual([]);
});

test("Studio dirty-state protects Load and New with Save, Discard, and Cancel", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload({ waitUntil: "load" });

  const objectTree = page.getByRole("complementary", { name: "Object tree" });
  const properties = objectTree.getByRole("region", { name: "Drawing properties" });
  const saveStatus = page.getByLabel("Workspace save status");
  let primaryId = "";
  let secondaryId = "";

  await test.step("save two workspaces and confirm clean status", async () => {
    await page.getByLabel("Workspace name").fill("Dirty Primary");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole("button", { name: "Trend", exact: true }).click();
    await placeVisibleChartPoint(page, 0.35, 0.24);
    await placeVisibleChartPoint(page, 0.65, 0.32);
    await expect(page.getByText("Drawings (1)", { exact: true })).toBeVisible();
    await properties.getByLabel("Drawing color").fill("#ef4444");
    await page.getByLabel("Chart layout").selectOption("two-horizontal");
    await expect(page.locator("[data-panel-id]")).toHaveCount(2);
    await page.getByRole("button", { name: "Save As", exact: true }).click();
    await expect(page.getByText(/saved locally/)).toBeVisible();
    await expect(saveStatus).toHaveAttribute("data-workspace-save-status", "saved");
    primaryId = await page.getByLabel("Workspace", { exact: true }).inputValue();

    await page.getByRole("button", { name: "New", exact: true }).first().click();
    await expect(page.locator("[data-panel-id]")).toHaveCount(1);
    await page.getByLabel("Workspace name").fill("Dirty Secondary");
    await page.getByRole("button", { name: "Save As", exact: true }).click();
    await expect(page.getByText(/saved locally/)).toBeVisible();
    secondaryId = await page.getByLabel("Workspace", { exact: true }).inputValue();
    expect(secondaryId).not.toBe(primaryId);

    await page.getByLabel("Workspace", { exact: true }).selectOption(primaryId);
    await expect(page.locator("[data-panel-id]")).toHaveCount(2);
    await expect(saveStatus).toHaveAttribute("data-workspace-save-status", "saved");
  });

  await test.step("drawing edit marks unsaved changes and Cancel preserves them", async () => {
    await page.getByLabel("Active chart panel").selectOption("chart-1");
    await objectTree.getByRole("button", { name: "Select drawing-1", exact: true }).click();
    await properties.getByLabel("Drawing color").fill("#a855f7");
    await expect(saveStatus).toHaveAttribute("data-workspace-save-status", "unsaved-changes");

    await page.getByLabel("Workspace", { exact: true }).selectOption(secondaryId);
    const guard = page.getByRole("dialog", { name: "Load another workspace?" });
    await expect(guard).toBeVisible();
    await guard.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(guard).toHaveCount(0);
    await expect(page.locator("[data-panel-id]")).toHaveCount(2);
    await expect(properties.getByLabel("Drawing color")).toHaveValue("#a855f7");
    await expect(saveStatus).toHaveAttribute("data-workspace-save-status", "unsaved-changes");
  });

  await test.step("Save and Continue persists edits then loads the destination", async () => {
    await page.getByLabel("Workspace", { exact: true }).selectOption(secondaryId);
    const guard = page.getByRole("dialog", { name: "Load another workspace?" });
    await expect(guard).toBeVisible();
    await guard.getByRole("button", { name: "Save and Continue", exact: true }).click();
    await expect(page.locator("[data-panel-id]")).toHaveCount(1);
    await expect(saveStatus).toHaveAttribute("data-workspace-save-status", "saved");

    await page.getByLabel("Workspace", { exact: true }).selectOption(primaryId);
    await expect(page.locator("[data-panel-id]")).toHaveCount(2);
    await page.getByLabel("Active chart panel").selectOption("chart-1");
    await objectTree.getByRole("button", { name: "Select drawing-1", exact: true }).click();
    await expect(properties.getByLabel("Drawing color")).toHaveValue("#a855f7");
  });

  await test.step("Discard and Continue starts New without rewriting the saved record", async () => {
    await properties.getByLabel("Drawing color").fill("#14b8a6");
    await expect(saveStatus).toHaveAttribute("data-workspace-save-status", "unsaved-changes");
    const before = await page.evaluate((id) => {
      const collection = JSON.parse(window.localStorage.getItem("openkline-studio-workspaces-v1") ?? "null") as {
        workspaces: Array<{ id: string; charts: Array<{ workspace: { drawings: { drawings: Array<{ style: { color: string } }> } } }> }>;
      };
      const target = collection.workspaces.find((workspace) => workspace.id === id);
      return target?.charts[0]?.workspace.drawings.drawings[0]?.style.color ?? null;
    }, primaryId);
    expect(before).toBe("#a855f7");

    await page.getByRole("button", { name: "New", exact: true }).first().click();
    const guard = page.getByRole("dialog", { name: "Start a new workspace?" });
    await expect(guard).toBeVisible();
    await guard.getByRole("button", { name: "Discard Changes and Continue", exact: true }).click();
    await expect(page.locator("[data-panel-id]")).toHaveCount(1);
    await expect(saveStatus).toHaveAttribute("data-workspace-save-status", "unsaved-workspace");

    const after = await page.evaluate((id) => {
      const collection = JSON.parse(window.localStorage.getItem("openkline-studio-workspaces-v1") ?? "null") as {
        workspaces: Array<{ id: string; charts: Array<{ workspace: { drawings: { drawings: Array<{ style: { color: string } }> } } }> }>;
      };
      const target = collection.workspaces.find((workspace) => workspace.id === id);
      return target?.charts[0]?.workspace.drawings.drawings[0]?.style.color ?? null;
    }, primaryId);
    expect(after).toBe("#a855f7");
  });

  expect(errors).toEqual([]);
});

test("Studio Indicator Explorer adds, scopes, dirty-tracks, and restores panel-local indicators", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload({ waitUntil: "load" });

  const explorer = page.getByRole("region", { name: "Technical analysis explorer" });
  const saveStatus = page.getByLabel("Workspace save status");
  let primaryId = "";
  let secondaryId = "";

  await test.step("open Explorer, search, and add ATR to chart-1", async () => {
    await page.getByLabel("Chart layout").selectOption("two-horizontal");
    await expect(page.locator("[data-panel-id]")).toHaveCount(2);
    await page.getByLabel("Active chart panel").selectOption("chart-1");
    await expect(explorer).toHaveAttribute("data-indicator-explorer-panel", "chart-1");

    await explorer.getByLabel("Search technical studies").fill("average true");
    await expect(explorer.getByRole("option", { name: /Average True Range/i })).toHaveCount(1);
    await explorer.getByRole("option", { name: /Average True Range/i }).click();
    await expect(explorer.locator("[data-indicator-selected]")).toHaveAttribute("data-indicator-selected", "ATR");
    await explorer.locator("[data-indicator-add]").click();
    await expect(page.getByText(/Added ATR to chart-1/)).toBeVisible();
    await expect(explorer.locator('[data-applied-indicator-type="ATR"]')).toHaveCount(1);
    await expect(page.locator('[data-panel-id="chart-1"]').getByText("3 indicators", { exact: true })).toBeVisible();
  });

  await test.step("empty search reports no results without mutating the chart", async () => {
    const applied = explorer.locator("[data-applied-indicator-count]");
    const before = await applied.getAttribute("data-applied-indicator-count");
    await explorer.getByLabel("Search technical studies").fill("zzz-no-such-indicator");
    await expect(explorer.getByRole("status")).toContainText("No indicators match");
    await expect(applied).toHaveAttribute("data-applied-indicator-count", before ?? "");
    await expect(explorer.locator('[data-applied-indicator-type="ATR"]')).toHaveCount(1);
    await explorer.getByLabel("Search technical studies").fill("");
  });

  await test.step("save primary workspace then create a clean secondary", async () => {
    await page.getByLabel("Workspace name").fill("Indicator Primary");
    await page.getByRole("button", { name: "Save As", exact: true }).click();
    await expect(page.getByText(/saved locally/)).toBeVisible();
    await expect(saveStatus).toHaveAttribute("data-workspace-save-status", "saved");
    primaryId = await page.getByLabel("Workspace", { exact: true }).inputValue();

    await page.getByRole("button", { name: "New", exact: true }).first().click();
    await expect(page.locator("[data-panel-id]")).toHaveCount(1);
    await page.getByLabel("Workspace name").fill("Indicator Secondary");
    await page.getByRole("button", { name: "Save As", exact: true }).click();
    await expect(page.getByText(/saved locally/)).toBeVisible();
    secondaryId = await page.getByLabel("Workspace", { exact: true }).inputValue();
    expect(secondaryId).not.toBe(primaryId);

    await page.getByLabel("Workspace", { exact: true }).selectOption(primaryId);
    await expect(page.locator("[data-panel-id]")).toHaveCount(2);
    await expect(saveStatus).toHaveAttribute("data-workspace-save-status", "saved");
    await expect(explorer.locator('[data-applied-indicator-type="ATR"]')).toHaveCount(1);
  });

  await test.step("Panel B add leaves Panel A indicators intact and marks dirty", async () => {
    await page.getByLabel("Active chart panel").selectOption("chart-2");
    await expect(explorer).toHaveAttribute("data-indicator-explorer-panel", "chart-2");
    await expect(explorer.locator('[data-applied-indicator-type="ATR"]')).toHaveCount(0);
    await explorer.getByLabel("Search technical studies").fill("MACD");
    await explorer.locator('[data-indicator-id="MACD"]').click();
    await explorer.locator("[data-indicator-add]").click();
    await expect(page.getByText(/Added MACD to chart-2/)).toBeVisible();
    await expect(explorer.locator('[data-applied-indicator-type="MACD"]')).toHaveCount(1);
    await expect(saveStatus).toHaveAttribute("data-workspace-save-status", "unsaved-changes");

    await page.getByLabel("Active chart panel").selectOption("chart-1");
    await expect(explorer.locator('[data-applied-indicator-type="ATR"]')).toHaveCount(1);
    await expect(explorer.locator('[data-applied-indicator-type="MACD"]')).toHaveCount(0);
  });

  await test.step("dirty Load Cancel preserves indicator edits", async () => {
    await page.getByLabel("Workspace", { exact: true }).selectOption(secondaryId);
    const guard = page.getByRole("dialog", { name: "Load another workspace?" });
    await expect(guard).toBeVisible();
    await guard.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(guard).toHaveCount(0);
    await expect(page.locator("[data-panel-id]")).toHaveCount(2);
    await expect(saveStatus).toHaveAttribute("data-workspace-save-status", "unsaved-changes");
    await page.getByLabel("Active chart panel").selectOption("chart-2");
    await expect(explorer.locator('[data-applied-indicator-type="MACD"]')).toHaveCount(1);
  });

  await test.step("Save and restore keeps panel-local indicators", async () => {
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(saveStatus).toHaveAttribute("data-workspace-save-status", "saved");

    await page.getByLabel("Workspace", { exact: true }).selectOption(secondaryId);
    await expect(page.locator("[data-panel-id]")).toHaveCount(1);
    await page.getByLabel("Workspace", { exact: true }).selectOption(primaryId);
    await expect(page.locator("[data-panel-id]")).toHaveCount(2);
    await page.getByLabel("Active chart panel").selectOption("chart-1");
    await expect(explorer.locator('[data-applied-indicator-type="ATR"]')).toHaveCount(1);
    await page.getByLabel("Active chart panel").selectOption("chart-2");
    await expect(explorer.locator('[data-applied-indicator-type="MACD"]')).toHaveCount(1);
  });

  await test.step("remove applied indicator updates chart and dirty state", async () => {
    const macdId = await explorer.locator('[data-applied-indicator-type="MACD"]').first().getAttribute("data-applied-indicator-id");
    expect(macdId).toBeTruthy();
    await explorer.getByRole("button", { name: `Remove ${macdId}`, exact: true }).click();
    await expect(explorer.locator('[data-applied-indicator-type="MACD"]')).toHaveCount(0);
    await expect(saveStatus).toHaveAttribute("data-workspace-save-status", "unsaved-changes");
    await page.getByLabel("Active chart panel").selectOption("chart-1");
    await expect(explorer.locator('[data-applied-indicator-type="ATR"]')).toHaveCount(1);
  });

  await test.step("keyboard reaches Explorer search and catalog selection", async () => {
    await explorer.getByLabel("Search technical studies").focus();
    await expect(explorer.getByLabel("Search technical studies")).toBeFocused();
    await explorer.getByLabel("Search technical studies").fill("ema");
    await explorer.getByRole("option", { name: /Exponential Moving Average/i }).focus();
    await page.keyboard.press("Enter");
    await expect(explorer.locator("[data-indicator-selected]")).toHaveAttribute("data-indicator-selected", "EMA");
  });

  expect(errors).toEqual([]);
});

test("Studio Professional Drawing Toolbar creates, cancels, dirty-tracks, and restores panel-local drawings", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload({ waitUntil: "load" });

  const toolbar = page.getByRole("region", { name: "Professional drawing toolbar" });
  const objectTree = page.getByRole("complementary", { name: "Object tree" });
  const properties = objectTree.getByRole("region", { name: "Drawing properties" });
  const saveStatus = page.getByLabel("Workspace save status");
  let primaryId = "";
  let secondaryId = "";

  await test.step("arm Trend, cancel before completion without dirtying a saved desk", async () => {
    await page.getByLabel("Workspace name").fill("Drawing Toolbar Primary");
    await page.getByRole("button", { name: "Save As", exact: true }).click();
    await expect(page.getByText(/saved locally/)).toBeVisible();
    await expect(saveStatus).toHaveAttribute("data-workspace-save-status", "saved");
    primaryId = await page.getByLabel("Workspace", { exact: true }).inputValue();

    await page.evaluate(() => window.scrollTo(0, 0));
    await toolbar.getByRole("button", { name: "Trend", exact: true }).click();
    await expect(toolbar.getByRole("button", { name: "Trend", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("[data-active-drawing-tool]")).toHaveAttribute("data-active-drawing-tool", "trend-line");
    await expect(saveStatus).toHaveAttribute("data-workspace-save-status", "saved");

    await page.keyboard.press("Escape");
    await expect(toolbar.getByRole("button", { name: "Cursor selection mode", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("[data-active-drawing-tool]")).toHaveAttribute("data-active-drawing-tool", "");
    await expect(page.getByText("Drawings (0)", { exact: true })).toBeVisible();
    await expect(saveStatus).toHaveAttribute("data-workspace-save-status", "saved");
  });

  await test.step("complete a Trend on Panel A and mark dirty", async () => {
    await page.evaluate(() => window.scrollTo(0, 0));
    await toolbar.getByRole("button", { name: "Trend", exact: true }).click();
    await placeVisibleChartPoint(page, 0.35, 0.24);
    await placeVisibleChartPoint(page, 0.65, 0.32);
    await expect(page.getByText("Drawings (1)", { exact: true })).toBeVisible();
    await expect(page.getByText(/Completed drawing/)).toBeVisible();
    await expect(saveStatus).toHaveAttribute("data-workspace-save-status", "unsaved-changes");
    await expect(toolbar.getByRole("button", { name: "Cursor selection mode", exact: true })).toHaveAttribute("aria-pressed", "true");
    await objectTree.getByRole("button", { name: "Select drawing-1", exact: true }).click();
    await properties.getByLabel("Drawing color").fill("#22c55e");
    await expect(properties.getByLabel("Drawing color")).toHaveValue("#22c55e");
  });

  await test.step("Panel B horizontal line stays local and Load Cancel preserves edits", async () => {
    await page.getByLabel("Chart layout").selectOption("two-horizontal");
    await expect(page.locator("[data-panel-id]")).toHaveCount(2);
    await expect(saveStatus).toHaveAttribute("data-workspace-save-status", "unsaved-changes");

    await page.getByRole("button", { name: "New", exact: true }).first().click();
    const discardGuard = page.getByRole("dialog", { name: "Start a new workspace?" });
    await expect(discardGuard).toBeVisible();
    await discardGuard.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.locator("[data-panel-id]")).toHaveCount(2);

    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(saveStatus).toHaveAttribute("data-workspace-save-status", "saved");

    await page.getByRole("button", { name: "New", exact: true }).first().click();
    await expect(page.locator("[data-panel-id]")).toHaveCount(1);
    await page.getByLabel("Workspace name").fill("Drawing Toolbar Secondary");
    await page.getByRole("button", { name: "Save As", exact: true }).click();
    await expect(page.getByText(/saved locally/)).toBeVisible();
    secondaryId = await page.getByLabel("Workspace", { exact: true }).inputValue();
    expect(secondaryId).not.toBe(primaryId);

    await page.getByLabel("Workspace", { exact: true }).selectOption(primaryId);
    await expect(page.locator("[data-panel-id]")).toHaveCount(2);
    await page.getByLabel("Active chart panel").selectOption("chart-1");
    await expect(page.getByText("Drawings (1)", { exact: true })).toBeVisible();

    await page.getByLabel("Active chart panel").selectOption("chart-2");
    await page.getByRole("button", { name: "Activate chart-2", exact: true }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await toolbar.getByRole("button", { name: "Horizontal", exact: true }).click();
    await placeVisibleChartPoint(page, 0.4, 0.3, 'section[aria-label="OpenKline multi-chart workspace"] [data-panel-id="chart-2"] canvas');
    await expect(page.locator('[data-panel-id="chart-2"]').getByText("1 drawings", { exact: true })).toBeVisible();
    await expect(saveStatus).toHaveAttribute("data-workspace-save-status", "unsaved-changes");

    await page.getByLabel("Active chart panel").selectOption("chart-1");
    await expect(page.getByText("Drawings (1)", { exact: true })).toBeVisible();
    await expect(page.locator('[data-panel-id="chart-2"]').getByText("1 drawings", { exact: true })).toBeVisible();

    await page.getByLabel("Workspace", { exact: true }).selectOption(secondaryId);
    const loadGuard = page.getByRole("dialog", { name: "Load another workspace?" });
    await expect(loadGuard).toBeVisible();
    await loadGuard.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.locator("[data-panel-id]")).toHaveCount(2);
    await expect(saveStatus).toHaveAttribute("data-workspace-save-status", "unsaved-changes");
  });

  await test.step("save and restore keeps panel-local drawings and styles", async () => {
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(saveStatus).toHaveAttribute("data-workspace-save-status", "saved");
    await page.getByLabel("Workspace", { exact: true }).selectOption(secondaryId);
    await expect(page.locator("[data-panel-id]")).toHaveCount(1);
    await page.getByLabel("Workspace", { exact: true }).selectOption(primaryId);
    await expect(page.locator("[data-panel-id]")).toHaveCount(2);
    await page.getByLabel("Active chart panel").selectOption("chart-1");
    await expect(page.getByText("Drawings (1)", { exact: true })).toBeVisible();
    await objectTree.getByRole("button", { name: "Select drawing-1", exact: true }).click();
    await expect(properties.getByLabel("Drawing color")).toHaveValue("#22c55e");
    await page.getByLabel("Active chart panel").selectOption("chart-2");
    await expect(page.locator('[data-panel-id="chart-2"]').getByText("1 drawings", { exact: true })).toBeVisible();
  });

  await test.step("replay disables drawing tools", async () => {
    await page.getByRole("button", { name: "Enter replay", exact: true }).click();
    await expect(toolbar.getByRole("button", { name: "Trend", exact: true })).toBeDisabled();
    await expect(toolbar.getByRole("button", { name: "Cursor selection mode", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Exit replay", exact: true }).click();
    await expect(toolbar.getByRole("button", { name: "Trend", exact: true })).toBeEnabled();
  });

  await test.step("keyboard reaches Cursor and Trend controls", async () => {
    await toolbar.getByRole("button", { name: "Cursor selection mode", exact: true }).focus();
    await expect(toolbar.getByRole("button", { name: "Cursor selection mode", exact: true })).toBeFocused();
    await toolbar.getByRole("button", { name: "Trend", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(toolbar.getByRole("button", { name: "Trend", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(toolbar.getByRole("button", { name: "Cursor selection mode", exact: true })).toHaveAttribute("aria-pressed", "true");
  });

  expect(errors).toEqual([]);
});

test("Studio KlineScript compiles, applies via Worker, dirty-tracks, and restores panel-local scripts", async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload({ waitUntil: "load" });

  const explorer = page.getByRole("region", { name: "Technical analysis explorer" });
  const saveStatus = page.getByLabel("Workspace save status");
  let primaryId = "";
  let secondaryId = "";
  let panelAId = "chart-1";
  let panelBId = "chart-2";
  let panelAScriptId = "";

  await test.step("expand layout first, then compile invalid source without mutating", async () => {
    await page.getByLabel("Chart layout").selectOption("two-horizontal");
    await expect(page.locator("[data-panel-id]")).toHaveCount(2);
    const panelIds = await page.locator("[data-panel-id]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-panel-id") ?? ""));
    panelAId = panelIds[0] || "chart-1";
    panelBId = panelIds[1] || "chart-2";
    await page.getByLabel("Active chart panel").selectOption(panelAId);

    await page.getByLabel("Workspace name").fill("KlineScript Primary");
    await page.getByRole("button", { name: "Save As", exact: true }).click();
    await expect(page.getByText(/saved locally/)).toBeVisible();
    await expect(saveStatus).toHaveAttribute("data-workspace-save-status", "saved");
    primaryId = await page.getByLabel("Workspace", { exact: true }).inputValue();

    await page.getByRole("button", { name: "KlineScript", exact: true }).click();
    const editor = page.getByRole("region", { name: "KlineScript editor" });
    await expect(editor).toBeVisible();
    await expect(editor).toHaveAttribute("data-klinescript-panel", panelAId);
    const source = editor.getByLabel("KlineScript source");
    await editor.getByLabel("KlineScript template").selectOption({ label: "Pointwise close" });
    await source.fill('indicator("Broken")\nplot(eval(close))');
    await editor.getByRole("button", { name: "Compile", exact: true }).click();
    await expect(editor.getByText("KS3063", { exact: false })).toBeVisible();
    await expect(editor.getByRole("button", { name: "Run in Worker", exact: true })).toBeDisabled();
    await expect(saveStatus).toHaveAttribute("data-workspace-save-status", "saved");
    await expect(page.locator(`[data-panel-id="${panelAId}"]`).getByText("2 indicators", { exact: true })).toBeVisible();
  });

  await test.step("compile and apply a valid script on Panel A", async () => {
    const editor = page.getByRole("region", { name: "KlineScript editor" });
    const source = editor.getByLabel("KlineScript source");
    await source.fill('indicator("Studio Panel A")\nplot(close, title="Close A", color="#fbbf24")');
    await editor.getByRole("button", { name: "Compile", exact: true }).click();
    await expect(editor.getByText(/Compiled KLINESCRIPT-/)).toBeVisible();
    await editor.getByRole("button", { name: "Run in Worker", exact: true }).click();
    await expect(page.getByText(/Added Worker-backed KlineScript/)).toBeVisible({ timeout: 15_000 });
    await expect(editor.getByText(/Runtime: ready/)).toBeVisible();
    await expect(saveStatus).toHaveAttribute("data-workspace-save-status", "unsaved-changes");
    await expect(page.locator(`[data-panel-id="${panelAId}"]`).getByText("3 indicators", { exact: true })).toBeVisible();
    await expect(explorer.locator('[data-applied-indicator-kind="klinescript"]')).toHaveCount(1);
    panelAScriptId = await explorer.locator('[data-applied-indicator-kind="klinescript"]').getAttribute("data-applied-indicator-id") ?? "";
    expect(panelAScriptId.length).toBeGreaterThan(0);
  });

  await test.step("Panel B apply stays local and Load Cancel preserves edits", async () => {
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(saveStatus).toHaveAttribute("data-workspace-save-status", "saved");

    await page.getByRole("button", { name: "New", exact: true }).first().click();
    await expect(page.locator("[data-panel-id]")).toHaveCount(1);
    await page.getByLabel("Workspace name").fill("KlineScript Secondary");
    await page.getByRole("button", { name: "Save As", exact: true }).click();
    await expect(page.getByText(/saved locally/)).toBeVisible();
    secondaryId = await page.getByLabel("Workspace", { exact: true }).inputValue();
    expect(secondaryId).not.toBe(primaryId);

    await page.getByLabel("Workspace", { exact: true }).selectOption(primaryId);
    await expect(page.locator("[data-panel-id]")).toHaveCount(2);
    await page.getByLabel("Active chart panel").selectOption(panelBId);
    await page.getByRole("button", { name: `Activate ${panelBId}`, exact: true }).click();

    if (!(await page.getByRole("region", { name: "KlineScript editor" }).isVisible())) {
      await page.getByRole("button", { name: "KlineScript", exact: true }).click();
    }
    const editor = page.getByRole("region", { name: "KlineScript editor" });
    await expect(editor).toHaveAttribute("data-klinescript-panel", panelBId);
    await editor.getByLabel("KlineScript source").fill('indicator("Studio Panel B")\nplot(close, title="Close B", color="#60a5fa")');
    await editor.getByRole("button", { name: "Run in Worker", exact: true }).click();
    await expect(page.getByText(/Added Worker-backed KlineScript/)).toBeVisible({ timeout: 15_000 });
    await expect(saveStatus).toHaveAttribute("data-workspace-save-status", "unsaved-changes");
    await expect(page.locator(`[data-panel-id="${panelBId}"]`).getByText("3 indicators", { exact: true })).toBeVisible();

    await page.getByLabel("Active chart panel").selectOption(panelAId);
    await expect(explorer.locator(`[data-applied-indicator-id="${panelAScriptId}"]`)).toHaveCount(1);
    await expect(page.locator(`[data-panel-id="${panelAId}"]`).getByText("3 indicators", { exact: true })).toBeVisible();
    await expect(page.locator(`[data-panel-id="${panelBId}"]`).getByText("3 indicators", { exact: true })).toBeVisible();

    await page.getByLabel("Workspace", { exact: true }).selectOption(secondaryId);
    const loadGuard = page.getByRole("dialog", { name: "Load another workspace?" });
    await expect(loadGuard).toBeVisible();
    await loadGuard.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.locator("[data-panel-id]")).toHaveCount(2);
    await expect(saveStatus).toHaveAttribute("data-workspace-save-status", "unsaved-changes");
  });

  await test.step("save and restore keeps panel-local scripts", async () => {
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(saveStatus).toHaveAttribute("data-workspace-save-status", "saved");
    await page.getByLabel("Workspace", { exact: true }).selectOption(secondaryId);
    await expect(page.locator("[data-panel-id]")).toHaveCount(1);
    await page.getByLabel("Workspace", { exact: true }).selectOption(primaryId);
    await expect(page.locator("[data-panel-id]")).toHaveCount(2);
    await page.getByLabel("Active chart panel").selectOption(panelAId);
    await expect(explorer.locator('[data-applied-indicator-kind="klinescript"]')).toHaveCount(1);
    await expect(page.locator(`[data-panel-id="${panelAId}"]`).getByText("3 indicators", { exact: true })).toBeVisible();
    await page.getByLabel("Active chart panel").selectOption(panelBId);
    await expect(explorer.locator('[data-applied-indicator-kind="klinescript"]')).toHaveCount(1);
    await expect(page.locator(`[data-panel-id="${panelBId}"]`).getByText("3 indicators", { exact: true })).toBeVisible();
  });

  await test.step("remove applied script marks dirty and replay disables editor", async () => {
    await page.getByLabel("Active chart panel").selectOption(panelAId);
    const scriptRow = explorer.locator('[data-applied-indicator-kind="klinescript"]').first();
    const removeId = await scriptRow.getAttribute("data-applied-indicator-id");
    expect(removeId).toBeTruthy();
    await explorer.getByRole("button", { name: `Remove ${removeId}`, exact: true }).click();
    await expect(page.getByText(new RegExp(`Removed ${removeId}`))).toBeVisible();
    await expect(saveStatus).toHaveAttribute("data-workspace-save-status", "unsaved-changes");
    await expect(page.locator(`[data-panel-id="${panelAId}"]`).getByText("2 indicators", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Enter replay", exact: true }).click();
    await expect(page.getByRole("button", { name: "KlineScript", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Exit replay", exact: true }).click();
  });

  expect(errors).toEqual([]);
});
