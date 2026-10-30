import { expect, test } from "@playwright/test";

test("multi-timeframe indicators and previous levels remain causal through correction, replay, and workspace restore", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/examples/vanilla/index.html");
  await page.waitForFunction(() => Boolean((globalThis as { __openklineChart?: unknown }).__openklineChart));

  const result = await page.evaluate(() => {
    type Candle = { time: number; open: number; high: number; low: number; close: number; volume?: number };
    type OutputPoint = { value: number | null; availableAt: number | null; bucketStart: number; bucketEnd: number };
    type Observation = { bucketStart: number; bucketEnd: number; availableAt: number | null; status: string; sourceTimes: number[]; sourceCount: number; candle: Candle };
    type IndicatorResult = { asOfTime: number; observations: Observation[]; outputs: Array<{ points: OutputPoint[] }> };
    type ReferenceResult = { asOfTime: number; points: Array<Observation & { levels: Record<string, number> }> };
    type Chart = {
      getData(): Candle[];
      setData(candles: Candle[]): void;
      update(candle: Candle): void;
      addMultiTimeframeIndicator(options: object): { id: string; getResult(): IndicatorResult; setVisible(visible: boolean): void; remove(): void };
      getMultiTimeframeIndicators(): Array<{ getResult(): IndicatorResult; setVisible(visible: boolean): void; remove(): void }>;
      addMultiTimeframeReference(options: object): { id: string; getResult(): ReferenceResult; setVisible(visible: boolean): void; remove(): void };
      getMultiTimeframeReferences(): Array<{ getResult(): ReferenceResult; setVisible(visible: boolean): void; remove(): void }>;
      getSeriesInfo(): Array<{ id: string; style: { visible?: boolean }; dataLength: number }>;
      serializeWorkspace(): { multiTimeframe?: { indicators: Array<{ id: string }>; references: Array<{ id: string }> } };
      restoreWorkspace(document: object): void;
      createReplay(options: object): { start(): void; stepForward(): void; stepBackward(): void; exit(): void; dispose(): void };
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
    const replayIndicator = chart.getMultiTimeframeIndicators()[0];
    const replayReference = chart.getMultiTimeframeReferences()[0];
    if (replayIndicator === undefined || replayReference === undefined) throw new Error("Workspace restore lost multi-timeframe state");
    const replay = chart.createReplay({ source, startAt: source[10]!.time, speed: 100 });
    replay.start();
    const sourceDuration = 60 * 60 * 1000;
    const snapshot = () => {
      const indicatorResult = replayIndicator.getResult();
      const referenceResult = replayReference.getResult();
      return {
        asOfTime: indicatorResult.asOfTime,
        indicatorObservations: indicatorResult.observations,
        indicatorPoints: indicatorResult.outputs[0]?.points ?? [],
        referenceAsOfTime: referenceResult.asOfTime,
        referencePoints: referenceResult.points,
      };
    };
    const isCausal = (current: ReturnType<typeof snapshot>) => current.indicatorObservations.every((observation) => observation.sourceTimes.every((time) => time + sourceDuration <= current.asOfTime))
      && current.referencePoints.every((point) => point.sourceTimes.every((time) => time + sourceDuration <= current.referenceAsOfTime));
    const replayAtStart = snapshot();
    const replayPoints = chart.getSeriesInfo().find((series) => series.id === "browser-mtf-sma:value")?.dataLength ?? 0;
    replay.stepForward();
    const replayAtNextBar = snapshot();
    replay.stepForward();
    const replayAtCompletion = snapshot();
    replay.stepBackward();
    const replayAfterBack = snapshot();
    replay.stepBackward();
    const replayAtStartAgain = snapshot();
    replay.stepForward();
    replay.stepForward();
    const replayAtCompletionAgain = snapshot();
    const replayAfterStep = chart.getSeriesInfo().find((series) => series.id === "browser-mtf-sma:value")?.dataLength ?? 0;
    replay.exit();
    const afterReplay = chart.getSeriesInfo().find((series) => series.id === "browser-mtf-sma:value")?.dataLength ?? 0;
    const restoredResult = chart.getMultiTimeframeIndicators()[0]?.getResult();
    const restoredReferenceResult = chart.getMultiTimeframeReferences()[0]?.getResult();
    replayIndicator.setVisible(false);
    const hidden = chart.getSeriesInfo().find((series) => series.id === "browser-mtf-sma:value")?.style.visible;
    replayReference.setVisible(false);
    const referenceAfterHide = replayReference.getResult().points.length;
    replayIndicator.remove();
    replayReference.remove();
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
      replayStartCausal: isCausal(replayAtStart),
      replayNextBarCausal: isCausal(replayAtNextBar),
      replayCompletionCausal: isCausal(replayAtCompletion),
      replayBackCausal: isCausal(replayAfterBack),
      replayStartStable: JSON.stringify(replayAtStart) === JSON.stringify(replayAtStartAgain),
      replayCompletionStable: JSON.stringify(replayAtCompletion) === JSON.stringify(replayAtCompletionAgain),
      replayCompletionAddsOutput: replayAtCompletion.indicatorPoints.length > replayAtStart.indicatorPoints.length,
      replayBackRemovesOutput: replayAfterBack.indicatorPoints.length < replayAtCompletion.indicatorPoints.length,
      restoredCausal: restoredResult === undefined ? false : restoredResult.observations.every((observation) => observation.sourceTimes.every((time) => time + sourceDuration <= restoredResult.asOfTime)),
      restoredReferenceCausal: restoredReferenceResult === undefined ? false : restoredReferenceResult.points.every((point) => point.sourceTimes.every((time) => time + sourceDuration <= restoredReferenceResult.asOfTime)),
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
  expect(result.replayStartCausal).toBe(true);
  expect(result.replayNextBarCausal).toBe(true);
  expect(result.replayCompletionCausal).toBe(true);
  expect(result.replayBackCausal).toBe(true);
  expect(result.replayStartStable).toBe(true);
  expect(result.replayCompletionStable).toBe(true);
  expect(result.replayCompletionAddsOutput).toBe(true);
  expect(result.replayBackRemovesOutput).toBe(true);
  expect(result.restoredCausal).toBe(true);
  expect(result.restoredReferenceCausal).toBe(true);
  expect(result.hidden).toBe(false);
  expect(result.referenceAfterHide).toBeGreaterThan(0);
  expect(result.remainingCanvases).toBe(0);
  expect(pageErrors).toEqual([]);
});
