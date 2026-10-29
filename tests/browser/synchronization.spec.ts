import { expect, test } from "@playwright/test";

test("public chart synchronization follows UTC timestamps and cleans up registrations", async ({ page }) => {
  await page.goto("/examples/vanilla/index.html");
  const result = await page.evaluate(async () => {
    const moduleUrl: string = "/dist/src/index.js";
    const module = await import(moduleUrl);
    const ChartSynchronizationController = module.ChartSynchronizationController as typeof import("../../src/synchronization.js").ChartSynchronizationController;
    const createChart = module.createChart as typeof import("../../src/chart.js").createChart;
    const firstRoot = document.createElement("div");
    const secondRoot = document.createElement("div");
    firstRoot.style.cssText = "width: 400px; height: 240px";
    secondRoot.style.cssText = "width: 400px; height: 240px";
    document.body.append(firstRoot, secondRoot);
    const first = createChart(firstRoot, { width: 400, height: 240 });
    const second = createChart(secondRoot, { width: 400, height: 240 });
    const firstSeries = first.addCandlestickSeries({ id: "first" });
    const secondSeries = second.addCandlestickSeries({ id: "second" });
    const candle = (time: number, close: number) => ({ time, open: close - 1, high: close + 1, low: close - 2, close, volume: 1 });
    firstSeries.setData([candle(1_000, 10), candle(2_000, 11), candle(3_000, 12), candle(4_000, 13)]);
    secondSeries.setData([candle(1_000, 20), candle(3_000, 21), candle(5_000, 22)]);
    const controller = new ChartSynchronizationController({ crosshair: true, visibleRange: true });
    controller.addChart("first", first);
    controller.addChart("second", second);
    const linkedCrosshairs: Array<number | null> = [];
    const unsubscribe = second.subscribe("crosshairMove", (event) => linkedCrosshairs.push(event.time));
    first.setCrosshairAtTime(2_600);
    first.setVisibleTimeRange({ from: 1_000, to: 4_000 });
    const synchronized = {
      linkedCrosshair: linkedCrosshairs.at(-1) ?? null,
      visibleRange: second.getVisibleTimeRange(),
      firstData: first.getData().map((item) => item.time),
      secondData: second.getData().map((item) => item.time),
    };
    const replay = second.createReplay({ source: second.getData(), startAt: 3_000 });
    replay.start();
    first.setCrosshairAtTime(4_000);
    const replayLinkedCrosshair = linkedCrosshairs.at(-1) ?? null;
    replay.exit();
    replay.dispose();
    controller.removeChart("second");
    first.setCrosshairAtTime(1_000);
    const afterRemovalEvents = linkedCrosshairs.length;
    unsubscribe();
    controller.destroy();
    first.destroy();
    second.destroy();
    return { synchronized, replayLinkedCrosshair, afterRemovalEvents, remainingCanvases: document.querySelectorAll("canvas").length, remainingOwnedCanvases: firstRoot.querySelectorAll("canvas").length + secondRoot.querySelectorAll("canvas").length };
  });

  expect(result.synchronized).toMatchObject({
    linkedCrosshair: 3_000,
    visibleRange: { from: 1_000, to: 3_000 },
    firstData: [1_000, 2_000, 3_000, 4_000],
    secondData: [1_000, 3_000, 5_000],
  });
  expect(result.replayLinkedCrosshair).toBe(3_000);
  expect(result.afterRemovalEvents).toBe(2);
  expect(result.remainingOwnedCanvases).toBe(0);
});

test("bidirectional synchronization invalidates stale target caches", async ({ page }) => {
  await page.goto("/examples/vanilla/index.html");
  const result = await page.evaluate(async () => {
    const moduleUrl: string = "/dist/src/index.js";
    const module = await import(moduleUrl);
    const ChartSynchronizationController = module.ChartSynchronizationController as typeof import("../../src/synchronization.js").ChartSynchronizationController;
    const createChart = module.createChart as typeof import("../../src/chart.js").createChart;
    const roots = [document.createElement("div"), document.createElement("div")];
    roots.forEach((root) => {
      root.style.cssText = "width: 400px; height: 240px";
      document.body.append(root);
    });
    const charts = roots.map((root) => createChart(root, { width: 400, height: 240, interaction: { crosshair: true } }));
    const candle = (time: number, close: number) => ({ time, open: close - 1, high: close + 1, low: close - 2, close, volume: 1 });
    charts.forEach((chart, chartIndex) => {
      const series = chart.addCandlestickSeries({ id: `series-${chartIndex}` });
      series.setData([1_000, 2_000, 3_000, 4_000].map((time) => candle(time, 10 + chartIndex + time / 1_000)));
    });
    const controller = new ChartSynchronizationController({ crosshair: true, visibleRange: true });
    controller.addChart("first", charts[0]!);
    controller.addChart("second", charts[1]!);
    const crosshairEvents: Array<number | null> = [];
    const ranges: Array<{ from: number; to: number }> = [];
    const unsubscribeCrosshair = charts[1]!.subscribe("crosshairMove", (event) => crosshairEvents.push(event.time));
    const unsubscribeRange = charts[1]!.subscribe("viewportChange", (range) => ranges.push({ ...range }));

    charts[0]!.setCrosshairAtTime(1_000);
    charts[1]!.setCrosshairAtTime(3_000);
    charts[0]!.setCrosshairAtTime(1_000);
    charts[0]!.setVisibleTimeRange({ from: 1_000, to: 2_000 });
    charts[1]!.setVisibleTimeRange({ from: 3_000, to: 4_000 });
    charts[0]!.setVisibleTimeRange({ from: 1_000, to: 2_000 });

    const output = { crosshairEvents, ranges, finalRange: charts[1]!.getVisibleTimeRange() };
    unsubscribeCrosshair();
    unsubscribeRange();
    controller.destroy();
    charts.forEach((chart) => chart.destroy());
    roots.forEach((root) => root.remove());
    return { ...output, remainingCanvases: roots.reduce((total, root) => total + root.querySelectorAll("canvas").length, 0) };
  });

  expect(result.crosshairEvents).toEqual([1_000, 3_000, 1_000]);
  expect(result.ranges).toEqual([
    { from: 0, to: 2 },
    { from: 2, to: 4 },
    { from: 0, to: 2 },
  ]);
  expect(result.finalRange).toEqual({ from: 1_000, to: 2_000 });
  expect(result.remainingCanvases).toBe(0);
});
