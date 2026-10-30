import { expect, test } from "@playwright/test";

test("multi-timeframe indicators and previous levels remain causal through correction, replay, and workspace restore", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/examples/vanilla/index.html");
  await page.waitForFunction(() => Boolean((globalThis as { __openklineChart?: unknown }).__openklineChart));

  const result = await page.evaluate(() => {
    type Candle = { time: number; open: number; high: number; low: number; close: number; volume?: number };
    type OutputPoint = { value: number | null; availableAt: number | null; bucketStart: number; bucketEnd: number };
    type Chart = {
      getData(): Candle[];
      setData(candles: Candle[]): void;
      update(candle: Candle): void;
      addMultiTimeframeIndicator(options: object): { id: string; getResult(): { outputs: Array<{ points: OutputPoint[] }> }; setVisible(visible: boolean): void; remove(): void };
      addMultiTimeframeReference(options: object): { id: string; getResult(): { points: Array<{ levels: Record<string, number>; availableAt: number | null }> }; setVisible(visible: boolean): void; remove(): void };
      getSeriesInfo(): Array<{ id: string; style: { visible?: boolean }; dataLength: number }>;
      serializeWorkspace(): { multiTimeframe?: { indicators: Array<{ id: string }>; references: Array<{ id: string }> } };
      restoreWorkspace(document: object): void;
      createReplay(options: object): { start(): void; stepForward(): void; exit(): void; dispose(): void };
      destroy(): void;
    };
    const chart = (globalThis as unknown as { __openklineChart: Chart }).__openklineChart;
    const source = chart.getData();
    chart.setData(source);
    const indicator = chart.addMultiTimeframeIndicator({ id: "browser-mtf-sma", indicatorId: "SMA", sourceTimeframe: "1h", targetTimeframe: "4h", coveragePolicy: "fixed-duration", finalityPolicy: "complete-only", parameters: { period: 2 }, pane: "main" });
    const reference = chart.addMultiTimeframeReference({ id: "browser-mtf-levels", sourceTimeframe: "1h", targetTimeframe: "4h", coveragePolicy: "fixed-duration", finalityPolicy: "complete-only", labels: true });
    const initial = indicator.getResult();
    const initialPoints = initial.outputs[0]?.points ?? [];
    const firstAvailable = initialPoints.find((point) => point.availableAt !== null);
    const initialReference = reference.getResult().points;

    const correction = source[11];
    if (correction === undefined) throw new Error("Fixture has no correction candle");
    chart.update({ ...correction, close: correction.close + 10, high: correction.high + 10 });
    const corrected = indicator.getResult().outputs[0]?.points ?? [];

    const workspace = chart.serializeWorkspace();
    chart.restoreWorkspace(workspace);
    const restored = chart.serializeWorkspace().multiTimeframe;
    const replay = chart.createReplay({ source, startAt: source[10]!.time, speed: 100 });
    replay.start();
    const replayPoints = chart.getSeriesInfo().find((series) => series.id === "browser-mtf-sma:value")?.dataLength ?? 0;
    replay.stepForward();
    const replayAfterStep = chart.getSeriesInfo().find((series) => series.id === "browser-mtf-sma:value")?.dataLength ?? 0;
    replay.exit();
    const afterReplay = chart.getSeriesInfo().find((series) => series.id === "browser-mtf-sma:value")?.dataLength ?? 0;
    indicator.setVisible(false);
    const hidden = chart.getSeriesInfo().find((series) => series.id === "browser-mtf-sma:value")?.style.visible;
    reference.setVisible(false);
    const referenceAfterHide = reference.getResult().points.length;
    indicator.remove();
    reference.remove();
    chart.destroy();
    return {
      firstAvailable,
      initialPointCount: initialPoints.length,
      initialReferenceCount: initialReference.length,
      correctedChanged: corrected.some((point, index) => point.value !== initialPoints[index]?.value),
      restored,
      replayPoints,
      replayAfterStep,
      afterReplay,
      hidden,
      referenceAfterHide,
      remainingCanvases: document.querySelectorAll("canvas").length,
    };
  });

  expect(result.initialPointCount).toBeGreaterThan(0);
  expect(result.firstAvailable?.availableAt).not.toBeNull();
  expect(result.firstAvailable?.availableAt).toBeGreaterThanOrEqual(result.firstAvailable?.bucketEnd ?? 0);
  expect(result.initialReferenceCount).toBeGreaterThan(0);
  expect(result.correctedChanged).toBe(true);
  expect(result.restored?.indicators.map((item) => item.id)).toEqual(["browser-mtf-sma"]);
  expect(result.restored?.references.map((item) => item.id)).toEqual(["browser-mtf-levels"]);
  expect(result.replayPoints).toBeLessThan(result.afterReplay);
  expect(result.replayAfterStep).toBeGreaterThanOrEqual(result.replayPoints);
  expect(result.hidden).toBe(false);
  expect(result.referenceAfterHide).toBeGreaterThan(0);
  expect(result.remainingCanvases).toBe(0);
  expect(pageErrors).toEqual([]);
});
