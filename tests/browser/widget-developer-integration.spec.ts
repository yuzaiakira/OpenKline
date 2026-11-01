import { expect, test } from "@playwright/test";

test("vanilla widget integration fixture covers offline lifecycle and cleanup", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Vanilla Widget integration is verified in desktop Chromium");
  await page.goto("/examples/vanilla/widget-integration.html");
  await expect(page.locator("#log")).toContainText("ready status=");
  await expect(page.locator("#log")).toContainText("composition charts=2");

  const result = await page.evaluate(() => {
    const state = (globalThis as typeof globalThis & {
      __openklineWidgetIntegration: {
        widget: {
          getState(): { status: string; layout: string; charts: unknown[] };
          getFeatures(): { layout: boolean };
          getDiagnostics(): { destroyed: boolean; canvasCount: number; pendingDataRequest: boolean; chartSubscriptions: number };
          exportComposition(): { version: number; charts: unknown[] };
          destroy(): void;
        };
        unsubscribe: () => void;
        host: HTMLElement;
        memoryStorage: { store: Map<string, string> };
      };
    }).__openklineWidgetIntegration;
    const before = {
      status: state.widget.getState().status,
      layout: state.widget.getState().layout,
      charts: state.widget.getState().charts.length,
      featuresLayout: state.widget.getFeatures().layout,
      compositionVersion: state.widget.exportComposition().version,
      storageKeys: [...state.memoryStorage.store.keys()],
      canvases: state.host.querySelectorAll("canvas").length,
    };
    state.unsubscribe();
    state.widget.destroy();
    return {
      before,
      after: {
        diagnostics: state.widget.getDiagnostics(),
        canvases: state.host.querySelectorAll("canvas").length,
        hostChildren: state.host.children.length,
      },
    };
  });

  expect(result.before.status).toBe("ready");
  expect(result.before.layout).toBe("two-horizontal");
  expect(result.before.charts).toBe(2);
  expect(result.before.featuresLayout).toBe(true);
  expect(result.before.compositionVersion).toBe(1);
  expect(result.before.storageKeys).toContain("openkline-internal-widget-demo");
  expect(result.before.canvases).toBeGreaterThan(0);
  expect(result.after.diagnostics).toMatchObject({ destroyed: true, canvasCount: 0, pendingDataRequest: false });
  expect(result.after.canvases).toBe(0);
  expect(result.after.hostChildren).toBe(0);
});

test("CSP external stylesheet mode avoids Widget-owned inline styles", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "CSP fixture uses desktop Chromium");
  await page.goto("/examples/vanilla/widget-csp.html");
  await expect(page.locator("#status")).toContainText('"status": "ready"');
  const result = await page.evaluate(() => {
    const api = (globalThis as typeof globalThis & {
      __openklineWidgetCsp: {
        report: () => Record<string, unknown>;
        destroy: () => void;
      };
    }).__openklineWidgetCsp;
    const before = api.report();
    api.destroy();
    return { before, after: api.report() };
  });
  expect(result.before).toMatchObject({
    styleCount: 0,
    hostStylesheetLinked: true,
    widgetStylesheetLinked: true,
    status: "ready",
  });
  expect(result.after).toMatchObject({
    styleCount: 0,
    destroyed: true,
    remainingCanvases: 0,
  });
});

test("datafeed and memory storage fixtures remain host-owned", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Datafeed/Storage fixtures use desktop Chromium");
  await page.goto("/examples/vanilla/index.html");
  const result = await page.evaluate(async () => {
    const moduleUrl = new URL("/dist/src/widget/index.js", location.href).href;
    const { createOpenKlineWidget } = await import(moduleUrl);
    const host = document.createElement("div");
    host.style.cssText = "width:480px;height:360px";
    document.body.append(host);
    const candles = Array.from({ length: 16 }, (_, index) => {
      const close = 80 + index;
      return { time: Date.UTC(2026, 0, 1) + index * 60_000, open: close - 0.2, high: close + 0.6, low: close - 0.6, close, volume: 100 };
    });
    const ops: string[] = [];
    const realtime: { emit: ((bar: (typeof candles)[number]) => void) | null } = { emit: null };
    const feed = {
      async resolveSymbol(symbol: string) {
        ops.push(`resolve:${symbol}`);
        return { symbol, timezone: "UTC", pricePrecision: 2 };
      },
      async getBars(query: { symbol: string; signal?: AbortSignal }) {
        ops.push(`bars:${query.symbol}`);
        if (query.signal?.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
        return candles;
      },
      subscribeBars(args: { onBar: (bar: (typeof candles)[number]) => void }) {
        ops.push("subscribe");
        realtime.emit = args.onBar;
        return () => { ops.push("unsubscribe"); realtime.emit = null; };
      },
    };
    const storage = {
      value: null as string | null,
      async load() { return this.value; },
      async save(_key: string, value: string) { this.value = value; },
      async remove() { this.value = null; },
    };
    const widget = createOpenKlineWidget({ container: host, storage, chartOptions: { autoSize: true } });
    await widget.setDatafeed(feed, { symbol: "AAA", timeframe: "1m", from: 0, to: Number.MAX_SAFE_INTEGER });
    const last = candles.at(-1)!;
    realtime.emit?.({ ...last, close: last.close + 1, high: last.high + 1 });
    await widget.saveWorkspace();
    const restored = JSON.parse(storage.value ?? "{}");
    widget.destroy();
    return {
      ops,
      close: last.close + 1,
      restoredVersion: restored.version,
      remaining: host.querySelectorAll("canvas").length,
    };
  });
  expect(result.ops).toEqual(["resolve:AAA", "bars:AAA", "subscribe", "unsubscribe"]);
  expect(result.restoredVersion).toBe(1);
  expect(result.remaining).toBe(0);
});
