import { expect, test } from "@playwright/test";

test("renders provider-neutral order flow, preserves replay causality, and cleans up", async ({ page }) => {
  await page.goto("/examples/vanilla/index.html");
  const result = await page.evaluate(async () => {
    const moduleUrl = new URL("/dist/src/index.js", location.href).href;
    const { createChart } = await import(moduleUrl);
    const host = document.createElement("div");
    host.style.width = "640px";
    host.style.height = "360px";
    document.body.append(host);
    const chart = createChart(host, { autoSize: false, width: 640, height: 360 });
    const start = Date.UTC(2026, 0, 2);
    const candles = Array.from({ length: 6 }, (_, index) => ({
      time: start + index * 60_000,
      open: 100 + index,
      high: 101 + index,
      low: 99 + index,
      close: 100.5 + index,
      volume: 10,
    }));
    const trades = [
      { id: "t-1", instrumentId: "TEST", time: start, price: 100, quantity: 3, aggressorSide: "buy" as const, source: { id: "fixture-trades", version: "1" } },
      { id: "t-2", instrumentId: "TEST", time: start + 30_000, price: 100, quantity: 2, aggressorSide: "sell" as const, source: { id: "fixture-trades", version: "1" } },
      { id: "t-3", instrumentId: "TEST", time: start + 90_000, price: 101, quantity: 4, aggressorSide: "unknown" as const, source: { id: "fixture-trades", version: "1" } },
      { id: "t-4", instrumentId: "TEST", time: start + 120_000, price: 102, quantity: 5, aggressorSide: "buy" as const, source: { id: "fixture-trades", version: "1" } },
    ];
    chart.setData(candles);
    chart.setMarketTrades(trades);
    chart.setFootprintOptions({ visible: true, tickSize: 1, intervalMs: 60_000, offTickPolicy: "reject" });
    chart.setCvdOptions({ visible: true, intervalMs: 60_000, pane: "new" });
    chart.setDepthOptions({ visible: true, showHeatmap: true, maxLevels: 5 });
    chart.setOrderBookSnapshot({
      version: 1,
      instrumentId: "TEST",
      time: start,
      sequence: 1,
      bids: [{ price: 99.5, quantity: 100 }, { price: 99, quantity: 50 }],
      asks: [{ price: 100.5, quantity: 80 }, { price: 101, quantity: 40 }],
      tickSize: 0.5,
      source: { id: "fixture-depth", version: "1" },
    });
    chart.fitContent();
    chart.applyOrderBookDelta({
      version: 1,
      id: "d-2",
      instrumentId: "TEST",
      time: start + 60_000,
      sequence: 2,
      previousSequence: 1,
      quantityMode: "delta",
      bids: [{ price: 99.5, quantity: 10 }],
      asks: [{ price: 100.5, quantity: -5 }],
      source: { id: "fixture-depth", version: "1" },
    });
    const state = chart.getOrderFlowState();
    const workspace = chart.serializeWorkspace();
    const seriesBeforeReplay = chart.getSeriesIds();
    const replay = chart.createReplay({ source: candles, startAt: candles[0]!.time });
    replay.start();
    const before = chart.getOrderFlowState().tradeCount;
    replay.seekToBar(1);
    const after = chart.getOrderFlowState().tradeCount;
    replay.exit();
    const restored = chart.getOrderFlowState().tradeCount;
    const visible = chart.getVisibleTimeRange();
    chart.destroy();
    const remainingCanvases = host.querySelectorAll("canvas").length;
    host.remove();
    return {
      state: {
        tradeCount: state.tradeCount,
        footprintTrades: state.footprint?.tradeCount,
        cvd: state.cvd?.currentValue,
        bestBid: state.depthMetrics?.bestBid,
        askDepth: state.depthMetrics?.askDepth,
        quality: state.depthMetrics?.quality,
      },
      visible,
      workspace: { hasOrderFlow: workspace.orderFlow !== undefined, hasDerivedCvdSeries: (workspace.series as Array<{ id: string }>).some((item: { id: string }) => item.id === "openkline.cvd") },
      seriesBeforeReplay,
      replayCounts: { before, after, restored },
      remainingCanvases,
    };
  });

  expect(result.state).toMatchObject({ tradeCount: 4, footprintTrades: 4, cvd: 6, bestBid: 99.5, askDepth: 115, quality: "available" });
  expect(result.workspace).toEqual({ hasOrderFlow: true, hasDerivedCvdSeries: false });
  expect(result.seriesBeforeReplay).toContain("openkline.cvd");
  expect(result.replayCounts.before).toBe(1);
  expect(result.replayCounts.after).toBe(2);
  expect(result.replayCounts.restored).toBe(4);
  expect(result.remainingCanvases).toBe(0);
});
