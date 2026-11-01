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
    const styleCountBefore = document.querySelectorAll("style[data-openkline-widget-style]").length;
    const widget = createOpenKlineWidget({
      container: host,
      data: inputCandles,
      dataIdentity: { symbol: "BTC-USD", timeframe: "1h" },
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
    const replacementCandles = inputCandles.map((candle, index) => {
      const close = 200 + index;
      return { ...candle, open: close - 0.25, high: close + 1, low: close - 1, close };
    });
    widget.setData(replacementCandles, { symbol: "ETH-USD", timeframe: "15m" });
    await widget.saveWorkspace();
    widget.setData([]);
    await widget.loadWorkspace();
    const beforeDestroy = { state: widget.getState(), diagnostics: widget.getDiagnostics(), rect: host.getBoundingClientRect().toJSON(), buttons: host.querySelectorAll("button").length };
    widget.destroy();
    return {
      beforeDestroy,
      afterDestroy: widget.getDiagnostics(),
      hostChildren: host.children.length,
      canvases: document.querySelectorAll("canvas").length,
      styleCountBefore,
      styleCountAfter: document.querySelectorAll("style[data-openkline-widget-style]").length,
    };
  }, candles);

  expect(result.beforeDestroy.state).toMatchObject({ status: "ready", symbol: "ETH-USD", timeframe: "15m", chartType: "area", theme: "light", direction: "rtl", hasData: true });
  expect(result.beforeDestroy.diagnostics.canvasCount).toBe(1);
  expect(result.beforeDestroy.diagnostics.domListeners).toBeGreaterThan(0);
  expect(result.beforeDestroy.diagnostics.chartSubscriptions).toBeGreaterThan(0);
  expect(result.beforeDestroy.diagnostics.styleElementCount).toBe(result.styleCountBefore + 1);
  expect(result.beforeDestroy.rect.width).toBeGreaterThan(700);
  expect(result.beforeDestroy.rect.height).toBeGreaterThan(300);
  expect(result.beforeDestroy.buttons).toBeGreaterThan(0);
  expect(result.afterDestroy).toMatchObject({ destroyed: true, domListeners: 0, chartSubscriptions: 0, pendingDataRequest: false, canvasCount: 0 });
  expect(result.styleCountAfter).toBe(result.styleCountBefore);
  expect(result.hostChildren).toBe(0);
});

test("widget does not relabel direct candles when identity changes", async ({ page }) => {
  await page.goto("/examples/vanilla/index.html");
  const result = await page.evaluate(async (inputCandles) => {
    const moduleUrl = new URL("/dist/src/widget/index.js", location.href).href;
    const { createOpenKlineWidget } = await import(moduleUrl);
    const host = document.createElement("div");
    host.style.width = "480px";
    host.style.height = "320px";
    document.body.append(host);
    const widget = createOpenKlineWidget({
      container: host,
      data: inputCandles,
      dataIdentity: { symbol: "BTC-USD", timeframe: "1h" },
    });
    const original = widget.getChart().getData()[0];
    let symbolError = "";
    let timeframeError = "";
    try { await widget.setSymbol("ETH-USD"); } catch (error) { symbolError = error instanceof Error ? error.message : String(error); }
    try { await widget.setTimeframe("15m"); } catch (error) { timeframeError = error instanceof Error ? error.message : String(error); }
    const snapshot = widget.getState();
    const dataAfter = widget.getChart().getData()[0];
    widget.destroy();
    return { snapshot, original, dataAfter, symbolError, timeframeError };
  }, candles);

  expect(result.snapshot).toMatchObject({ status: "error", symbol: "BTC-USD", timeframe: "1h", requestedSymbol: "BTC-USD", requestedTimeframe: "1h", identityStatus: "confirmed", hasData: true });
  expect(result.symbolError).toContain("Cannot change symbol");
  expect(result.timeframeError).toContain("Cannot change timeframe");
  expect(result.dataAfter).toEqual(result.original);
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
    const fastCandles = inputCandles.slice(0, 8).map((candle, index) => {
      const close = 500 + index;
      return { ...candle, open: close - 0.25, high: close + 1, low: close - 1, close };
    });
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
        if (query.symbol === "FAIL") return Promise.reject(new Error("feed failure"));
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
    const second = createOpenKlineWidget({ container: secondHost, data: inputCandles, dataIdentity: { symbol: "SECOND", timeframe: "1m" } });
    const styleCountWithTwo = document.querySelectorAll("style[data-openkline-widget-style]").length;
    const slow = first.setDatafeed(feed, { symbol: "SLOW", timeframe: "1m", from: 0, to: Number.MAX_SAFE_INTEGER });
    await Promise.resolve();
    const fast = first.setDatafeed(feed, { symbol: "FAST", timeframe: "1m", from: 0, to: Number.MAX_SAFE_INTEGER });
    await Promise.allSettled([slow, fast]);
    await first.setSymbol("NEXT");
    await first.setTimeframe("5m");
    let failure = "";
    try { await first.setSymbol("FAIL"); } catch (error) { failure = error instanceof Error ? error.message : String(error); }
    const failedState = first.getState();
    await first.setSymbol("NEXT");
    await first.saveWorkspace();
    first.setData([]);
    await first.loadWorkspace();
    first.setTheme("light");
    first.destroy();
    const styleCountWithOne = document.querySelectorAll("style[data-openkline-widget-style]").length;
    const secondState = second.getState();
    const secondDiagnostics = second.getDiagnostics();
    second.destroy();
    return {
      firstState: first.getState(),
      secondState,
      secondDiagnostics,
      aborted,
      failure,
      failedState,
      remainingCanvases: document.querySelectorAll("canvas").length,
      baselineCanvases,
      remainingWidgetCanvases: firstHost.querySelectorAll("canvas").length + secondHost.querySelectorAll("canvas").length,
      styleCountWithTwo,
      styleCountWithOne,
      styleCountAfterDestroy: document.querySelectorAll("style[data-openkline-widget-style]").length,
    };
  }, candles);

  expect(result.aborted).toBeGreaterThanOrEqual(1);
  expect(result.failure).toBe("feed failure");
  expect(result.failedState).toMatchObject({ status: "error", symbol: "NEXT", timeframe: "5m", requestedSymbol: "FAIL", requestedTimeframe: "5m", identityStatus: "failed", hasData: true });
  expect(result.firstState).toMatchObject({ status: "destroyed", hasData: false });
  expect(result.secondState).toMatchObject({ status: "ready", hasData: true });
  expect(result.secondDiagnostics.canvasCount).toBe(1);
  expect(result.styleCountWithTwo).toBeGreaterThanOrEqual(1);
  expect(result.styleCountWithOne).toBe(result.styleCountWithTwo);
  expect(result.styleCountAfterDestroy).toBe(0);
  expect(result.remainingCanvases).toBe(result.baselineCanvases);
  expect(result.remainingWidgetCanvases).toBe(0);
});

test("widget scopes CSS and releases shared styles after independent instances are destroyed", async ({ page }) => {
  await page.goto("/examples/vanilla/index.html");
  const result = await page.evaluate((inputCandles) => {
    const moduleUrl = new URL("/dist/src/widget/index.js", location.href).href;
    return import(moduleUrl).then(({ createOpenKlineWidget }) => {
      const styleCountBefore = document.querySelectorAll("style[data-openkline-widget-style]").length;
      const hostStyle = document.createElement("style");
      hostStyle.textContent = ".widget-host-only-button { background: rgb(1, 2, 3); }";
      document.head.append(hostStyle);
      const outsideButton = document.createElement("button");
      outsideButton.className = "widget-host-only-button";
      document.body.append(outsideButton);
      const firstHost = document.createElement("div");
      const secondHost = document.createElement("div");
      for (const host of [firstHost, secondHost]) {
        host.style.width = "360px";
        host.style.height = "300px";
        document.body.append(host);
      }
      const first = createOpenKlineWidget({ container: firstHost, data: inputCandles, dataIdentity: { symbol: "ONE", timeframe: "1m" } });
      const second = createOpenKlineWidget({ container: secondHost, data: inputCandles, dataIdentity: { symbol: "TWO", timeframe: "1m" } });
      const widgetButton = firstHost.querySelector("button");
      if (widgetButton === null) throw new Error("Widget button was not created");
      const during = {
        styleCount: document.querySelectorAll("style[data-openkline-widget-style]").length,
        outsideBackground: getComputedStyle(outsideButton).backgroundColor,
        widgetBackground: getComputedStyle(widgetButton).backgroundColor,
        firstDiagnostics: first.getDiagnostics(),
      };
      first.destroy();
      const afterFirst = second.getDiagnostics();
      second.destroy();
      outsideButton.remove();
      hostStyle.remove();
      firstHost.remove();
      secondHost.remove();
      const cycleCounts: Array<{ during: number; after: number }> = [];
      for (let index = 0; index < 3; index += 1) {
        const cycleHost = document.createElement("div");
        cycleHost.style.width = "320px";
        cycleHost.style.height = "280px";
        document.body.append(cycleHost);
        const cycleWidget = createOpenKlineWidget({ container: cycleHost, data: inputCandles, dataIdentity: { symbol: `CYCLE-${index}`, timeframe: "1m" } });
        cycleCounts.push({ during: document.querySelectorAll("style[data-openkline-widget-style]").length, after: -1 });
        cycleWidget.destroy();
        cycleCounts[cycleCounts.length - 1].after = document.querySelectorAll("style[data-openkline-widget-style]").length;
        cycleHost.remove();
      }
      return { styleCountBefore, during, afterFirst, styleCountAfter: document.querySelectorAll("style[data-openkline-widget-style]").length, cycleCounts };
    });
  }, candles);

  expect(result.during.styleCount).toBe(result.styleCountBefore + 1);
  expect(result.during.outsideBackground).toBe("rgb(1, 2, 3)");
  expect(result.during.widgetBackground).not.toBe(result.during.outsideBackground);
  expect(result.during.firstDiagnostics.styleElementCount).toBe(result.styleCountBefore + 1);
  expect(result.afterFirst.styleElementCount).toBe(result.styleCountBefore + 1);
  expect(result.cycleCounts).toEqual([
    { during: result.styleCountBefore + 1, after: result.styleCountBefore },
    { during: result.styleCountBefore + 1, after: result.styleCountBefore },
    { during: result.styleCountBefore + 1, after: result.styleCountBefore },
  ]);
  expect(result.styleCountAfter).toBe(result.styleCountBefore);
});
