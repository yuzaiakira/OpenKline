import { expect, test, type Page } from "@playwright/test";
import type { InternalWidget } from "../../src/widget/types.js";

type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
type WidgetGlobals = typeof globalThis & {
  __openklineWidget?: InternalWidget;
  __openklineHost?: HTMLElement;
  __openklineFeedLog?: Array<Record<string, unknown>>;
  __openklineRealtime?: {
    emit(bar: Candle): void;
    unsubscribed: number;
  };
};

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

async function mount(page: Page, layout: "single" | "two-horizontal" | "four-grid" = "single"): Promise<void> {
  await page.goto("/examples/vanilla/index.html");
  await page.evaluate(async (layoutValue) => {
    const moduleUrl = new URL("/dist/src/widget/index.js", location.href).href;
    const { createOpenKlineWidget } = await import(moduleUrl);
    const host = document.createElement("div");
    host.style.cssText = "width: min(960px, 100vw); height: 640px";
    document.body.append(host);
    const widget = createOpenKlineWidget({
      container: host,
      layout: layoutValue,
      chartOptions: { autoSize: true, theme: "light", direction: "ltr" },
    });
    const globals = globalThis as WidgetGlobals;
    globals.__openklineWidget = widget;
    globals.__openklineHost = host;
    globals.__openklineFeedLog = [];
  }, layout);
}

test("widget datafeed resolves symbols, loads history, and manages realtime subscriptions", async ({ page }, testInfo) => {
  test.skip(!["chromium", "firefox"].includes(testInfo.project.name), "Datafeed integrity is verified on desktop Chromium/Firefox");
  await mount(page, "single");

  const result = await page.evaluate(async (candles) => {
    const widget = (globalThis as WidgetGlobals).__openklineWidget!;
    const log = (globalThis as WidgetGlobals).__openklineFeedLog!;
    let onBar: ((bar: Candle) => void) | null = null;
    const retiredHandlers: Array<(bar: Candle) => void> = [];
    let unsubscribed = 0;
    const shift = (values: Candle[], amount: number): Candle[] => values.map((candle) => {
      const close = candle.close + amount;
      return {
        ...candle,
        open: close - 0.4,
        high: close + 1,
        low: close - 1,
        close,
      };
    });
    const bySymbol = new Map<string, Candle[]>([
      ["BTC-USD", candles],
      ["ETH-USD", shift(candles, 50)],
      ["SOL-USD", shift(candles, 10)],
    ]);
    const feed = {
      async resolveSymbol(symbol: string, signal?: AbortSignal) {
        log.push({ op: "resolveSymbol", symbol, aborted: signal?.aborted === true });
        if (signal?.aborted) {
          throw Object.assign(new Error("aborted"), { name: "AbortError" });
        }
        if (symbol !== "FAIL" && !bySymbol.has(symbol)) throw new Error(`Unknown symbol ${symbol}`);
        return { symbol, timezone: "UTC", pricePrecision: 2 };
      },
      async getBars(query: { symbol: string; timeframe: string; signal?: AbortSignal }) {
        log.push({ op: "getBars", symbol: query.symbol, timeframe: query.timeframe, aborted: query.signal?.aborted === true });
        if (query.signal?.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
        if (query.symbol === "FAIL") throw new Error("provider rejected");
        return bySymbol.get(query.symbol) ?? [];
      },
      subscribeBars(args: { symbol: string; timeframe: string; onBar: (bar: Candle) => void }) {
        log.push({ op: "subscribeBars", symbol: args.symbol, timeframe: args.timeframe });
        onBar = args.onBar;
        return () => {
          unsubscribed += 1;
          if (onBar !== null) retiredHandlers.push(onBar);
          onBar = null;
          log.push({ op: "unsubscribe", symbol: args.symbol });
        };
      },
    };
    (globalThis as WidgetGlobals).__openklineRealtime = {
      emit(bar) { onBar?.(bar); },
      get unsubscribed() { return unsubscribed; },
    };

    const pendingBefore = widget.getDiagnostics().pendingDataRequest;
    const load = widget.setDatafeed(feed, { symbol: "BTC-USD", timeframe: "1m", from: 0, to: Number.MAX_SAFE_INTEGER });
    const pendingDuring = widget.getDiagnostics().pendingDataRequest;
    await load;
    const pendingAfterSuccess = widget.getDiagnostics().pendingDataRequest;
    const afterBtc = {
      symbol: widget.getState().symbol,
      timeframe: widget.getState().timeframe,
      identity: widget.getState().identityStatus,
      close: widget.getChart().getData().at(-1)?.close ?? null,
      bars: widget.getChart().getData().length,
    };

    const last = candles.at(-1)!;
    (globalThis as WidgetGlobals).__openklineRealtime!.emit({ ...last, close: last.close + 5, high: last.high + 5 });
    const afterAppend = widget.getChart().getData().at(-1)?.close ?? null;
    (globalThis as WidgetGlobals).__openklineRealtime!.emit({ ...last, close: last.close + 1, high: last.high + 1 });
    const afterCorrection = widget.getChart().getData().at(-1)?.close ?? null;

    await widget.setSymbol("ETH-USD");
    const afterEth = {
      symbol: widget.getState().symbol,
      close: widget.getChart().getData().at(-1)?.close ?? null,
      identity: widget.getState().identityStatus,
    };

    await widget.setTimeframe("15m");
    const afterTf = {
      timeframe: widget.getState().timeframe,
      identity: widget.getState().identityStatus,
      pending: widget.getDiagnostics().pendingDataRequest,
    };

    const rapid = [
      widget.setSymbol("BTC-USD"),
      widget.setSymbol("ETH-USD"),
      widget.setSymbol("SOL-USD"),
    ];
    await Promise.allSettled(rapid);
    const afterRapid = {
      symbol: widget.getState().symbol,
      identity: widget.getState().identityStatus,
      pending: widget.getDiagnostics().pendingDataRequest,
      close: widget.getChart().getData().at(-1)?.close ?? null,
    };

    let failMessage = "";
    try {
      await widget.setSymbol("FAIL");
    } catch (error) {
      failMessage = error instanceof Error ? error.message : String(error);
    }
    const afterFail = {
      message: failMessage,
      symbol: widget.getState().symbol,
      requested: widget.getState().requestedSymbol,
      identity: widget.getState().identityStatus,
      pending: widget.getDiagnostics().pendingDataRequest,
      close: widget.getChart().getData().at(-1)?.close ?? null,
    };

    // Stale realtime callback from a prior (unsubscribed) handler must not mutate candles.
    const beforeStale = widget.getChart().getData().at(-1)?.close ?? null;
    for (const handler of retiredHandlers) handler({ ...last, close: 9999, high: 9999 });
    const afterStale = widget.getChart().getData().at(-1)?.close ?? null;

    widget.destroy();
    return {
      pendingBefore,
      pendingDuring,
      pendingAfterSuccess,
      afterBtc,
      afterAppend,
      afterCorrection,
      afterEth,
      afterTf,
      afterRapid,
      afterFail,
      beforeStale,
      afterStale,
      log,
      unsubscribed,
      remainingCanvases: ((globalThis as WidgetGlobals).__openklineHost?.querySelectorAll("canvas").length) ?? -1,
      destroyedPending: widget.getDiagnostics().pendingDataRequest,
    };
  }, makeCandles(32));

  expect(result.pendingBefore).toBe(false);
  expect(result.pendingDuring).toBe(true);
  expect(result.pendingAfterSuccess).toBe(false);
  expect(result.afterBtc).toMatchObject({ symbol: "BTC-USD", timeframe: "1m", identity: "confirmed", bars: 32 });
  const lastClose = makeCandles(32).at(-1)!.close;
  expect(result.afterAppend).toBe(lastClose + 5);
  expect(result.afterCorrection).toBe(lastClose + 1);
  expect(result.afterEth.symbol).toBe("ETH-USD");
  expect(result.afterEth.identity).toBe("confirmed");
  expect(result.afterTf).toMatchObject({ timeframe: "15m", identity: "confirmed", pending: false });
  expect(result.afterRapid).toMatchObject({ symbol: "SOL-USD", identity: "confirmed", pending: false });
  expect(result.afterFail.message).toContain("provider rejected");
  expect(result.afterFail).toMatchObject({
    symbol: "SOL-USD",
    requested: "FAIL",
    identity: "failed",
    pending: false,
  });
  expect(result.afterStale).toBe(result.beforeStale);
  expect(result.log.some((entry) => entry.op === "resolveSymbol" && entry.symbol === "BTC-USD")).toBe(true);
  expect(result.log.some((entry) => entry.op === "getBars" && entry.symbol === "BTC-USD")).toBe(true);
  expect(result.log.some((entry) => entry.op === "subscribeBars" && entry.symbol === "BTC-USD")).toBe(true);
  expect(result.log.filter((entry) => entry.op === "unsubscribe").length).toBeGreaterThanOrEqual(1);
  expect(result.unsubscribed).toBeGreaterThanOrEqual(1);
  expect(result.remainingCanvases).toBe(0);
  expect(result.destroyedPending).toBe(false);
});

test("multi-chart datafeeds stay isolated and composition import rolls back on invalid input", async ({ page }, testInfo) => {
  test.skip(!["chromium", "firefox"].includes(testInfo.project.name), "Isolation and composition integrity use desktop Chromium/Firefox");
  await mount(page, "two-horizontal");

  const result = await page.evaluate(async (candles) => {
    const widget = (globalThis as WidgetGlobals).__openklineWidget!;
    const log = (globalThis as WidgetGlobals).__openklineFeedLog!;
    const feedA = {
      async resolveSymbol(symbol: string) {
        log.push({ op: "resolveA", symbol });
        return { symbol, timezone: "UTC", pricePrecision: 2 };
      },
      async getBars(query: { symbol: string }) {
        log.push({ op: "barsA", symbol: query.symbol });
        if (query.symbol === "FAIL-A") throw new Error("A failed");
        return candles;
      },
      subscribeBars() {
        log.push({ op: "subA" });
        return () => { log.push({ op: "unsubA" }); };
      },
    };
    const feedB = {
      async resolveSymbol(symbol: string) {
        log.push({ op: "resolveB", symbol });
        return { symbol, timezone: "UTC", pricePrecision: 2 };
      },
      async getBars(query: { symbol: string }) {
        log.push({ op: "barsB", symbol: query.symbol });
        return candles.map((candle) => {
          const close = candle.close + 25;
          return { ...candle, open: close - 0.4, high: close + 1, low: close - 1, close };
        });
      },
      subscribeBars() {
        log.push({ op: "subB" });
        return () => { log.push({ op: "unsubB" }); };
      },
    };

    widget.setActiveChartId("chart-1");
    await widget.setDatafeed(feedA, { symbol: "BTC-USD", timeframe: "1m", from: 0, to: Number.MAX_SAFE_INTEGER });
    widget.setActiveChartId("chart-2");
    await widget.setDatafeed(feedB, { symbol: "ETH-USD", timeframe: "5m", from: 0, to: Number.MAX_SAFE_INTEGER });

    widget.setActiveChartId("chart-1");
    let failA = "";
    try {
      await widget.setSymbol("FAIL-A");
    } catch (error) {
      failA = error instanceof Error ? error.message : String(error);
    }
    const chart1 = widget.getState().charts.find((chart) => chart.id === "chart-1")!;
    const chart2 = widget.getState().charts.find((chart) => chart.id === "chart-2")!;
    const chart2Close = widget.getCharts().get("chart-2")!.getData().at(-1)?.close ?? null;

    const before = widget.exportComposition();
    const beforeLayout = widget.getLayout();
    const beforeActive = widget.getActiveChartId();
    let invalidMessage = "";
    try {
      widget.importComposition({
        ...before,
        charts: before.charts.map((chart, index) => index === 0
          ? { ...chart, id: "not-canonical" }
          : chart),
      });
    } catch (error) {
      invalidMessage = error instanceof Error ? error.message : String(error);
    }
    const afterInvalid = {
      layout: widget.getLayout(),
      active: widget.getActiveChartId(),
      symbols: widget.getState().charts.map((chart) => chart.symbol),
    };

    let nanMessage = "";
    try {
      widget.importComposition({
        ...before,
        comparison: {
          active: true,
          mode: "percentage",
          baselineTime: Number.NaN,
          baselineMaxAgeMs: 0,
          assetIds: [],
        },
      });
    } catch (error) {
      nanMessage = error instanceof Error ? error.message : String(error);
    }

    widget.importComposition(before);
    widget.setLayout("four-grid");
    widget.setLayout("two-horizontal");
    const restored = widget.getState().charts.find((chart) => chart.id === "chart-2");

    widget.destroy();
    return {
      failA,
      chart1,
      chart2,
      chart2Close,
      invalidMessage,
      nanMessage,
      afterInvalid,
      beforeLayout,
      beforeActive,
      restored,
      log,
      remaining: ((globalThis as WidgetGlobals).__openklineHost?.querySelectorAll("canvas").length) ?? -1,
    };
  }, makeCandles(24, 8));

  expect(result.failA).toContain("A failed");
  expect(result.chart1).toMatchObject({ symbol: "BTC-USD", identityStatus: "failed" });
  expect(result.chart2).toMatchObject({ symbol: "ETH-USD", identityStatus: "confirmed" });
  expect(result.chart2Close).not.toBeNull();
  expect(result.invalidMessage).toMatch(/canonical chart ids|Unexpected|Invalid/i);
  expect(result.nanMessage).toMatch(/Invalid Widget comparison/i);
  expect(result.afterInvalid).toEqual({
    layout: result.beforeLayout,
    active: result.beforeActive,
    symbols: ["BTC-USD", "ETH-USD"],
  });
  expect(result.restored).toMatchObject({ symbol: "ETH-USD", timeframe: "5m" });
  expect(result.log.some((entry) => entry.op === "resolveA")).toBe(true);
  expect(result.log.some((entry) => entry.op === "resolveB")).toBe(true);
  expect(result.log.some((entry) => entry.op === "subA")).toBe(true);
  expect(result.log.some((entry) => entry.op === "subB")).toBe(true);
  expect(result.remaining).toBe(0);
});

test("pending diagnostics clear after cancellation and abort mid-resolution", async ({ page }, testInfo) => {
  test.skip(!["chromium", "firefox"].includes(testInfo.project.name), "Pending-request diagnostics use desktop Chromium/Firefox");
  await mount(page, "single");

  const result = await page.evaluate(async (candles) => {
    const widget = (globalThis as WidgetGlobals).__openklineWidget!;
    const gate: { release: (() => void) | null } = { release: null };
    const feed = {
      async resolveSymbol(symbol: string, signal?: AbortSignal) {
        if (symbol === "SLOW") {
          await new Promise<void>((resolve, reject) => {
            gate.release = resolve;
            const onAbort = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
            signal?.addEventListener("abort", onAbort, { once: true });
          });
        }
        return { symbol, timezone: "UTC", pricePrecision: 2 };
      },
      async getBars() { return candles; },
      subscribeBars() { return () => undefined; },
    };

    const slow = widget.setDatafeed(feed, { symbol: "SLOW", timeframe: "1m", from: 0, to: Number.MAX_SAFE_INTEGER });
    const pendingSlow = widget.getDiagnostics().pendingDataRequest;
    const fast = widget.setDatafeed(feed, { symbol: "FAST", timeframe: "1m", from: 0, to: Number.MAX_SAFE_INTEGER });
    await Promise.allSettled([slow, fast]);
    gate.release?.();
    await Promise.resolve();
    const pendingAfter = widget.getDiagnostics().pendingDataRequest;
    const state = widget.getState();
    widget.destroy();
    return { pendingSlow, pendingAfter, state };
  }, makeCandles(12));

  expect(result.pendingSlow).toBe(true);
  expect(result.pendingAfter).toBe(false);
  expect(result.state).toMatchObject({ symbol: "FAST", identityStatus: "confirmed" });
});
