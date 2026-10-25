import { expect, test } from "@playwright/test";

test("isolates chart state at an inclusive replay cursor and restores it on exit", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/examples/vanilla/index.html");
  await page.waitForFunction(() => Boolean((globalThis as { __openklineChart?: unknown }).__openklineChart));

  const started = await page.evaluate(() => {
    type Candle = { time: number; open: number; high: number; low: number; close: number; volume?: number };
    type ReplayStatus = { state: string; currentIndex: number | null; currentTimestamp: number | null; totalBars: number; speed: number };
    type Replay = {
      getStatus(): ReplayStatus;
      subscribe(listener: (status: ReplayStatus) => void): () => void;
      start(): void;
      stepForward(): void;
      stepBackward(): void;
      seekToBar(index: number): void;
      setSpeed(speed: number): void;
      play(): void;
      pause(): void;
      exit(): void;
      dispose(): void;
    };
    type Chart = {
      getData(): Candle[];
      getSeriesInfo(): Array<{ id: string; dataLength: number }>;
      addIndicator(id: string, options: object): { getResult(): { outputs: Array<{ points: Array<{ time: number; value: number | null }> }> } };
      addDrawing(type: string, options: object): { id: string };
      getDrawings(): Array<{ id: string }>;
      serializeDrawings(): { drawings: Array<{ id: string }> };
      serializeWorkspace(): { replay?: { active: boolean; currentIndex: number | null; currentTimestamp: number | null; totalBars: number }; series: Array<{ data: Array<{ time: number }> }> };
      subscribe(name: string, listener: (event: { time: number | null; series: Array<{ value: { time?: number } | null }> }) => void): () => void;
      createReplay(options: { source: Candle[]; startAt: number; speed: number }): Replay;
      update(candle: Candle): void;
      addLineSeries(options: object): { id: string };
    };

    const chart = (globalThis as unknown as { __openklineChart: Chart }).__openklineChart;
    const source = chart.getData();
    const indicator = chart.addIndicator("EMA", { id: "replay-ema", period: 3 });
    chart.addDrawing("horizontal-line", {
      id: "replay-past",
      points: [{ time: source[5]!.time, price: source[5]!.close }],
    });
    chart.addDrawing("trend-line", {
      id: "replay-future",
      points: [
        { time: source[10]!.time, price: source[10]!.low },
        { time: source[12]!.time, price: source[12]!.high },
      ],
    });
    const replay = chart.createReplay({ source, startAt: source[10]!.time, speed: 100 });
    (globalThis as unknown as { __openklineReplay: Replay }).__openklineReplay = replay;
    (globalThis as unknown as { __openklineReplayIndicator: typeof indicator }).__openklineReplayIndicator = indicator;
    const protectedFirstClose = source[0]!.close;
    source[0]!.close += 1000;
    const statusLog: string[] = [];
    replay.subscribe((status) => statusLog.push(status.state));
    chart.subscribe("crosshairMove", (event) => {
      (globalThis as unknown as { __replayCrosshair?: typeof event }).__replayCrosshair = event;
    });
    replay.start();

    const status = replay.getStatus();
    const workspace = chart.serializeWorkspace();
    const result = indicator.getResult();
    const series = chart.getSeriesInfo();
    const drawingIds = chart.getDrawings().map((drawing) => drawing.id);
    const serializedDrawingIds = chart.serializeDrawings().drawings.map((drawing) => drawing.id);
    let updateError = "";
    let structureError = "";
    try {
      chart.update(source[11]!);
    } catch (error) {
      updateError = error instanceof Error ? error.message : String(error);
    }
    try {
      chart.addLineSeries({ id: "replay-forbidden-series" });
    } catch (error) {
      structureError = error instanceof Error ? error.message : String(error);
    }
    return {
      status,
      sourceLength: source.length,
      visibleLength: chart.getData().length,
      protectedFirstClose,
      visibleFirstClose: chart.getData()[0]?.close,
      workspace,
      result,
      series,
      drawingIds,
      serializedDrawingIds,
      updateError,
      structureError,
      statusLog,
    };
  });

  expect(started.status).toMatchObject({ state: "ready", currentIndex: 10, totalBars: 80, speed: 100 });
  expect(started.sourceLength).toBe(80);
  expect(started.visibleLength).toBe(11);
  expect(started.visibleFirstClose).toBe(started.protectedFirstClose);
  expect(started.workspace.replay).toEqual({
    active: true,
    currentIndex: 10,
    currentTimestamp: started.status.currentTimestamp,
    totalBars: 80,
  });
  expect(started.workspace.series.every((series) => series.data.every((point) => point.time <= started.status.currentTimestamp!))).toBe(true);
  expect(started.result.outputs.every((output) => output.points.every((point) => point.time <= started.status.currentTimestamp!))).toBe(true);
  expect(started.series.every((series) => series.dataLength <= 11)).toBe(true);
  expect(started.drawingIds).toEqual(["replay-past"]);
  expect(started.serializedDrawingIds).toEqual(["replay-past"]);
  expect(started.updateError).toMatch(/read-only during replay/);
  expect(started.structureError).toMatch(/read-only during replay/);
  expect(started.statusLog).toEqual(["ready"]);

  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box !== null) {
    await page.mouse.move(box.x + box.width * 0.7, box.y + 40);
    await page.waitForFunction(() => (globalThis as { __replayCrosshair?: { time: number | null; series: Array<{ value: { time?: number } | null }> } }).__replayCrosshair !== undefined);
    const crosshair = await page.evaluate(() => (globalThis as { __replayCrosshair?: { time: number | null; series: Array<{ value: { time?: number } | null }> } }).__replayCrosshair);
    expect(crosshair?.time).toBeLessThanOrEqual(started.status.currentTimestamp!);
    expect(crosshair?.series.every((item) => item.value === null || (item.value.time ?? 0) <= started.status.currentTimestamp!)).toBe(true);
  }

  const stepped = await page.evaluate(() => {
    type Replay = { getStatus(): { state: string; currentIndex: number | null }; stepForward(): void; stepBackward(): void; seekToBar(index: number): void; setSpeed(speed: number): void };
    type Indicator = { getResult(): { outputs: Array<{ points: Array<{ time: number; value: number | null }> }> } };
    const replay = (globalThis as unknown as { __openklineReplay: Replay }).__openklineReplay;
    const indicator = (globalThis as unknown as { __openklineReplayIndicator: Indicator }).__openklineReplayIndicator;
    replay.stepForward();
    replay.stepForward();
    const forward = replay.getStatus();
    const sequentialResult = indicator.getResult();
    replay.stepBackward();
    const backward = replay.getStatus();
    replay.seekToBar(10);
    replay.seekToBar(12);
    replay.setSpeed(2);
    const reseekResult = indicator.getResult();
    return { forward, backward, selected: replay.getStatus(), indicatorMatchesAfterReseek: JSON.stringify(sequentialResult) === JSON.stringify(reseekResult) };
  });
  expect(stepped.forward).toMatchObject({ state: "paused", currentIndex: 12 });
  expect(stepped.backward).toMatchObject({ state: "paused", currentIndex: 11 });
  expect(stepped.selected).toMatchObject({ state: "paused", currentIndex: 12 });
  expect(stepped.indicatorMatchesAfterReseek).toBe(true);

  const played = await page.evaluate(() => {
    type Replay = { getStatus(): { state: string; currentIndex: number | null }; play(): void; pause(): void };
    const replay = (globalThis as unknown as { __openklineReplay: Replay }).__openklineReplay;
    replay.play();
    return new Promise<{ state: string; currentIndex: number | null }>((resolve) => {
      window.setTimeout(() => {
        replay.pause();
        resolve(replay.getStatus());
      }, 35);
    });
  });
  expect(played.state).toBe("paused");
  expect(played.currentIndex).toBeGreaterThanOrEqual(12);
  expect(played.currentIndex).toBeLessThan(80);

  const restored = await page.evaluate(() => {
    type Chart = {
      getData(): Array<{ time: number }>;
      getDrawings(): Array<{ id: string }>;
      getSeriesIds(): string[];
      serializeWorkspace(): { replay?: unknown };
      destroy(): void;
    };
    type Replay = { getStatus(): { state: string }; exit(): void; dispose(): void };
    const chart = (globalThis as unknown as { __openklineChart: Chart }).__openklineChart;
    const replay = (globalThis as unknown as { __openklineReplay: Replay }).__openklineReplay;
    replay.exit();
    const beforeDestroy = {
      dataLength: chart.getData().length,
      drawingIds: chart.getDrawings().map((drawing) => drawing.id),
      seriesIds: chart.getSeriesIds(),
      workspaceReplay: chart.serializeWorkspace().replay,
      status: replay.getStatus(),
    };
    chart.destroy();
    replay.dispose();
    return { beforeDestroy, canvasCount: document.querySelectorAll("canvas").length, finalStatus: replay.getStatus() };
  });
  expect(restored.beforeDestroy.dataLength).toBe(80);
  expect(restored.beforeDestroy.drawingIds).toEqual(["replay-past", "replay-future"]);
  expect(restored.beforeDestroy.seriesIds).not.toContain("replay-forbidden-series");
  expect(restored.beforeDestroy.workspaceReplay).toBeUndefined();
  expect(restored.beforeDestroy.status).toMatchObject({ state: "idle", currentIndex: played.currentIndex });
  expect(restored.canvasCount).toBe(0);
  expect(restored.finalStatus.state).toBe("disposed");
  expect(pageErrors).toEqual([]);
});

test("suspends a datafeed during replay and resubscribes after restoration", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/examples/vanilla/index.html");
  await page.waitForFunction(() => Boolean((globalThis as { __openklineChart?: unknown }).__openklineChart));

  await page.evaluate(async () => {
    type Candle = { time: number; open: number; high: number; low: number; close: number; volume?: number };
    type BarHandler = (bar: Candle) => void;
    type Chart = {
      getData(): Candle[];
      setDatafeed(datafeed: object, query: { symbol: string; timeframe: string; from: number; to: number }): Promise<void>;
      createReplay(options: { source: Candle[]; startAt: number }): { start(): void; exit(): void };
    };
    const chart = (globalThis as unknown as { __openklineChart: Chart }).__openklineChart;
    const source = chart.getData();
    const handlers: BarHandler[] = [];
    const state = { getBars: 0, subscriptions: 0 };
    (globalThis as unknown as { __openklineReplayFeed: { state: typeof state; handlers: BarHandler[] } }).__openklineReplayFeed = { state, handlers };
    await chart.setDatafeed({
      resolveSymbol: async () => ({ symbol: "TEST", timezone: "UTC", pricePrecision: 2 }),
      getBars: async () => {
        state.getBars += 1;
        return source;
      },
      subscribeBars: ({ onBar }: { onBar: BarHandler }) => {
        state.subscriptions += 1;
        handlers.push(onBar);
        return () => undefined;
      },
    }, { symbol: "TEST", timeframe: "1h", from: source[0]!.time, to: source.at(-1)!.time });
    const replay = chart.createReplay({ source: chart.getData(), startAt: source[10]!.time });
    (globalThis as unknown as { __openklineReplayFeedController: { replay: typeof replay } }).__openklineReplayFeedController = { replay };
    replay.start();
  });

  const feedState = () => page.evaluate(() => {
    const value = (globalThis as unknown as { __openklineReplayFeed?: { state: { getBars: number; subscriptions: number } } }).__openklineReplayFeed;
    return value?.state ?? { getBars: 0, subscriptions: 0 };
  });
  await expect.poll(feedState).toEqual({ getBars: 1, subscriptions: 1 });

  const duringReplay = await page.evaluate(() => {
    type Candle = { time: number; open: number; high: number; low: number; close: number; volume?: number };
    type Chart = { getData(): Candle[] };
    const chart = (globalThis as unknown as { __openklineChart: Chart }).__openklineChart;
    const feed = (globalThis as unknown as { __openklineReplayFeed: { handlers: Array<(bar: Candle) => void> } }).__openklineReplayFeed;
    const before = chart.getData().length;
    const source = chart.getData();
    const current = source.at(-1)!;
    feed.handlers[0]!({
      ...current,
      time: current.time + 60 * 60 * 1000,
      close: current.close + 5,
      high: current.high + 5,
    });
    return { before, after: chart.getData().length };
  });
  expect(duringReplay).toEqual({ before: 11, after: 11 });

  await page.evaluate(() => {
    const replay = (globalThis as unknown as { __openklineReplayFeedController: { replay: { exit(): void } } }).__openklineReplayFeedController.replay;
    replay.exit();
  });
  await expect.poll(feedState).toEqual({ getBars: 2, subscriptions: 2 });

  const afterReplay = await page.evaluate(() => {
    type Candle = { time: number; open: number; high: number; low: number; close: number; volume?: number };
    type Chart = { getData(): Candle[]; destroy(): void };
    const chart = (globalThis as unknown as { __openklineChart: Chart }).__openklineChart;
    const feed = (globalThis as unknown as { __openklineReplayFeed: { handlers: Array<(bar: Candle) => void> } }).__openklineReplayFeed;
    const last = chart.getData().at(-1)!;
    feed.handlers[1]!({
      ...last,
      time: last.time + 60 * 60 * 1000,
      open: last.close,
      high: last.close + 2,
      low: last.close - 1,
      close: last.close + 1,
    });
    const length = chart.getData().length;
    chart.destroy();
    return { length, canvasCount: document.querySelectorAll("canvas").length };
  });
  expect(afterReplay).toEqual({ length: 81, canvasCount: 0 });
  expect(pageErrors).toEqual([]);
});
