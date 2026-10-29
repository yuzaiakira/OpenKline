import { expect, test } from "@playwright/test";

test("setDatafeed removes prior indicator series instead of orphaning them", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/examples/vanilla/index.html");
  await page.waitForFunction(() => Boolean((globalThis as { __openklineChart?: unknown }).__openklineChart));

  const result = await page.evaluate(async () => {
    const chart = (globalThis as unknown as {
      __openklineChart: {
        setData(candles: object[]): void;
        addIndicator(id: string, options?: object): { id: string };
        getSeriesIds(): string[];
        serializeWorkspace(): { indicators: Array<{ id: string }> };
        setDatafeed(datafeed: object, query: object): Promise<void>;
        destroy(): void;
      };
    }).__openklineChart;

    const moduleUrl = new URL("/dist/src/index.js", location.href).href;
    const { InMemoryDatafeed } = await import(moduleUrl);
    const history = Array.from({ length: 20 }, (_, index) => {
      const close = 100 + index;
      return {
        time: Date.UTC(2026, 0, 1) + index * 60_000,
        open: close - 0.5,
        high: close + 1,
        low: close - 1,
        close,
        volume: 1_000 + index,
      };
    });
    chart.setData(history);
    const sma = chart.addIndicator("SMA", { id: "lifecycle-sma", period: 5 });
    const seriesBefore = chart.getSeriesIds();
    const indicatorsBefore = chart.serializeWorkspace().indicators.map((indicator) => indicator.id);

    const next = Array.from({ length: 15 }, (_, index) => {
      const close = 200 + index;
      return {
        time: Date.UTC(2026, 1, 1) + index * 60_000,
        open: close - 0.5,
        high: close + 1,
        low: close - 1,
        close,
        volume: 2_000 + index,
      };
    });
    const datafeed = new InMemoryDatafeed({ symbol: "BTCUSD", timezone: "UTC", pricePrecision: 2 }, next);
    await chart.setDatafeed(datafeed, {
      symbol: "BTCUSD",
      timeframe: "1m",
      from: Date.UTC(2026, 1, 1),
      to: Date.UTC(2026, 1, 1) + 20 * 60_000,
    });

    const seriesAfter = chart.getSeriesIds();
    const indicatorsAfter = chart.serializeWorkspace().indicators.map((indicator) => indicator.id);
    let readdOk = false;
    let readdError: string | null = null;
    try {
      chart.addIndicator("SMA", { id: sma.id, period: 5 });
      readdOk = true;
    } catch (error) {
      readdOk = false;
      readdError = error instanceof Error ? error.message : String(error);
    }

    return {
      seriesBefore,
      seriesAfter,
      indicatorsBefore,
      indicatorsAfter,
      readdOk,
      readdError,
      smaId: sma.id,
      seriesAfterReadd: chart.getSeriesIds(),
    };
  });

  expect(result.indicatorsBefore).toContain("lifecycle-sma");
  expect(result.seriesBefore.some((id) => id.startsWith("lifecycle-sma:"))).toBe(true);
  expect(result.indicatorsAfter).toEqual([]);
  expect(result.seriesAfter.some((id) => id.startsWith("lifecycle-sma:"))).toBe(false);
  expect(result.readdOk).toBe(true);
  expect(result.readdError).toBeNull();
  expect(pageErrors).toEqual([]);
});

test("rapid symbol changes discard stale historical responses", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/examples/vanilla/index.html");
  await page.waitForFunction(() => Boolean((globalThis as { __openklineChart?: unknown }).__openklineChart));

  const closes = await page.evaluate(async () => {
    const chart = (globalThis as unknown as {
      __openklineChart: {
        setDatafeed(datafeed: object, query: object): Promise<void>;
        getData(): Array<{ close: number }>;
      };
    }).__openklineChart;
    const moduleUrl = new URL("/dist/src/index.js", location.href).href;
    const { InMemoryDatafeed } = await import(moduleUrl);

    const slowBars = Array.from({ length: 5 }, (_, index) => ({
      time: Date.UTC(2026, 0, 1) + index * 60_000,
      open: 10 + index,
      high: 12 + index,
      low: 9 + index,
      close: 10 + index,
      volume: 100,
    }));
    const fastBars = Array.from({ length: 5 }, (_, index) => ({
      time: Date.UTC(2026, 2, 1) + index * 60_000,
      open: 500 + index,
      high: 502 + index,
      low: 499 + index,
      close: 500 + index,
      volume: 100,
    }));

    let resolveSlow: ((bars: typeof slowBars) => void) | undefined;
    const slow = {
      resolveSymbol: async (symbol: string) => ({ symbol, timezone: "UTC", pricePrecision: 2 }),
      getBars: () => new Promise<typeof slowBars>((resolve) => {
        resolveSlow = resolve;
      }),
      subscribeBars: () => () => undefined,
    };
    const fast = new InMemoryDatafeed({ symbol: "ETHUSD", timezone: "UTC", pricePrecision: 2 }, fastBars);

    const slowPromise = chart.setDatafeed(slow, {
      symbol: "BTCUSD",
      timeframe: "1m",
      from: slowBars[0]!.time,
      to: slowBars.at(-1)!.time + 60_000,
    });
    await chart.setDatafeed(fast, {
      symbol: "ETHUSD",
      timeframe: "1m",
      from: fastBars[0]!.time,
      to: fastBars.at(-1)!.time + 60_000,
    });
    resolveSlow?.(slowBars);
    await slowPromise.catch(() => undefined);
    return chart.getData().map((candle) => candle.close);
  });

  expect(closes).toEqual([500, 501, 502, 503, 504]);
  expect(pageErrors).toEqual([]);
});

test("setDatafeed clears indicators and workers while preserving drawings and allowing id reuse under live pressure", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/examples/vanilla/index.html");
  await page.waitForFunction(() => Boolean((globalThis as { __openklineChart?: unknown }).__openklineChart));

  const result = await page.evaluate(async () => {
    type Candle = { time: number; open: number; high: number; low: number; close: number; volume?: number };
    type Chart = {
      setData(candles: Candle[]): void;
      getData(): Candle[];
      addIndicator(id: string, options?: object): { id: string };
      addScriptIndicatorAsync(source: string, options?: object): Promise<{ id: string }>;
      addDrawing(type: string, options: object): { id: string };
      getDrawings(): Array<{ id: string }>;
      getSeriesIds(): string[];
      serializeWorkspace(): { indicators: Array<{ id: string }> };
      setDatafeed(datafeed: object, query: object): Promise<void>;
      stopDatafeed(): void;
      destroy(): void;
    };
    const chart = (globalThis as unknown as { __openklineChart: Chart }).__openklineChart;
    const moduleUrl = new URL("/dist/src/index.js", location.href).href;
    const { InMemoryDatafeed } = await import(moduleUrl);

    const makeBars = (count: number, start: number, base: number): Candle[] => Array.from({ length: count }, (_, index) => {
      const close = base + index;
      return {
        time: start + index * 60_000,
        open: close - 0.5,
        high: close + 1,
        low: close - 1,
        close,
        volume: 100 + index,
      };
    });

    const feedABars = makeBars(24, Date.UTC(2026, 0, 1), 100);
    const feedBBars = makeBars(18, Date.UTC(2026, 2, 1), 400);
    const feedA = new InMemoryDatafeed({ symbol: "AAA", timezone: "UTC", pricePrecision: 2 }, feedABars);
    const feedB = new InMemoryDatafeed({ symbol: "BBB", timezone: "UTC", pricePrecision: 2 }, feedBBars);
    let activeSubs = 0;
    const wrapSubscribe = (datafeed: InstanceType<typeof InMemoryDatafeed>) => {
      const original = datafeed.subscribeBars.bind(datafeed);
      datafeed.subscribeBars = (args: Parameters<typeof original>[0]) => {
        activeSubs += 1;
        const unsubscribe = original(args);
        return () => {
          activeSubs -= 1;
          unsubscribe();
        };
      };
    };
    wrapSubscribe(feedA);
    wrapSubscribe(feedB);

    await chart.setDatafeed(feedA, {
      symbol: "AAA",
      timeframe: "1m",
      from: feedABars[0]!.time,
      to: feedABars.at(-1)!.time + 60_000,
    });
    const sma = chart.addIndicator("SMA", { id: "life-sma", period: 5 });
    const rsi = chart.addIndicator("RSI", { id: "life-rsi", period: 5, pane: "new" });
    const worker = await chart.addScriptIndicatorAsync('indicator("Life Worker")\nplot(close)', { id: "life-worker", timeoutMs: 2_000 });
    const drawing = chart.addDrawing("horizontal-line", {
      id: "life-drawing",
      points: [{ time: feedABars.at(-1)!.time, price: feedABars.at(-1)!.close }],
      style: { color: "#f59e0b" },
    });
    const seriesWithIndicators = chart.getSeriesIds();
    const indicatorIdsBefore = chart.serializeWorkspace().indicators.map((item) => item.id).sort();

    // Live updates on A while switching repeatedly to B and back.
    feedA.pushBar({ ...feedABars.at(-1)!, close: feedABars.at(-1)!.close + 0.25, high: feedABars.at(-1)!.high + 0.25 });
    let resolveSlow: ((bars: Candle[]) => void) | undefined;
    const slowFeed = {
      resolveSymbol: async (symbol: string) => ({ symbol, timezone: "UTC", pricePrecision: 2 }),
      getBars: () => new Promise<Candle[]>((resolve) => {
        resolveSlow = resolve;
      }),
      subscribeBars: () => {
        activeSubs += 1;
        return () => {
          activeSubs -= 1;
        };
      },
    };
    const slowPromise = chart.setDatafeed(slowFeed, {
      symbol: "SLOW",
      timeframe: "1m",
      from: feedABars[0]!.time,
      to: feedABars.at(-1)!.time + 60_000,
    });
    // Indicators must already be cleared when the replacement session begins.
    const midSwitchIndicators = chart.serializeWorkspace().indicators.map((item) => item.id);
    const midSwitchSeries = chart.getSeriesIds();
    await chart.setDatafeed(feedB, {
      symbol: "BBB",
      timeframe: "1m",
      from: feedBBars[0]!.time,
      to: feedBBars.at(-1)!.time + 60_000,
    });
    resolveSlow?.(feedABars);
    await slowPromise.catch(() => undefined);

    const afterB = {
      closes: chart.getData().map((candle) => candle.close),
      indicators: chart.serializeWorkspace().indicators.map((item) => item.id),
      series: chart.getSeriesIds(),
      drawings: chart.getDrawings().map((item) => item.id),
      activeSubs,
    };

    // Re-add prior IDs on the new session.
    chart.addIndicator("SMA", { id: sma.id, period: 5 });
    chart.addIndicator("RSI", { id: rsi.id, period: 5, pane: "new" });
    await chart.addScriptIndicatorAsync('indicator("Life Worker")\nplot(close)', { id: worker.id, timeoutMs: 2_000 });
    const afterReadd = {
      indicators: chart.serializeWorkspace().indicators.map((item) => item.id).sort(),
      series: chart.getSeriesIds(),
    };

    // Rapid replacement under live B updates.
    for (let index = 0; index < 3; index += 1) {
      feedB.pushBar({
        time: feedBBars.at(-1)!.time + (index + 1) * 60_000,
        open: 420 + index,
        high: 421 + index,
        low: 419 + index,
        close: 420.5 + index,
        volume: 10,
      });
      await chart.setDatafeed(index % 2 === 0 ? feedA : feedB, {
        symbol: index % 2 === 0 ? "AAA" : "BBB",
        timeframe: "1m",
        from: (index % 2 === 0 ? feedABars : feedBBars)[0]!.time,
        to: (index % 2 === 0 ? feedABars : feedBBars).at(-1)!.time + 60_000,
      });
    }

    chart.stopDatafeed();
    const afterStopSubs = activeSubs;
    chart.destroy();
    return {
      seriesWithIndicators,
      indicatorIdsBefore,
      midSwitchIndicators,
      midSwitchSeries,
      afterB,
      afterReadd,
      drawingId: drawing.id,
      afterStopSubs,
      afterDestroySubs: activeSubs,
      canvases: document.querySelectorAll("canvas").length,
    };
  });

  expect(result.indicatorIdsBefore).toEqual(["life-rsi", "life-sma", "life-worker"]);
  expect(result.seriesWithIndicators.some((id) => id.startsWith("life-sma:"))).toBe(true);
  expect(result.seriesWithIndicators.some((id) => id.startsWith("life-rsi:"))).toBe(true);
  expect(result.seriesWithIndicators.some((id) => id.startsWith("life-worker:"))).toBe(true);
  expect(result.midSwitchIndicators).toEqual([]);
  expect(result.midSwitchSeries.some((id) => id.startsWith("life-"))).toBe(false);
  expect(result.afterB.indicators).toEqual([]);
  expect(result.afterB.series.some((id) => id.startsWith("life-"))).toBe(false);
  expect(result.afterB.closes).toEqual(Array.from({ length: 18 }, (_, index) => 400 + index));
  expect(result.afterB.drawings).toContain("life-drawing");
  expect(result.afterB.activeSubs).toBe(1);
  expect(result.afterReadd.indicators).toEqual(["life-rsi", "life-sma", "life-worker"]);
  expect(result.afterReadd.series.some((id) => id.startsWith("life-sma:"))).toBe(true);
  expect(result.afterStopSubs).toBe(0);
  expect(result.afterDestroySubs).toBe(0);
  expect(result.canvases).toBe(0);
  expect(pageErrors).toEqual([]);
});

test("stopDatafeed and destroy release subscriptions", async ({ page }) => {
  await page.goto("/examples/vanilla/index.html");
  await page.waitForFunction(() => Boolean((globalThis as { __openklineChart?: unknown }).__openklineChart));

  const counts = await page.evaluate(async () => {
    const chart = (globalThis as unknown as {
      __openklineChart: {
        setDatafeed(datafeed: object, query: object): Promise<void>;
        stopDatafeed(): void;
        destroy(): void;
      };
    }).__openklineChart;
    const moduleUrl = new URL("/dist/src/index.js", location.href).href;
    const { InMemoryDatafeed } = await import(moduleUrl);
    const history = Array.from({ length: 8 }, (_, index) => ({
      time: Date.UTC(2026, 0, 1) + index * 60_000,
      open: 100,
      high: 101,
      low: 99,
      close: 100,
      volume: 10,
    }));
    const datafeed = new InMemoryDatafeed({ symbol: "SOLUSD", timezone: "UTC", pricePrecision: 2 }, history);
    let active = 0;
    const original = datafeed.subscribeBars.bind(datafeed);
    datafeed.subscribeBars = (args: Parameters<typeof original>[0]) => {
      active += 1;
      const unsubscribe = original(args);
      return () => {
        active -= 1;
        unsubscribe();
      };
    };

    await chart.setDatafeed(datafeed, {
      symbol: "SOLUSD",
      timeframe: "1m",
      from: history[0]!.time,
      to: history.at(-1)!.time + 60_000,
    });
    const afterSubscribe = active;
    chart.stopDatafeed();
    const afterStop = active;
    await chart.setDatafeed(datafeed, {
      symbol: "SOLUSD",
      timeframe: "1m",
      from: history[0]!.time,
      to: history.at(-1)!.time + 60_000,
    });
    const afterResubscribe = active;
    chart.destroy();
    return { afterSubscribe, afterStop, afterResubscribe, afterDestroy: active };
  });

  expect(counts).toEqual({
    afterSubscribe: 1,
    afterStop: 0,
    afterResubscribe: 1,
    afterDestroy: 0,
  });
});
