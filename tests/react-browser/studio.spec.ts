import { expect, test, type Page } from "./studio-test.js";

async function placeChartPoint(page: Page, x: number, y: number): Promise<void> {
  const touchInput = await page.evaluate(() => navigator.maxTouchPoints > 0);
  if (touchInput) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

async function dispatchTouchPoint(page: Page, x: number, y: number, identifier: number): Promise<void> {
  await page.evaluate(({ clientX, clientY, touchIdentifier }) => {
    const canvas = document.querySelector<HTMLCanvasElement>("canvas");
    if (canvas === null) throw new Error("Chart canvas is missing");
    const touch = new Touch({ identifier: touchIdentifier, target: canvas, clientX, clientY, screenX: clientX, screenY: clientY, pageX: clientX, pageY: clientY });
    canvas.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [touch], targetTouches: [touch], changedTouches: [touch] }));
    canvas.dispatchEvent(new TouchEvent("touchend", { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [touch] }));
  }, { clientX: x, clientY: y, touchIdentifier: identifier });
}

test("Studio preserves chart type, price scale, indicator, and drawing state through a workspace reload", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Objects" })).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.getByText("Series (10)", { exact: true })).toBeVisible();
  await expect(page.getByText("Indicators (2)", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "OHLC", exact: true }).click();
  await expect(page.getByRole("button", { name: "OHLC", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Heikin-Ashi", exact: true }).click();
  await expect(page.getByRole("button", { name: "Heikin-Ashi", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Price scale").selectOption("logarithmic");
  await expect(page.getByText(/Log price scale applied/)).toBeVisible();

  await page.getByLabel("Indicator").selectOption("EMA");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Indicators (3)", { exact: true })).toBeVisible();

  const canvas = page.locator("canvas");
  // Keep pointer coordinates in the chart viewport after the sidebar select
  // has scrolled the compact Studio layout.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: "Trend", exact: true }).click();
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  await placeChartPoint(page, box.x + box.width * 0.35, box.y + box.height * 0.08);
  await placeChartPoint(page, box.x + box.width * 0.65, box.y + box.height * 0.12);
  await expect(page.getByText("Drawings (1)", { exact: true })).toBeVisible();
  const objectTree = page.getByRole("complementary", { name: "Object tree" });
  await expect(objectTree).toBeVisible();
  await objectTree.getByRole("button", { name: "Lock drawing-1", exact: true }).click();
  await expect(objectTree.getByRole("button", { name: "Unlock drawing-1", exact: true })).toBeVisible();
  await objectTree.getByRole("button", { name: "Hide drawing-1", exact: true }).click();
  await expect(objectTree.getByRole("button", { name: "Show drawing-1", exact: true })).toBeVisible();
  await objectTree.getByRole("button", { name: "Show drawing-1", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const anchorsBeforeLinear = await page.evaluate(() => {
    const workspace = JSON.parse(window.localStorage.getItem("openkline-studio-workspace-v1") ?? "null") as {
      drawings: { drawings: Array<{ points: Array<{ time: number; price: number }> }> };
    };
    return workspace.drawings.drawings[0]?.points;
  });
  expect(anchorsBeforeLinear).toHaveLength(2);
  await page.getByLabel("Price scale").selectOption("linear");
  await page.getByLabel("Theme").selectOption("light");
  await expect(page.getByText(/Light theme applied/)).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const saved = await page.evaluate(() => JSON.parse(window.localStorage.getItem("openkline-studio-workspace-v1") ?? "null") as {
    chart: { priceScale?: { mode?: string }; theme: { background: string } };
    series: Array<{ id: string; style: { visible?: boolean } }>;
    indicators: Array<{ indicatorId: string }>;
    drawings: { drawings: Array<{ points: Array<{ time: number; price: number }> }> };
  });
  expect(saved.chart.priceScale?.mode).toBe("linear");
  expect(saved.chart.theme.background).toBe("#ffffff");
  expect(saved.series.find((series) => series.id === "studio-heikin")?.style.visible).not.toBe(false);
  expect(saved.indicators.some((indicator) => indicator.indicatorId === "EMA")).toBe(true);
  const anchors = saved.drawings.drawings[0]?.points;
  expect(anchors).toHaveLength(2);
  expect(anchors).toEqual(anchorsBeforeLinear);

  await page.reload();
  await expect(page.locator("canvas")).toHaveCount(1);
  await page.getByRole("button", { name: "Load", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Heikin-Ashi", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Price scale")).toHaveValue("linear");
  await expect(page.getByLabel("Theme")).toHaveValue("light");
  await expect(page.getByText("Drawings (1)", { exact: true })).toBeVisible();
  await expect(page.getByText("Indicators (3)", { exact: true })).toBeVisible();
  const restored = await page.evaluate(() => JSON.parse(window.localStorage.getItem("openkline-studio-workspace-v1") ?? "null") as { drawings: { drawings: Array<{ points: Array<{ time: number; price: number }> }> } });
  expect(restored.drawings.drawings[0]?.points).toEqual(anchors);

  await page.setViewportSize({ width: 800, height: 700 });
  await expect(page.locator("canvas")).toBeVisible();
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await expect(page.getByLabel("Price scale")).toHaveValue("linear");
  expect(errors).toEqual([]);
});

test("Studio remains operable at a touch-sized viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /width=device-width/);
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Fit", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Area", exact: true }).click();
  await expect(page.getByRole("button", { name: "Area", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "OHLC", exact: true }).click();
  await expect(page.getByRole("button", { name: "OHLC", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Price scale").selectOption("percentage");
  await expect(page.getByLabel("Price scale")).toHaveValue("percentage");
  await page.getByRole("button", { name: "Enter replay", exact: true }).click();
  await expect(page.getByText("Replay: ready", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Replay next bar", exact: true }).click();
  await expect(page.getByText("Replay: paused", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Exit replay", exact: true }).click();
  await expect(page.getByText("Replay: idle", { exact: true })).toBeVisible();
});

test("Studio accepts drawing anchors from touch events without pointer compatibility events", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => document.querySelector<HTMLCanvasElement>("canvas")?.height ?? 0)).toBeGreaterThan(200);
  await page.getByRole("button", { name: "Trend", exact: true }).click();
  await expect(page.getByText(/trend-line is active in chart-1/)).toBeVisible();
  const canvas = page.locator("canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  await dispatchTouchPoint(page, box.x + box.width * 0.35, box.y + box.height * 0.08, 1);
  await dispatchTouchPoint(page, box.x + box.width * 0.65, box.y + box.height * 0.12, 2);
  await expect(page.getByText("Drawings (1)", { exact: true })).toBeVisible();
});

test("Studio exposes deterministic replay playback controls and restores the workspace", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("canvas")).toHaveCount(1);
  await page.getByLabel("Indicator").selectOption("EMA");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Indicators (3)", { exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  const canvas = page.locator("canvas");
  await page.getByRole("button", { name: "Trend", exact: true }).click();
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  await test.step("place replay drawing anchors with the active input modality", async () => {
    await placeChartPoint(page, box.x + box.width * 0.35, box.y + box.height * 0.08);
    await placeChartPoint(page, box.x + box.width * 0.65, box.y + box.height * 0.12);
  });
  await expect(page.getByText("Drawings (1)", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Enter replay", exact: true }).click();
  await expect(page.getByText("Replay: ready", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Replay position")).toBeEnabled();
  await expect(page.getByText(/85 \/ 240/)).toBeVisible();
  await page.getByRole("button", { name: "Beginning", exact: true }).click();
  await expect(page.getByText(/1 \/ 240/)).toBeVisible();
  await page.getByRole("button", { name: "Latest", exact: true }).click();
  await expect(page.getByText(/240 \/ 240/)).toBeVisible();
  await page.getByLabel("Replay position").fill("84");
  await expect(page.getByText(/85 \/ 240/)).toBeVisible();

  await page.getByRole("button", { name: "Replay next bar", exact: true }).click();
  await expect(page.getByText(/86 \/ 240/)).toBeVisible();
  await canvas.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByText(/85 \/ 240/)).toBeVisible();
  await page.getByRole("button", { name: "Area", exact: true }).click();
  await expect(page.getByRole("button", { name: "Area", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Price scale").selectOption("percentage");
  await page.getByLabel("Replay speed").selectOption("5");
  await expect(page.getByLabel("Replay speed")).toHaveValue("5");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByText("Replay: playing", { exact: true })).toBeVisible();
  await page.getByRole("complementary", { name: "Chart settings" }).getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByText("Replay: paused", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Exit replay", exact: true }).click();
  await expect(page.getByText("Replay: idle", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Enter replay", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Candles", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Price scale")).toHaveValue("linear");
  await expect(page.getByText("Series (11)", { exact: true })).toBeVisible();
  await expect(page.getByText("Indicators (3)", { exact: true })).toBeVisible();
  await expect(page.getByText("Drawings (1)", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Studio creates, pauses, persists, and removes a local alert", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByText("Alerts (0)", { exact: true })).toBeVisible();
  await page.getByLabel("Alert name").fill("Studio close alert");
  await page.getByLabel("Alert threshold").fill("65000");
  await page.getByLabel("Alert frequency").selectOption("once");
  await page.getByRole("button", { name: "Create alert", exact: true }).click();
  await expect(page.getByText("Alerts (1)", { exact: true })).toBeVisible();
  await expect(page.getByText("Studio close alert", { exact: false })).toBeVisible();
  await page.getByRole("complementary", { name: "Chart settings" }).getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("button", { name: "Enable", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const saved = await page.evaluate(() => JSON.parse(window.localStorage.getItem("openkline-studio-workspace-v1") ?? "null") as { alerts?: { alerts: Array<{ name: string }> } });
  expect(saved.alerts?.alerts).toEqual([{ id: expect.any(String), name: "Studio close alert", condition: { type: "price-cross-above", field: "close", value: 65000 }, frequency: "once", enabled: false }]);
  await page.getByRole("button", { name: "Remove Studio close alert", exact: true }).click();
  await expect(page.getByText("Alerts (0)", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Studio provides KlineScript templates, diagnostics, autocomplete, local save, and Worker runtime status", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "KlineScript", exact: true }).click();
  await expect(page.getByRole("region", { name: "KlineScript editor" })).toBeVisible();
  const source = page.getByLabel("KlineScript source");
  await expect(source).toHaveValue(/Studio EMA/);
  await page.getByLabel("KlineScript template").selectOption({ label: "Pointwise close" });
  await expect(source).toHaveValue(/Pointwise close/);
  await source.fill('indicator("Broken")\nplot(eval(close))');
  await expect(page.getByText("KS3063", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run in Worker", exact: true })).toBeDisabled();
  await source.fill('indicator("Worker Studio")\nplot(close)');
  await source.press("Control+Space");
  await expect(page.getByRole("listbox", { name: "KlineScript completions" })).toBeVisible();
  await page.getByRole("button", { name: "Save local", exact: true }).click();
  await expect(page.getByText("My KlineScript", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Run in Worker", exact: true }).click();
  await expect(page.getByText("Runtime: ready", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Indicators (3)", { exact: true })).toBeVisible();
  await expect(page.getByText(/Added Worker-backed KlineScript/)).toBeVisible();
  await page.getByRole("button", { name: "Delete My KlineScript", exact: true }).click();
  await expect(page.getByText("My KlineScript", { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});
