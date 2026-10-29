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
