import { expect, test, type Page } from "@playwright/test";
import type { InternalWidget } from "../../src/widget/types.js";

type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
type WidgetGlobals = typeof globalThis & { __openklineWidget?: InternalWidget; __openklineHost?: HTMLElement };

function makeCandles(count: number, offset = 0): Candle[] {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + offset + Math.sin(index / 4) * 2 + index * 0.25;
    return {
      time: Date.UTC(2026, 0, 1) + index * 60_000,
      open: close - 0.4,
      high: close + 1,
      low: close - 1,
      close,
      volume: 1_000 + index * 10,
    };
  });
}

async function createWidget(page: Page, layout: "single" | "two-horizontal" | "two-vertical" | "four-grid" = "single"): Promise<void> {
  await page.goto("/examples/vanilla/index.html");
  await page.evaluate(async ({ inputCandles, layoutValue }) => {
    const moduleUrl = new URL("/dist/src/widget/index.js", location.href).href;
    const { createOpenKlineWidget } = await import(moduleUrl);
    const host = document.createElement("div");
    host.style.cssText = "width: min(960px, 100vw); height: 640px";
    document.body.append(host);
    const widget = createOpenKlineWidget({
      container: host,
      layout: layoutValue,
      data: inputCandles,
      dataIdentity: { symbol: "BTC-USD", timeframe: "1m" },
      chartOptions: { autoSize: true, theme: "light", direction: "ltr" },
      synchronization: { enabled: false, crosshair: false, visibleRange: false },
    });
    const globals = globalThis as WidgetGlobals;
    globals.__openklineWidget = widget;
    globals.__openklineHost = host;
  }, { inputCandles: makeCandles(48), layoutValue: layout });
}

test("multi-chart layouts preserve independent chart state and dispose cleanly", async ({ page }, testInfo) => {
  test.skip(!["chromium", "firefox"].includes(testInfo.project.name), "Multi-chart workflows are verified on desktop Chromium/Firefox");
  await createWidget(page, "single");

  const afterTwo = await page.evaluate(async (candles) => {
    const widget = (globalThis as WidgetGlobals).__openklineWidget!;
    widget.setLayout("two-horizontal");
    const charts = widget.getCharts();
    const secondId = [...charts.keys()].find((id) => id !== widget.getActiveChartId())!;
    widget.setActiveChartId(secondId);
    widget.setData(candles, { symbol: "ETH-USD", timeframe: "5m" });
    widget.addIndicator("SMA", { pane: "main", period: 8 });
    widget.startDrawing("trend-line", { snap: "visible-ohlc" });
    return {
      layout: widget.getLayout(),
      active: widget.getActiveChartId(),
      chartCount: charts.size,
      first: widget.getState().charts.find((chart) => chart.id === "chart-1"),
      second: widget.getState().charts.find((chart) => chart.id === "chart-2"),
    };
  }, makeCandles(48, 20));
  expect(afterTwo.layout).toBe("two-horizontal");
  expect(afterTwo.chartCount).toBe(2);
  expect(afterTwo.first).toMatchObject({ symbol: "BTC-USD", timeframe: "1m" });
  expect(afterTwo.second).toMatchObject({ symbol: "ETH-USD", timeframe: "5m", active: true });

  await page.locator('[data-openkline-chart-slot="chart-1"]').click();
  const activeAfterClick = await page.evaluate(() => (globalThis as WidgetGlobals).__openklineWidget!.getActiveChartId());
  expect(activeAfterClick).toBe("chart-1");

  const four = await page.evaluate(() => {
    const widget = (globalThis as WidgetGlobals).__openklineWidget!;
    widget.setLayout("four-grid");
    widget.setLayout("two-vertical");
    widget.setLayout("four-grid");
    return {
      layout: widget.getLayout(),
      ids: [...widget.getCharts().keys()],
      restored: widget.getState().charts.find((chart) => chart.id === "chart-2"),
    };
  });
  expect(four.layout).toBe("four-grid");
  expect(four.ids).toEqual(["chart-1", "chart-2", "chart-3", "chart-4"]);
  expect(four.restored).toMatchObject({ symbol: "ETH-USD", timeframe: "5m" });

  const composition = await page.evaluate(() => {
    const widget = (globalThis as WidgetGlobals).__openklineWidget!;
    const exported = widget.exportComposition();
    widget.setLayout("single");
    widget.importComposition(exported);
    return {
      layout: widget.getLayout(),
      active: widget.getActiveChartId(),
      charts: widget.getState().charts.map((chart) => ({ id: chart.id, symbol: chart.symbol, timeframe: chart.timeframe })),
    };
  });
  expect(composition.layout).toBe("four-grid");
  expect(composition.charts).toHaveLength(4);

  const cleanup = await page.evaluate(() => {
    const globals = globalThis as WidgetGlobals;
    const host = globals.__openklineHost!;
    const beforeHost = host.querySelectorAll("canvas").length;
    const beforeDiagnostics = globals.__openklineWidget!.getDiagnostics();
    globals.__openklineWidget!.destroy();
    return {
      beforeHost,
      afterHost: host.querySelectorAll("canvas").length,
      hostChildren: host.children.length,
      beforeDiagnostics,
      afterDiagnostics: globals.__openklineWidget!.getDiagnostics(),
    };
  });
  expect(cleanup.beforeHost).toBeGreaterThan(0);
  expect(cleanup.afterHost).toBe(0);
  expect(cleanup.hostChildren).toBe(0);
  expect(cleanup.afterDiagnostics).toMatchObject({ destroyed: true, canvasCount: 0, chartCount: 0 });
});

test("synchronization, watchlist, comparison, and replay panels stay chart-scoped", async ({ page }, testInfo) => {
  test.skip(!["chromium", "firefox"].includes(testInfo.project.name), "Advanced panel workflows are verified on desktop Chromium/Firefox");
  await createWidget(page, "two-horizontal");

  const syncTrigger = page.locator('[data-openkline-panel-trigger="synchronization"]');
  await syncTrigger.click();
  const syncPanel = page.locator('[data-openkline-panel="synchronization"]');
  await syncPanel.locator('[data-openkline-sync-option="enabled"]').check();
  await syncPanel.locator('[data-openkline-sync-option="crosshair"]').check();
  await syncPanel.locator('[data-openkline-sync-option="visibleRange"]').check();
  const syncState = await page.evaluate(() => (globalThis as WidgetGlobals).__openklineWidget!.getSynchronization());
  expect(syncState).toEqual({ enabled: true, crosshair: true, visibleRange: true });
  await page.keyboard.press("Escape");

  const watchlistTrigger = page.locator('[data-openkline-panel-trigger="watchlist"]');
  await watchlistTrigger.click();
  const watchlistPanel = page.locator('[data-openkline-panel="watchlist"]');
  await watchlistPanel.locator('[data-openkline-watchlist-input="symbol"]').fill("SOL-USD");
  await watchlistPanel.locator('[data-openkline-watchlist-action="add"]').click();
  await expect(watchlistPanel.locator('[data-openkline-watchlist-row]')).toHaveCount(1);
  const offlineSelect = await page.evaluate(async () => {
    const widget = (globalThis as WidgetGlobals).__openklineWidget!;
    try {
      await widget.setSymbol("SOL-USD");
      return { ok: true, error: null as string | null };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  expect(offlineSelect.ok).toBe(false);
  expect(offlineSelect.error).toMatch(/Cannot change symbol|Datafeed|replacement/i);
  await page.keyboard.press("Escape");

  const comparison = await page.evaluate((candles) => {
    const widget = (globalThis as WidgetGlobals).__openklineWidget!;
    widget.addComparisonAsset("ETH", candles, { label: "ETH" });
    widget.setComparisonMode("indexed");
    widget.setComparisonBaseline(candles[0]!.time, { maxAgeMs: 0 });
    const series = widget.getChart().getSeriesIds().filter((id) => id.startsWith("widget-comparison-"));
    widget.clearComparison();
    const after = widget.getChart().getSeriesIds().filter((id) => id.startsWith("widget-comparison-"));
    return { seriesCount: series.length, afterCount: after.length };
  }, makeCandles(48, 5));
  expect(comparison.seriesCount).toBeGreaterThan(0);
  expect(comparison.afterCount).toBe(0);

  const replayTrigger = page.locator('[data-openkline-panel-trigger="replay"]');
  await replayTrigger.click();
  const replayPanel = page.locator('[data-openkline-panel="replay"]');
  await replayPanel.locator('[data-openkline-replay-action="enter"]').click();
  await replayPanel.locator('[data-openkline-replay-action="step-forward"]').click();
  const replayStatus = await page.evaluate(() => {
    const widget = (globalThis as WidgetGlobals).__openklineWidget!;
    const status = widget.getReplay()?.getStatus() ?? null;
    const other = [...widget.getCharts().entries()].find(([id]) => id !== widget.getActiveChartId())?.[1];
    return {
      active: status?.state,
      index: status?.currentIndex,
      otherHasReplay: other !== undefined && (widget as unknown as { slots?: unknown }).constructor !== undefined
        ? status !== null
        : true,
      independent: widget.getState().charts.every((chart) => chart.id === widget.getActiveChartId() || chart.replay === null),
    };
  });
  expect(replayStatus.active === "ready" || replayStatus.active === "paused" || replayStatus.active === "playing").toBe(true);
  expect(replayStatus.independent).toBe(true);
  await replayPanel.locator('[data-openkline-replay-action="exit"]').click();
  await page.evaluate(() => (globalThis as WidgetGlobals).__openklineWidget!.destroy());
});

test("multi-chart responsive layout remains usable under mobile chrome", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chrome", "Touch/responsive multi-chart coverage uses Mobile Chrome");
  await createWidget(page, "two-horizontal");
  await page.locator('[data-openkline-panel-trigger="watchlist"]').tap();
  const panel = page.locator('[data-openkline-panel="watchlist"]');
  await expect(panel).toBeVisible();
  await panel.locator('[data-openkline-panel-close]').click();
  await expect(panel).toBeHidden();
  const layout = await page.evaluate(() => {
    const widget = (globalThis as WidgetGlobals).__openklineWidget!;
    widget.setLayout("four-grid");
    const root = (globalThis as WidgetGlobals).__openklineHost!.firstElementChild?.getBoundingClientRect();
    return { width: root?.width ?? 0, viewport: window.innerWidth, charts: widget.getCharts().size };
  });
  expect(layout.charts).toBe(4);
  expect(layout.width).toBeLessThanOrEqual(layout.viewport + 1);
  await page.evaluate(() => (globalThis as WidgetGlobals).__openklineWidget!.destroy());
});
