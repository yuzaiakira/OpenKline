import { expect, test } from "@playwright/test";

type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };

const candles: Candle[] = Array.from({ length: 24 }, (_, index) => {
  const close = 100 + index * 0.5;
  return {
    time: Date.UTC(2026, 0, 1) + index * 60_000,
    open: close - 0.25,
    high: close + 1,
    low: close - 1,
    close,
    volume: 100 + index,
  };
});

test("internal widget supports offline controls, keyboard access, RTL and cleanup", async ({ page }) => {
  await page.goto("/examples/vanilla/index.html");
  const result = await page.evaluate(async (inputCandles) => {
    const moduleUrl = new URL("/dist/src/widget/index.js", location.href).href;
    const { createOpenKlineWidget } = await import(moduleUrl);
    const host = document.createElement("div");
    host.style.width = "760px";
    host.style.height = "420px";
    document.body.append(host);
    const widget = createOpenKlineWidget({
      container: host,
      data: inputCandles,
      chartOptions: { theme: "dark", direction: "ltr", autoSize: true },
      storage: {
        value: null as string | null,
        async load(_key: string) { return this.value; },
        async save(_key: string, value: string) { this.value = value; },
      },
    });
    const chartType = host.querySelector<HTMLSelectElement>('select[aria-label="Chart type"]');
    const themeButton = host.querySelector<HTMLButtonElement>('button[aria-label="Theme"]');
    const directionButton = host.querySelector<HTMLButtonElement>('button[aria-label="Direction"]');
    const indicatorButton = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent === "Add");
    const drawingButton = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent === "Start");
    if (chartType === null || themeButton === null || directionButton === null || indicatorButton === undefined || drawingButton === undefined) throw new Error("Widget controls were not created");

    chartType.focus();
    chartType.value = "area";
    chartType.dispatchEvent(new Event("change", { bubbles: true }));
    themeButton.focus();
    themeButton.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    themeButton.click();
    directionButton.click();
    indicatorButton.click();
    drawingButton.click();
    await widget.setSymbol("ETH-USD");
    await widget.setTimeframe("15m");
    await widget.saveWorkspace();
    await widget.setSymbol("BTC-USD");
    await widget.setTimeframe("1d");
    await widget.loadWorkspace();
    const beforeDestroy = { state: widget.getState(), diagnostics: widget.getDiagnostics(), rect: host.getBoundingClientRect().toJSON(), buttons: host.querySelectorAll("button").length };
    widget.destroy();
    return {
      beforeDestroy,
      afterDestroy: widget.getDiagnostics(),
      hostChildren: host.children.length,
      canvases: document.querySelectorAll("canvas").length,
    };
  }, candles);

  expect(result.beforeDestroy.state).toMatchObject({ status: "ready", symbol: "ETH-USD", timeframe: "15m", chartType: "area", theme: "light", direction: "rtl", hasData: true });
  expect(result.beforeDestroy.diagnostics.canvasCount).toBe(1);
  expect(result.beforeDestroy.diagnostics.domListeners).toBeGreaterThan(0);
  expect(result.beforeDestroy.diagnostics.chartSubscriptions).toBeGreaterThan(0);
  expect(result.beforeDestroy.rect.width).toBeGreaterThan(700);
  expect(result.beforeDestroy.rect.height).toBeGreaterThan(300);
  expect(result.beforeDestroy.buttons).toBeGreaterThan(0);
  expect(result.afterDestroy).toMatchObject({ destroyed: true, domListeners: 0, chartSubscriptions: 0, pendingDataRequest: false, canvasCount: 0 });
  expect(result.hostChildren).toBe(0);
});

test("widget isolates instances and cancels stale datafeed loads", async ({ page }) => {
  await page.goto("/examples/vanilla/index.html");
  const result = await page.evaluate(async (inputCandles) => {
    const moduleUrl = new URL("/dist/src/widget/index.js", location.href).href;
    const { createOpenKlineWidget } = await import(moduleUrl);
    const firstHost = document.createElement("div");
    const secondHost = document.createElement("div");
    const baselineCanvases = document.querySelectorAll("canvas").length;
    for (const host of [firstHost, secondHost]) {
      host.style.width = "360px";
      host.style.height = "300px";
      document.body.append(host);
    }
    let aborted = 0;
    const fastCandles = inputCandles.slice(0, 8).map((candle, index) => ({ ...candle, close: 500 + index }));
    const feed = {
      async resolveSymbol(symbol: string) { return { symbol, timezone: "UTC", pricePrecision: 2 }; },
      getBars(query: { symbol: string; timeframe: string; from: number; to: number; signal?: AbortSignal }) {
        if (query.symbol === "SLOW") {
          return new Promise<typeof inputCandles>((resolve, reject) => {
            const onAbort = () => { aborted += 1; reject(Object.assign(new Error("aborted"), { name: "AbortError" })); };
            query.signal?.addEventListener("abort", onAbort, { once: true });
            setTimeout(() => { query.signal?.removeEventListener("abort", onAbort); resolve(inputCandles); }, 200);
          });
        }
        return Promise.resolve(fastCandles);
      },
      subscribeBars() { return () => undefined; },
    };
    const storage = {
      value: null as string | null,
      async load() { return this.value; },
      async save(_key: string, value: string) { this.value = value; },
    };
    const first = createOpenKlineWidget({ container: firstHost, data: inputCandles, storage });
    const second = createOpenKlineWidget({ container: secondHost, data: inputCandles });
    const slow = first.setDatafeed(feed, { symbol: "SLOW", timeframe: "1m", from: 0, to: Number.MAX_SAFE_INTEGER });
    await Promise.resolve();
    const fast = first.setDatafeed(feed, { symbol: "FAST", timeframe: "1m", from: 0, to: Number.MAX_SAFE_INTEGER });
    await Promise.allSettled([slow, fast]);
    await first.saveWorkspace();
    first.setData([]);
    await first.loadWorkspace();
    first.setTheme("light");
    first.destroy();
    const secondState = second.getState();
    const secondDiagnostics = second.getDiagnostics();
    second.destroy();
    return {
      firstState: first.getState(),
      secondState,
      secondDiagnostics,
      aborted,
      remainingCanvases: document.querySelectorAll("canvas").length,
      baselineCanvases,
      remainingWidgetCanvases: firstHost.querySelectorAll("canvas").length + secondHost.querySelectorAll("canvas").length,
    };
  }, candles);

  expect(result.aborted).toBeGreaterThanOrEqual(1);
  expect(result.firstState).toMatchObject({ status: "destroyed", hasData: false });
  expect(result.secondState).toMatchObject({ status: "ready", hasData: true });
  expect(result.secondDiagnostics.canvasCount).toBe(1);
  expect(result.remainingCanvases).toBe(result.baselineCanvases);
  expect(result.remainingWidgetCanvases).toBe(0);
});
