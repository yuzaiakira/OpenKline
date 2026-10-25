import { expect, test } from "@playwright/test";

test("KlineScript playground compiles, reports diagnostics, updates inputs, and cleans up", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/examples/vanilla/klinescript.html");
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.locator("#status")).toContainText("Compiled EMA");
  await expect(page.locator("#inputs input")).toHaveCount(1);

  const initial = await page.evaluate(() => (globalThis as unknown as { __openklineScriptPlayground: { chart: { getSeriesIds(): string[] } } }).__openklineScriptPlayground.chart.getSeriesIds());
  expect(initial.some((id) => id.includes(":plot-1"))).toBe(true);

  await page.locator("#inputs input").fill("21");
  await page.locator("#inputs input").press("Enter");
  await page.locator("#source").fill('indicator("Broken")\nplot(eval(close))');
  await page.locator("#compile").click();
  await expect(page.locator("#diagnostics")).toContainText("KS3063");
  await expect(page.locator("#status")).toHaveText("");

  await page.locator("#source").fill('indicator("Oscillator", overlay=False)\nvalue = ta.rsi(close, 3)\nplot(value)\nhline(70)');
  await page.locator("#compile").click();
  await expect(page.locator("#status")).toContainText("Compiled Oscillator");
  await expect(page.locator("#inputs input")).toHaveCount(0);
  const afterCompile = await page.evaluate(() => {
    const chart = (globalThis as unknown as { __openklineScriptPlayground: { chart: { getPaneIds(): string[]; getSeriesIds(): string[] } } }).__openklineScriptPlayground.chart;
    return { paneCount: chart.getPaneIds().length, seriesIds: chart.getSeriesIds() };
  });
  expect(afterCompile.paneCount).toBeGreaterThan(1);
  expect(afterCompile.seriesIds.some((id) => id.includes(":hline-2"))).toBe(true);

  const replayIntegration = await page.evaluate(() => {
    type Candle = { time: number; open: number; high: number; low: number; close: number; volume?: number };
    type Replay = { getStatus(): { state: string; currentIndex: number | null; currentTimestamp: number | null; totalBars: number }; start(): void; exit(): void; dispose(): void };
    type Chart = {
      getData(): Candle[];
      getSeriesInfo(): Array<{ id: string; dataLength: number }>;
      getSeriesIds(): string[];
      serializeWorkspace(): { replay?: { currentIndex: number | null; currentTimestamp: number | null; totalBars: number } };
      createReplay(options: { source: Candle[]; startAt: number }): Replay;
    };
    const chart = (globalThis as unknown as { __openklineScriptPlayground: { chart: Chart } }).__openklineScriptPlayground.chart;
    const source = chart.getData();
    const scriptSeriesIds = chart.getSeriesIds().filter((id) => id.includes(":plot-") || id.includes(":hline-"));
    const replay = chart.createReplay({ source, startAt: source[30]!.time });
    replay.start();
    const status = replay.getStatus();
    const visibleInfo = chart.getSeriesInfo();
    const workspace = chart.serializeWorkspace();
    const visibleLength = chart.getData().length;
    replay.exit();
    replay.dispose();
    return {
      status,
      visibleLength,
      scriptSeriesIds,
      scriptInfo: visibleInfo.filter((series) => scriptSeriesIds.includes(series.id)),
      workspaceReplay: workspace.replay,
      restoredLength: chart.getData().length,
    };
  });
  expect(replayIntegration.status).toMatchObject({ state: "ready", currentIndex: 30, totalBars: 120 });
  expect(replayIntegration.visibleLength).toBe(31);
  expect(replayIntegration.scriptSeriesIds.length).toBeGreaterThan(0);
  expect(replayIntegration.scriptInfo.every((series) => series.dataLength <= 31)).toBe(true);
  expect(replayIntegration.workspaceReplay).toMatchObject({ currentIndex: 30, totalBars: 120 });
  expect(replayIntegration.restoredLength).toBe(120);

  const workspace = await page.evaluate(() => (globalThis as unknown as { __openklineScriptPlayground: { chart: { serializeWorkspace(): { indicators: Array<{ script?: { source: string } }> } } } }).__openklineScriptPlayground.chart.serializeWorkspace());
  expect(workspace.indicators[0]?.script?.source).toContain("Oscillator");
  await page.evaluate((documentValue) => {
    (globalThis as unknown as { __openklineScriptPlayground: { chart: { restoreWorkspace(value: unknown): void } } }).__openklineScriptPlayground.chart.restoreWorkspace(documentValue);
  }, workspace);
  const restored = await page.evaluate(() => (globalThis as unknown as { __openklineScriptPlayground: { chart: { getSeriesIds(): string[] } } }).__openklineScriptPlayground.chart.getSeriesIds());
  expect(restored.some((id) => id.includes(":hline-2"))).toBe(true);

  await page.locator("#remove").click();
  await expect(page.locator("#status")).toHaveText("Indicator removed");
  expect(pageErrors).toEqual([]);
});

test("Worker-backed KlineScript shares chart, alert, replay, and cleanup lifecycles", async ({ page }) => {
  const pageErrors: string[] = [];
  await page.goto("/examples/vanilla/klinescript.html");
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const result = await page.evaluate(async () => {
    type Candle = { time: number; open: number; high: number; low: number; close: number; volume?: number };
    type Indicator = { id: string; getResult(): { outputs: Array<{ id: string; points: Array<{ value: number | null }> }> }; remove(): void };
    type Chart = {
      addScriptIndicatorAsync(source: string, options?: { id?: string; timeoutMs?: number }): Promise<Indicator>;
      update(candle: Candle): void;
      getSeriesInfo(): Array<{ id: string; dataLength: number }>;
      getData(): Candle[];
      addAlert(definition: unknown): { remove(): void };
      subscribe(name: string, listener: (event: unknown) => void): () => void;
      createReplay(options: { source: Candle[]; startAt: number }): { start(): void; exit(): void; dispose(): void };
      destroy(): void;
    };
    const chart = (globalThis as unknown as { __openklineScriptPlayground: { chart: Chart } }).__openklineScriptPlayground.chart;
    const source = 'indicator("Worker close")\nplot(close, title="Close")';
    const indicator = await chart.addScriptIndicatorAsync(source, { id: "worker-script", timeoutMs: 2_000 });
    const initial = indicator.getResult().outputs[0]?.points.at(-1)?.value;
    const events: unknown[] = [];
    const unsubscribe = chart.subscribe("alertTriggered", (event) => events.push(event));
    const alert = chart.addAlert({
      id: "worker-alert",
      name: "Worker close",
      condition: { type: "script-above", scriptId: indicator.id, outputId: "plot-1", value: 150 },
      frequency: "every-event",
    });
    const last = chart.getData().at(-1)!;
    chart.update({ ...last, time: last.time + 3_600_000, open: 199, high: 201, low: 198, close: 200 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const updated = indicator.getResult().outputs[0]?.points.at(-1)?.value;
    const workerSeries = chart.getSeriesInfo().find((item) => item.id === "worker-script:plot-1");
    const sourceData = chart.getData();
    const replay = chart.createReplay({ source: sourceData, startAt: sourceData[30]!.time });
    replay.start();
    const replayLength = chart.getSeriesInfo().find((item) => item.id === "worker-script:plot-1")?.dataLength ?? -1;
    replay.exit();
    replay.dispose();
    alert.remove();
    unsubscribe();
    indicator.remove();
    chart.destroy();
    return { initial, updated, workerSeries, events: events.length, replayLength };
  });
  expect(result.initial).not.toBeNull();
  expect(result.updated).toBe(200);
  expect(result.workerSeries?.dataLength).toBe(121);
  expect(result.events).toBeGreaterThan(0);
  expect(result.replayLength).toBe(31);
  await expect.poll(() => page.locator("canvas").count()).toBe(0);
  expect(pageErrors).toEqual([]);
});
