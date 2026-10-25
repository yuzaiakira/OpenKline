import { expect, test } from "@playwright/test";

test("renders candles and supports interaction and cleanup", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/examples/vanilla/index.html");
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveCount(1);
  await page.waitForFunction(() => Boolean((globalThis as { __openklineChart?: unknown }).__openklineChart));

  const initial = await page.evaluate(() => {
    const chart = (globalThis as unknown as { __openklineChart: { getVisibleRange(): { from: number; to: number } } }).__openklineChart;
    const element = document.querySelector("canvas") as HTMLCanvasElement;
    const context = element.getContext("2d");
    const pixel = context?.getImageData(100, 100, 1, 1).data ?? new Uint8ClampedArray();
    return { range: chart.getVisibleRange(), pixel: Array.from(pixel), width: element.width, height: element.height };
  });

  expect(initial.range.to).toBeGreaterThan(initial.range.from);
  expect(initial.width).toBeGreaterThan(0);
  expect(initial.height).toBeGreaterThan(0);
  expect(initial.pixel.length).toBe(4);

  const seriesIds = await page.evaluate(() => (globalThis as unknown as { __openklineChart: { getSeriesIds(): string[] } }).__openklineChart.getSeriesIds());
  expect(seriesIds.slice(0, 4)).toEqual(["price", "trend", "area", "volume"]);
  expect(seriesIds).toHaveLength(13);
  const seriesInfo = await page.evaluate(() => {
    const chart = (globalThis as unknown as {
      __openklineChart: {
        getSeriesInfo(): Array<{ id: string; dataLength: number; style: { visible?: boolean; upColor?: string } }>;
        setSeriesStyle(id: string, style: { visible?: boolean; upColor?: string }): void;
      };
    }).__openklineChart;
    chart.setSeriesStyle("price", { visible: false, upColor: "#10b981" });
    const info = chart.getSeriesInfo();
    info[0]!.style.visible = true;
    return { price: chart.getSeriesInfo().find((series) => series.id === "price"), count: info.length };
  });
  expect(seriesInfo.count).toBe(13);
  expect(seriesInfo.price).toMatchObject({ id: "price", dataLength: 80, style: { visible: false, upColor: "#10b981" } });
  await page.evaluate(() => (globalThis as unknown as { __openklineChart: { setSeriesStyle(id: string, style: { visible?: boolean }): void } }).__openklineChart.setSeriesStyle("price", { visible: true }));
  const paneIds = await page.evaluate(() => (globalThis as unknown as { __openklineChart: { getPaneIds(): string[] } }).__openklineChart.getPaneIds());
  expect(paneIds).toHaveLength(5);

  await page.evaluate(() => {
    const chart = (globalThis as unknown as { __openklineChart: { subscribe(name: string, handler: (event: unknown) => void): void } }).__openklineChart;
    chart.subscribe("crosshairMove", (event) => {
      (globalThis as unknown as { __lastCrosshair?: unknown }).__lastCrosshair = event;
    });
  });

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) {
    return;
  }

  await page.mouse.move(box.x + box.width * 0.61, box.y + 40);
  await expect(page).toHaveTitle(/OpenKline \d/);
  await page.waitForFunction(() => {
    const event = (globalThis as unknown as { __lastCrosshair?: { series?: unknown[] } }).__lastCrosshair;
    return (event?.series?.length ?? 0) === 13;
  });

  const percentageState = await page.evaluate(() => {
    const chart = (globalThis as unknown as {
      __openklineChart: {
        setPriceScaleOptions(options: { mode?: "linear" | "logarithmic" | "percentage" | "indexed"; referencePrice?: number; marginTop?: number; marginBottom?: number; axisVisible?: boolean }): void;
        getPriceScaleState(): { activeMode: string; diagnostic?: { code: string }; range?: { min: number; max: number } };
      };
    }).__openklineChart;
    chart.setPriceScaleOptions({ mode: "percentage", referencePrice: 100, marginTop: 0, marginBottom: 0, axisVisible: true });
    return chart.getPriceScaleState();
  });
  await page.mouse.move(box.x + box.width * 0.59, box.y + 40);
  const priceScaleResult = await page.evaluate(() => {
    const chart = (globalThis as unknown as {
      __openklineChart: {
        setPriceScaleRange(range: { min: number; max: number }): void;
        resetPriceScale(): void;
        setPriceScaleOptions(options: { mode?: "linear" | "logarithmic" | "percentage" | "indexed" }): void;
        getPriceScaleState(): { activeMode: string; diagnostic?: { code: string }; range?: { min: number; max: number } };
      };
    }).__openklineChart;
    const crosshair = (globalThis as unknown as { __lastCrosshair?: { price: number | null; formattedPrice?: string | null; priceScaleMode?: string } }).__lastCrosshair;
    chart.setPriceScaleRange({ min: 90, max: 130 });
    const manual = chart.getPriceScaleState();
    chart.resetPriceScale();
    chart.setPriceScaleOptions({ mode: "logarithmic" });
    const logarithmic = chart.getPriceScaleState();
    return { crosshair, manual, logarithmic };
  });
  expect(percentageState.activeMode).toBe("percentage");
  expect(priceScaleResult.crosshair?.price).toBeGreaterThan(0);
  expect(priceScaleResult.crosshair?.formattedPrice).toMatch(/%$/);
  expect(priceScaleResult.crosshair?.priceScaleMode).toBe("percentage");
  expect(priceScaleResult.manual.range).toEqual({ min: 90, max: 130 });
  expect(priceScaleResult.logarithmic.activeMode).toBe("logarithmic");

  const beforeZoom = await page.evaluate(() => (globalThis as unknown as { __openklineChart: { getVisibleRange(): { from: number; to: number } } }).__openklineChart.getVisibleRange());
  await page.mouse.wheel(0, -500);
  const afterZoom = await page.evaluate(() => (globalThis as unknown as { __openklineChart: { getVisibleRange(): { from: number; to: number } } }).__openklineChart.getVisibleRange());
  expect(afterZoom.to - afterZoom.from).toBeLessThan(beforeZoom.to - beforeZoom.from);

  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.5);
  await page.mouse.up();
  const afterPan = await page.evaluate(() => (globalThis as unknown as { __openklineChart: { getVisibleRange(): { from: number; to: number } } }).__openklineChart.getVisibleRange());
  expect(afterPan.from).toBeGreaterThan(afterZoom.from);

  const navigationCommands = await page.evaluate(() => {
    const chart = (globalThis as unknown as {
      __openklineChart: {
        getData(): unknown[];
        getVisibleRange(): { from: number; to: number };
        fitContent(): void;
        resetView(): void;
      };
    }).__openklineChart;
    chart.fitContent();
    const fit = chart.getVisibleRange();
    chart.resetView();
    const reset = chart.getVisibleRange();
    return { dataLength: chart.getData().length, fit, reset };
  });
  expect(navigationCommands.fit).toEqual({ from: 0, to: navigationCommands.dataLength });
  expect(navigationCommands.reset.to).toBe(navigationCommands.dataLength);

  const beforeTheme = await page.evaluate(() => Array.from((document.querySelector("canvas") as HTMLCanvasElement).getContext("2d")!.getImageData(0, 0, 1, 1).data));
  await page.evaluate(() => (globalThis as unknown as { __openklineChart: { setOptions(options: { theme: string }): void } }).__openklineChart.setOptions({ theme: "light" }));
  const afterTheme = await page.evaluate(() => Array.from((document.querySelector("canvas") as HTMLCanvasElement).getContext("2d")!.getImageData(0, 0, 1, 1).data));
  expect(afterTheme).not.toEqual(beforeTheme);

  await page.evaluate(() => {
    const chart = (globalThis as unknown as { __openklineChart: { update(candle: object): void; addLineSeries(options: object): { setData(data: object[]): void; remove(): void }; destroy(): void } }).__openklineChart;
    chart.update({ time: Date.UTC(2026, 0, 1) + 79 * 60 * 60 * 1000, open: 101, high: 104, low: 99, close: 103 });
    const temporary = chart.addLineSeries({ id: "temporary" });
    temporary.setData([{ time: Date.UTC(2026, 0, 1), value: 100 }]);
    temporary.remove();
  });

  const finalSeriesIds = await page.evaluate(() => (globalThis as unknown as { __openklineChart: { getSeriesIds(): string[] } }).__openklineChart.getSeriesIds());
  expect(finalSeriesIds).toHaveLength(13);
  expect(finalSeriesIds).not.toContain("temporary");

  const replacementIndicatorId = await page.evaluate(() => {
    const chart = (globalThis as unknown as {
      __openklineChart: {
        removeIndicator(id: string): void;
        addIndicator(id: string, options: object): { id: string; remove(): void };
      };
    }).__openklineChart;
    chart.removeIndicator("indicator-1");
    const replacement = chart.addIndicator("RSI", { period: 7 });
    const id = replacement.id;
    replacement.remove();
    return id;
  });
  expect(replacementIndicatorId).toBe("indicator-5");

  const filledBandPixels = await page.evaluate(() => {
    const chart = (globalThis as unknown as {
      __openklineChart: {
        addIndicator(id: string, options: object): { setOutputStyle(outputId: string, style: object): void; remove(): void };
      };
    }).__openklineChart;
    const band = chart.addIndicator("BOLLINGER_BANDS", { period: 5, standardDeviations: 1, pane: "main" });
    band.setOutputStyle("upper", { fillColor: "#ff00ff", fillOpacity: 0.5 });
    band.setOutputStyle("lower", { color: "#ff00ff" });
    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    const pixels = canvas.getContext("2d")!.getImageData(68, 14, canvas.width - 80, canvas.height - 44).data;
    const count = Array.from({ length: Math.floor(pixels.length / 4) }, (_, index) => index)
      .filter((index) => {
        const offset = index * 4;
        return (pixels[offset] ?? 0) > 100 && (pixels[offset + 2] ?? 0) > 100 && (pixels[offset + 1] ?? 0) < 100;
      }).length;
    band.remove();
    return count;
  });
  expect(filledBandPixels).toBeGreaterThan(0);

  const drawingState = await page.evaluate(() => {
    const chart = (globalThis as unknown as {
      __openklineChart: {
        getData(): Array<{ time: number; high: number; low: number }>;
        addDrawing(type: string, options: object): { id: string };
        getDrawings(): Array<{ id: string; type: string }>;
        serializeDrawings(): { version: number; drawings: unknown[] };
      };
    }).__openklineChart;
    const data = chart.getData();
    chart.addDrawing("trend-line", {
      id: "browser-trend",
      points: [
        { time: data[10]!.time, price: data[10]!.low },
        { time: data[30]!.time, price: data[30]!.high },
      ],
      style: { color: "#f59e0b", lineWidth: 2 },
    });
    return { count: chart.getDrawings().length, document: chart.serializeDrawings() };
  });
  expect(drawingState.count).toBe(1);
  expect(drawingState.document.version).toBe(1);
  await page.evaluate(() => (globalThis as unknown as { __openklineChart: { startDrawing(type: string): void } }).__openklineChart.startDrawing("vertical-line"));
  await page.mouse.click(box.x + 120, box.y + 42);
  const interactiveDrawingCount = await page.evaluate(() => (globalThis as unknown as { __openklineChart: { getDrawings(): unknown[] } }).__openklineChart.getDrawings().length);
  expect(interactiveDrawingCount).toBe(2);

  if (test.info().project.name.startsWith("mobile-")) {
    await page.evaluate(() => (globalThis as unknown as { __openklineChart: { startDrawing(type: string): void } }).__openklineChart.startDrawing("vertical-line"));
    await page.touchscreen.tap(box.x + 160, box.y + 48);
    const touchDrawingCount = await page.evaluate(() => (globalThis as unknown as { __openklineChart: { getDrawings(): unknown[] } }).__openklineChart.getDrawings().length);
    expect(touchDrawingCount).toBe(3);
  }

  const beforeResize = await canvas.evaluate((element) => ({
    cssWidth: element.getBoundingClientRect().width,
    cssHeight: element.getBoundingClientRect().height,
    backingWidth: (element as HTMLCanvasElement).width,
    backingHeight: (element as HTMLCanvasElement).height,
    viewportWidth: window.innerWidth,
  }));
  const viewportBeforeResize = await page.evaluate(() => (globalThis as unknown as { __openklineChart: { getVisibleRange(): { from: number; to: number } } }).__openklineChart.getVisibleRange());
  await page.setViewportSize({ width: 800, height: 700 });
  await expect.poll(async () => {
    const metrics = await canvas.evaluate((element) => ({
      cssWidth: element.getBoundingClientRect().width,
      cssHeight: element.getBoundingClientRect().height,
      backingWidth: (element as HTMLCanvasElement).width,
      backingHeight: (element as HTMLCanvasElement).height,
      viewportWidth: window.innerWidth,
    }));
    return metrics.backingWidth >= metrics.cssWidth
      && metrics.backingHeight >= metrics.cssHeight
      && (metrics.backingWidth !== beforeResize.backingWidth
        || metrics.backingHeight !== beforeResize.backingHeight
        || metrics.viewportWidth !== beforeResize.viewportWidth);
  }).toBe(true);
  const viewportAfterResize = await page.evaluate(() => (globalThis as unknown as { __openklineChart: { getVisibleRange(): { from: number; to: number } } }).__openklineChart.getVisibleRange());
  expect(viewportAfterResize.to - viewportAfterResize.from).toBe(viewportBeforeResize.to - viewportBeforeResize.from);

  const pluginResult = await page.evaluate(() => {
    const chart = (globalThis as unknown as {
      __openklineChart: {
        installPlugin(plugin: object): { dispose(): void };
        getPlugins(): Array<{ id: string }>;
        getCommands(): Array<{ id: string }>;
        getPluginState(id: string): Record<string, unknown> | undefined;
        addIndicator(id: string, options: object): { id: string; remove(): void; getResult(): { outputs: unknown[] } };
        addDrawing(type: string, options: object): { id: string };
        getData(): Array<{ time: number; high: number; low: number }>;
        startDrawing(type: string): void;
        getDrawings(): Array<{ id: string; type: string }>;
        removeDrawing(id: string): void;
        uninstallPlugin(id: string): boolean;
      };
    }).__openklineChart;
    chart.installPlugin({
      metadata: {
        id: "example.browser",
        name: "Browser Plugin",
        version: "1.0.0",
        apiVersion: 1,
        description: "Browser verification plugin",
      },
      setup: (context: {
        state: { set(key: string, value: unknown): void };
        indicators: { register(definition: object): void };
        drawings: { register(definition: object): void };
        overlays: { register(definition: object): void };
        events: { on(name: string, handler: () => void): void };
        commands: { register(command: object): void };
      }) => {
        context.state.set("mounted", true);
        context.indicators.register({
          metadata: {
            id: "DOUBLE_CLOSE",
            name: "Double Close",
            version: 1,
            description: "Plugin indicator",
            parameters: [{ name: "multiplier", type: "number", required: true }],
            outputs: [{ id: "value", title: "Value", kind: "line" }],
          },
          validateParameters: (parameters: unknown) => ({ multiplier: (parameters as { multiplier: number }).multiplier }),
          calculate: (input: Array<{ time: number; close: number }>, parameters: { multiplier: number }) => ({
            indicatorId: "DOUBLE_CLOSE",
            parameters,
            outputs: [{ id: "value", title: "Value", kind: "line", points: input.map((candle) => ({ time: candle.time, value: candle.close * parameters.multiplier })) }],
          }),
        });
        context.drawings.register({
          type: "ray-browser",
          minPoints: 2,
          maxPoints: 2,
          validate: (snapshot: { points: unknown[] }) => {
            if (snapshot.points.length !== 2) throw new Error("ray requires two points");
          },
          getGeometry: (snapshot: { points: Array<{ time: number; price: number }> }, converter: { xForTime(time: number): number; yForPrice(price: number): number }) => [{
            kind: "line",
            from: { x: converter.xForTime(snapshot.points[0]!.time), y: converter.yForPrice(snapshot.points[0]!.price) },
            to: { x: converter.xForTime(snapshot.points[1]!.time) + 160, y: converter.yForPrice(snapshot.points[1]!.price) },
          }],
          hitTest: () => 0,
        });
        context.overlays.register({
          id: "example.overlay",
          title: "Browser Overlay",
          render: (renderContext: { pane(id?: string): { left: number; right: number; top: number } | undefined }) => {
            const pane = renderContext.pane();
            return pane === undefined ? [] : [{ kind: "line", from: { x: pane.left, y: pane.top + 12 }, to: { x: pane.right, y: pane.top + 12 }, color: "#ff00ff", lineWidth: 3 }];
          },
        });
        context.events.on("crosshairMove", () => undefined);
        context.commands.register({ id: "example.browser.refresh", title: "Refresh", execute: () => "ok" });
      },
    });
    const indicator = chart.addIndicator("DOUBLE_CLOSE", { multiplier: 1.2 });
    const data = chart.getData();
    const drawing = chart.addDrawing("ray-browser", {
      points: [
        { time: data[10]!.time, price: data[10]!.low },
        { time: data[30]!.time, price: data[30]!.high },
      ],
      style: { color: "#ff00ff", lineWidth: 2 },
    });
    return {
      pluginId: chart.getPlugins()[0]?.id,
      commandId: chart.getCommands()[0]?.id,
      state: chart.getPluginState("example.browser"),
      indicatorOutputs: indicator.getResult().outputs.length,
      indicatorId: indicator.id,
      drawingId: drawing.id,
    };
  });
  expect(pluginResult.pluginId).toBe("example.browser");
  expect(pluginResult.commandId).toBe("example.browser.refresh");
  expect(pluginResult.state).toEqual({ mounted: true });
  expect(pluginResult.indicatorOutputs).toBe(1);
  const pluginDrawingCount = await page.evaluate(() => (globalThis as unknown as { __openklineChart: { getDrawings(): Array<{ type: string }> } }).__openklineChart.getDrawings().filter((drawing) => drawing.type === "ray-browser").length);
  expect(pluginDrawingCount).toBe(1);
  const customDrawingBox = await canvas.boundingBox();
  expect(customDrawingBox).not.toBeNull();
  if (customDrawingBox !== null) {
    await page.evaluate(() => (globalThis as unknown as { __openklineChart: { startDrawing(type: string): void } }).__openklineChart.startDrawing("ray-browser"));
    await page.mouse.click(customDrawingBox.x + customDrawingBox.width * 0.35, customDrawingBox.y + 32);
    await page.mouse.click(customDrawingBox.x + customDrawingBox.width * 0.6, customDrawingBox.y + 50);
  }
  const interactivePluginDrawingCount = await page.evaluate(() => (globalThis as unknown as { __openklineChart: { getDrawings(): Array<{ type: string }> } }).__openklineChart.getDrawings().filter((drawing) => drawing.type === "ray-browser").length);
  expect(interactivePluginDrawingCount).toBe(2);
  const overlayPixels = await page.evaluate(() => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    return Array.from({ length: Math.floor(pixels.length / 4) }, (_, index) => index).filter((index) => {
      const offset = index * 4;
      return (pixels[offset] ?? 0) > 180 && (pixels[offset + 2] ?? 0) > 180 && (pixels[offset + 1] ?? 0) < 100;
    }).length;
  });
  expect(overlayPixels).toBeGreaterThan(0);
  const workspaceState = await page.evaluate(({ indicatorId, drawingId }) => {
    const chart = (globalThis as unknown as {
      __openklineChart: {
        serializeWorkspace(metadata?: object): { version: number; metadata?: object; indicators: unknown[]; drawings: { drawings: unknown[] }; plugins: unknown[] };
        restoreWorkspace(document: unknown): { skippedPlugins: string[]; skippedIndicators: string[] };
        removeDrawing(id: string): void;
        removeIndicator(id: string): void;
        getDrawings(): Array<{ id: string; type: string }>;
        getPluginState(id: string): Record<string, unknown> | undefined;
        getPriceScaleState(): { activeMode: string };
      };
    }).__openklineChart;
    const document = chart.serializeWorkspace({ symbol: "TEST", timeframe: "1h" });
    chart.removeDrawing(drawingId);
    chart.removeIndicator(indicatorId);
    const restored = chart.restoreWorkspace(document);
    return {
      version: document.version,
      metadata: document.metadata,
      restored,
      drawing: chart.getDrawings().some((drawing) => drawing.id === drawingId && drawing.type === "ray-browser"),
      state: chart.getPluginState("example.browser"),
      priceScale: chart.getPriceScaleState().activeMode,
    };
  }, { indicatorId: pluginResult.indicatorId, drawingId: pluginResult.drawingId });
  expect(workspaceState).toEqual({
    version: 1,
    metadata: { symbol: "TEST", timeframe: "1h" },
    restored: { skippedPlugins: [], skippedIndicators: [] },
    drawing: true,
    state: { mounted: true },
    priceScale: "logarithmic",
  });
  await page.evaluate(({ indicatorId, drawingId }) => {
    const chart = (globalThis as unknown as {
      __openklineChart: {
        getDrawings(): Array<{ id: string; type: string }>;
        removeDrawing(id: string): void;
        getSeriesIds(): string[];
        removeIndicator(id: string): void;
        getPlugins(): Array<{ id: string }>;
        uninstallPlugin(id: string): boolean;
      };
    }).__openklineChart;
    chart.removeDrawing(drawingId);
    chart.removeIndicator(indicatorId);
    chart.uninstallPlugin("example.browser");
  }, { indicatorId: pluginResult.indicatorId, drawingId: pluginResult.drawingId });
  const pluginCleanup = await page.evaluate(() => {
    const chart = (globalThis as unknown as { __openklineChart: { getPlugins(): unknown[]; getCommands(): unknown[] } }).__openklineChart;
    return { plugins: chart.getPlugins().length, commands: chart.getCommands().length };
  });
  expect(pluginCleanup).toEqual({ plugins: 0, commands: 0 });

  await page.evaluate(() => {
    const chart = (globalThis as unknown as { __openklineChart: { destroy(): void } }).__openklineChart;
    chart.destroy();
  });
  await expect(canvas).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("loads the standalone vanilla plugin example", async ({ page }) => {
  await page.goto("/examples/vanilla/plugin-example.html");
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect.poll(async () => page.evaluate(() => {
    const chart = (globalThis as unknown as { __openklineChart?: { getPlugins(): Array<{ id: string }>; getSeriesIds(): string[] } }).__openklineChart;
    return chart === undefined ? null : { plugins: chart.getPlugins(), series: chart.getSeriesIds() };
  })).toEqual({ plugins: [{ id: "example.vanilla", name: "Vanilla Example Plugin", version: "1.0.0", apiVersion: 1, description: "A deterministic public SDK example", active: true }], series: ["candlestick-1", "indicator-1:value"] });
  const missingExtensionRestore = await page.evaluate(() => {
    const chart = (globalThis as unknown as {
      __openklineChart: {
        serializeWorkspace(): { indicators: unknown[]; plugins: unknown[]; drawings: { version: 1; drawings: unknown[] } };
        uninstallPlugin(id: string): boolean;
        restoreWorkspace(document: unknown, options: object): { skippedPlugins: string[]; skippedIndicators: string[] };
        destroy(): void;
      };
    }).__openklineChart;
    const saved = chart.serializeWorkspace();
    chart.uninstallPlugin("example.vanilla");
    const result = chart.restoreWorkspace({ ...saved, drawings: { version: 1, drawings: [] } }, { missingPlugins: "skip", missingIndicators: "skip" });
    chart.destroy();
    return result;
  });
  expect(missingExtensionRestore).toEqual({ skippedPlugins: ["example.vanilla"], skippedIndicators: ["indicator-1"] });
});

test("renders OHLC, hollow, Heikin-Ashi, and baseline series without replacing raw candles", async ({ page }) => {
  await page.goto("/examples/vanilla/index.html");
  const result = await page.evaluate(() => {
    type Candle = { time: number; open: number; high: number; low: number; close: number };
    type Series = { type: string; getData(): Candle[]; setData(data: Array<Candle | { time: number; value: number }>): void; remove(): void };
    const chart = (globalThis as unknown as {
      __openklineChart: {
        getData(): Candle[];
        addOhlcSeries(options: object): Series;
        addHollowCandlestickSeries(options: object): Series;
        addHeikinAshiSeries(options: object): Series;
        addBaselineSeries(options: object): Series;
        getSeriesInfo(): Array<{ id: string; type: string }>;
        serializeWorkspace(): { series: Array<{ type: string }> };
      };
    }).__openklineChart;
    const candles = chart.getData().slice(0, 4);
    const ohlc = chart.addOhlcSeries({ id: "ohlc", style: { upColor: "#00ffff", downColor: "#00ffff" } });
    const hollow = chart.addHollowCandlestickSeries({ id: "hollow", style: { hollowUpColor: "#ff00ff", downColor: "#ff00ff" } });
    const heikin = chart.addHeikinAshiSeries({ id: "heikin", style: { upColor: "#8000ff", downColor: "#8000ff" } });
    const baseline = chart.addBaselineSeries({
      id: "baseline",
      style: { baseline: 104, aboveColor: "#00ffff", belowColor: "#ff00ff", aboveFillOpacity: 0.3, belowFillOpacity: 0.3 },
    });
    ohlc.setData(candles);
    hollow.setData(candles);
    heikin.setData(candles);
    baseline.setData(candles.map((candle, index) => ({ time: candle.time, value: [101, 108, 100, 109][index]! })));
    const canvas = document.querySelector("canvas")!;
    const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    let cyan = 0;
    let magenta = 0;
    let purple = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index] ?? 0;
      const green = pixels[index + 1] ?? 0;
      const blue = pixels[index + 2] ?? 0;
      if (red < 70 && green > 180 && blue > 180) cyan += 1;
      if (red > 180 && green < 70 && blue > 180) magenta += 1;
      if (red > 70 && red < 170 && green < 50 && blue > 180) purple += 1;
    }
    const workspace = chart.serializeWorkspace();
    const output = {
      series: chart.getSeriesInfo().filter((series) => ["ohlc", "hollow", "heikin", "baseline"].includes(series.id)).map((series) => series.type),
      rawHeikin: heikin.getData(),
      expectedRawHeikin: candles,
      savedTypes: workspace.series.map((series) => series.type).filter((type) => ["ohlc", "hollow-candlestick", "heikin-ashi", "baseline"].includes(type)),
      cyan,
      magenta,
      purple,
      canvasBeforeRemove: document.querySelectorAll("canvas").length,
    };
    ohlc.remove();
    hollow.remove();
    heikin.remove();
    baseline.remove();
    return { ...output, remainingSeries: chart.getSeriesInfo().map((series) => series.id) };
  });
  expect(result.series).toEqual(["ohlc", "hollow-candlestick", "heikin-ashi", "baseline"]);
  expect(result.rawHeikin).toEqual(result.expectedRawHeikin);
  expect(result.savedTypes).toEqual(result.series);
  expect(result.cyan).toBeGreaterThan(0);
  expect(result.magenta).toBeGreaterThan(0);
  expect(result.purple).toBeGreaterThan(0);
  expect(result.canvasBeforeRemove).toBe(1);
  expect(result.remainingSeries).not.toContain("ohlc");
  expect(result.remainingSeries).not.toContain("hollow");
  expect(result.remainingSeries).not.toContain("heikin");
  expect(result.remainingSeries).not.toContain("baseline");
});
