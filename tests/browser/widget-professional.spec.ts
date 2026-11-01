import { expect, test, type Page } from "@playwright/test";
import type { InternalWidget } from "../../src/widget/types.js";

type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
type WidgetGlobals = typeof globalThis & { __openklineWidget?: InternalWidget; __openklineHost?: HTMLElement };

const candles: Candle[] = Array.from({ length: 48 }, (_, index) => {
  const close = 100 + Math.sin(index / 4) * 2 + index * 0.25;
  return {
    time: Date.UTC(2026, 0, 1) + index * 60_000,
    open: close - 0.4,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1_000 + index * 10,
  };
});

async function createWidget(page: Page, input: Candle[] = candles): Promise<void> {
  await page.goto("/examples/vanilla/index.html");
  await page.evaluate(async (inputCandles) => {
    const moduleUrl = new URL("/dist/src/widget/index.js", location.href).href;
    const { createOpenKlineWidget } = await import(moduleUrl);
    const host = document.createElement("div");
    host.style.cssText = "width: min(760px, 100vw); height: 480px";
    document.body.append(host);
    const widget = createOpenKlineWidget({
      container: host,
      data: inputCandles,
      dataIdentity: { symbol: "BTC-USD", timeframe: "1h" },
      chartOptions: { autoSize: true, theme: "light", direction: "ltr" },
    });
    const globals = globalThis as WidgetGlobals;
    globals.__openklineWidget = widget;
    globals.__openklineHost = host;
  }, input);
}

test("professional widget exposes behavioral indicator, drawing, object, property, and settings workflows", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The complete pointer-drawing workflow is verified in desktop Chromium");
  await createWidget(page);

  const indicatorTrigger = page.locator('[data-openkline-panel-trigger="indicator-explorer"]');
  await indicatorTrigger.click();
  const indicatorPanel = page.locator('[data-openkline-panel="indicator-explorer"]');
  await expect(indicatorPanel.locator('[data-openkline-panel-close]')).toBeFocused();
  await expect(indicatorPanel).toHaveAttribute("aria-modal", "true");
  await page.keyboard.press("Escape");
  await expect(indicatorTrigger).toBeFocused();
  await expect(indicatorPanel).toBeHidden();
  await indicatorTrigger.click();
  await indicatorPanel.locator('[data-openkline-panel-search]').fill("Bollinger");
  await expect(indicatorPanel.locator('[data-openkline-indicator-action="select"]')).toHaveCount(1);
  await indicatorPanel.locator('[data-openkline-indicator-action="select"]').click();
  await indicatorPanel.locator('[data-openkline-indicator-action="add"]').click();
  await expect(indicatorPanel.locator('[data-openkline-indicator-active]')).toContainText("BOLLINGER_BANDS");

  await indicatorPanel.locator('[data-openkline-panel-search]').fill("SMA");
  await indicatorPanel.locator('[data-openkline-indicator-action="select"]').click();
  const period = indicatorPanel.locator('[data-openkline-indicator-parameter="period"]');
  await period.fill("0");
  await indicatorPanel.locator('[data-openkline-indicator-action="add"]').click();
  const invalidState = await page.evaluate(() => (globalThis as WidgetGlobals).__openklineWidget!.getState());
  expect(invalidState.status).toBe("error");
  await period.fill("10");
  await indicatorPanel.locator('[data-openkline-indicator-action="add"]').click();
  await indicatorPanel.locator('[data-openkline-indicator-action="edit"]').last().click();
  await period.fill("12");
  await indicatorPanel.locator('[data-openkline-indicator-action="update"]').click();
  const afterIndicatorUpdate = await page.evaluate(() => {
    const widget = (globalThis as WidgetGlobals).__openklineWidget!;
    return { state: widget.getState(), series: widget.getChart().getSeriesInfo() };
  });
  expect(afterIndicatorUpdate.state.status, afterIndicatorUpdate.state.error ?? "no widget error").toBe("ready");
  expect(afterIndicatorUpdate.series.some((series) => series.id.includes(":value"))).toBe(true);
  await indicatorPanel.locator('[data-openkline-indicator-action="remove"]').last().click();
  await expect(indicatorPanel.locator('[data-openkline-indicator-active]')).toContainText("BOLLINGER_BANDS");

  const drawingTrigger = page.locator('[data-openkline-panel-trigger="drawing-toolbar"]');
  await drawingTrigger.click();
  const drawingPanel = page.locator('[data-openkline-panel="drawing-toolbar"]');
  await drawingPanel.locator('[data-openkline-drawing-tool="trend-line"]').click();
  await drawingPanel.locator('[data-openkline-drawing-action="cancel"]').click();
  await expect(drawingPanel.locator('[data-openkline-drawing-tool][data-active="true"]')).toHaveCount(0);

  await drawingPanel.locator('[data-openkline-drawing-tool="trend-line"]').click();
  const canvas = page.locator('[data-openkline-chart] canvas').first();
  const box = await canvas.boundingBox();
  if (box === null) throw new Error("Widget canvas was not laid out");
  await page.mouse.click(box.x + 120, box.y + box.height * 0.35);
  await page.mouse.click(box.x + 300, box.y + box.height * 0.6);
  const drawingCount = await page.evaluate(() => (globalThis as WidgetGlobals).__openklineWidget!.getChart().getDrawings().length);
  expect(drawingCount).toBe(1);

  const objectTrigger = page.locator('[data-openkline-panel-trigger="object-tree"]');
  await objectTrigger.click();
  const objectPanel = page.locator('[data-openkline-panel="object-tree"]');
  await expect(objectPanel.locator('[data-openkline-object-kind="drawing"]')).toHaveCount(1);
  await objectPanel.locator('[data-openkline-object-kind="drawing"] [data-openkline-object-action="drawing-select"]').click();

  const propertiesTrigger = page.locator('[data-openkline-panel-trigger="drawing-properties"]');
  await propertiesTrigger.click();
  const propertiesPanel = page.locator('[data-openkline-panel="drawing-properties"]');
  await propertiesPanel.locator('[data-openkline-drawing-property="lineWidth"]').fill("3");
  await propertiesPanel.locator('[data-openkline-drawing-property="locked"]').check();
  await propertiesPanel.locator('[data-openkline-drawing-action="apply-properties"]').click();
  const styledDrawing = await page.evaluate(() => {
    const drawing = (globalThis as WidgetGlobals).__openklineWidget!.getChart().getDrawings()[0];
    if (drawing === undefined) throw new Error("Selected drawing disappeared");
    return drawing;
  });
  expect(styledDrawing.style.lineWidth).toBe(3);
  expect(styledDrawing.style.locked).toBe(true);

  const settingsTrigger = page.locator('[data-openkline-panel-trigger="chart-settings"]');
  await settingsTrigger.click();
  const settingsPanel = page.locator('[data-openkline-panel="chart-settings"]');
  await settingsPanel.locator('[data-openkline-setting="theme"]').selectOption("dark");
  await settingsPanel.locator('[data-openkline-setting="direction"]').selectOption("rtl");
  await settingsPanel.locator('[data-openkline-setting="priceScaleMode"]').selectOption("percentage");
  await settingsPanel.locator('[data-openkline-settings-action="apply"]').click();
  const settingsState = await page.evaluate(() => {
    const widget = (globalThis as WidgetGlobals).__openklineWidget!;
    return { state: widget.getState(), priceScale: widget.getChart().getPriceScaleOptions() };
  });
  expect(settingsState.state).toMatchObject({ theme: "dark", direction: "rtl" });
  expect(settingsState.priceScale.mode).toBe("percentage");

  const diagnostics = await page.evaluate(() => {
    const globals = globalThis as WidgetGlobals;
    const widget = globals.__openklineWidget!;
    const host = globals.__openklineHost!;
    const before = widget.getDiagnostics();
    widget.destroy();
    return { before, after: widget.getDiagnostics(), hostChildren: host.children.length };
  });
  expect(diagnostics.before.domListeners).toBeGreaterThan(0);
  expect(diagnostics.after).toMatchObject({ destroyed: true, domListeners: 0, chartSubscriptions: 0, canvasCount: 0 });
  expect(diagnostics.hostChildren).toBe(0);
});

test("professional widget panels remain isolated across instances and datafeed transitions", async ({ page }) => {
  await page.goto("/examples/vanilla/index.html");
  const result = await page.evaluate(async (inputCandles) => {
    const moduleUrl = new URL("/dist/src/widget/index.js", location.href).href;
    const { createOpenKlineWidget } = await import(moduleUrl);
    const baselineCanvases = document.querySelectorAll("canvas").length;
    const firstHost = document.createElement("div");
    const secondHost = document.createElement("div");
    for (const host of [firstHost, secondHost]) {
      host.style.cssText = "width: 360px; height: 320px";
      document.body.append(host);
    }
    const first = createOpenKlineWidget({ container: firstHost, data: inputCandles, dataIdentity: { symbol: "ONE", timeframe: "1m" } });
    const second = createOpenKlineWidget({ container: secondHost, data: inputCandles, dataIdentity: { symbol: "TWO", timeframe: "5m" } });
    const feed = {
      async resolveSymbol(symbol: string) { return { symbol, timezone: "UTC", pricePrecision: 2 }; },
      async getBars() { return inputCandles; },
      subscribeBars() { return () => undefined; },
    };
    await first.setDatafeed(feed, { symbol: "ONE-FEED", timeframe: "15m", from: 0, to: Number.MAX_SAFE_INTEGER });
    const firstPanelCount = firstHost.querySelectorAll('[data-openkline-panel-trigger]').length;
    const secondPanelCount = secondHost.querySelectorAll('[data-openkline-panel-trigger]').length;
    const secondState = second.getState();
    first.destroy();
    const secondDiagnostics = second.getDiagnostics();
    second.destroy();
    return { firstPanelCount, secondPanelCount, secondState, secondDiagnostics, canvases: document.querySelectorAll("canvas").length, baselineCanvases };
  }, candles);
  expect(result.firstPanelCount).toBe(9);
  expect(result.secondPanelCount).toBe(9);
  expect(result.secondState).toMatchObject({ symbol: "TWO", timeframe: "5m", status: "ready" });
  expect(result.secondDiagnostics.canvasCount).toBe(1);
  expect(result.canvases).toBe(result.baselineCanvases);
});

test("professional widget toolbar is touch-usable and responsive in mobile Chrome", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chrome", "Touch emulation is verified in the mobile Chrome project");
  await createWidget(page);
  for (const key of ["indicator-explorer", "drawing-toolbar", "object-tree", "drawing-properties", "chart-settings"]) {
    const trigger = page.locator(`[data-openkline-panel-trigger="${key}"]`);
    await trigger.tap();
    const panel = page.locator(`[data-openkline-panel="${key}"]`);
    await expect(panel).toBeVisible();
    if (key === "indicator-explorer") expect(await panel.locator('[data-openkline-indicator-action="select"]').count()).toBeGreaterThan(0);
    if (key === "drawing-toolbar") expect(await panel.locator('[data-openkline-drawing-tool]').count()).toBeGreaterThan(0);
    if (key === "object-tree") expect(await panel.locator('[data-openkline-object-row]').count()).toBeGreaterThan(0);
    if (key === "drawing-properties") await expect(panel).toContainText("Select a drawing");
    await panel.locator('[data-openkline-panel-close]').click();
  }
  const layout = await page.evaluate(() => {
    const root = (globalThis as WidgetGlobals).__openklineHost!.firstElementChild?.getBoundingClientRect();
    return { width: root?.width ?? 0, viewport: window.innerWidth };
  });
  expect(layout.width).toBeLessThanOrEqual(layout.viewport + 1);
  await page.evaluate(() => (globalThis as WidgetGlobals).__openklineWidget!.destroy());
});
