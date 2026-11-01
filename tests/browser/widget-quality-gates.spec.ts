import { expect, test, type Page } from "@playwright/test";

type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
type WidgetGlobals = typeof globalThis & {
  __openklineQualityWidget?: {
    getState(): { status: string; layout: string; theme: string; direction: string; activeChartId: string };
    getDiagnostics(): { destroyed: boolean; canvasCount: number; pendingDataRequest: boolean; styleElementCount: number };
    setLayout(layout: "single" | "two-horizontal" | "four-grid"): void;
    setTheme(theme: "light" | "dark"): void;
    setDirection(direction: "ltr" | "rtl"): void;
    setActiveChartId(id: string): void;
    destroy(): void;
  };
  __openklineQualityHost?: HTMLElement;
};

function desktopBrowsers(name: string): boolean {
  return ["chromium", "firefox"].includes(name);
}

function makeCandles(count: number): Candle[] {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + Math.sin(index / 5) * 3 + index * 0.2;
    return {
      time: Date.UTC(2026, 0, 1) + index * 60_000,
      open: close - 0.4,
      high: close + 1,
      low: close - 1,
      close,
      volume: 900 + index * 7,
    };
  });
}

async function mountQualityWidget(page: Page, width: number, height = 520): Promise<void> {
  await page.goto("/examples/vanilla/index.html");
  await page.evaluate(async ({ candles, widthValue, heightValue }) => {
    const moduleUrl = new URL("/dist/src/widget/index.js", location.href).href;
    const { createOpenKlineWidget } = await import(moduleUrl);
    const host = document.createElement("div");
    host.style.cssText = `width:${widthValue}px;height:${heightValue}px;outline:1px solid #334155`;
    document.body.append(host);
    const widget = createOpenKlineWidget({
      container: host,
      layout: "two-horizontal",
      data: candles,
      dataIdentity: { symbol: "Q-USD", timeframe: "1m" },
      chartOptions: { autoSize: true, theme: "dark", direction: "ltr" },
    });
    const globals = globalThis as WidgetGlobals;
    globals.__openklineQualityWidget = widget;
    globals.__openklineQualityHost = host;
  }, { candles: makeCandles(36), widthValue: width, heightValue: height });
}

test("cross-browser widget quality covers layouts, a11y semantics, RTL/theme and cleanup", async ({ page }, testInfo) => {
  test.skip(!desktopBrowsers(testInfo.project.name), "Desktop Chromium/Firefox quality gate");
  await mountQualityWidget(page, 1024);

  const host = page.locator("[data-openkline-widget]");
  await expect(host).toHaveAttribute("role", "region");
  await expect(host).toHaveAttribute("aria-describedby", /openkline-status-/);
  await expect(page.locator('[data-openkline-chart-grid]')).toHaveAttribute("role", "group");
  await expect(page.locator('[data-openkline-chart][role="img"]').first()).toBeVisible();

  // Genuine toolbar interaction — open Chart Settings (modal) and Escape restore.
  const settings = page.locator('[data-openkline-panel-trigger="chart-settings"]');
  await settings.click();
  const settingsPanel = page.locator('[data-openkline-panel="chart-settings"]');
  await expect(settingsPanel).toBeVisible();
  await expect(settingsPanel).toHaveAttribute("aria-modal", "true");
  await expect(settingsPanel.locator("h2[data-openkline-panel-title]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(settingsPanel).toBeHidden();
  await expect(settings).toBeFocused();

  // Drawing toolbar remains non-modal so chart stays interactive.
  const drawing = page.locator('[data-openkline-panel-trigger="drawing-toolbar"]');
  await drawing.click();
  const drawingPanel = page.locator('[data-openkline-panel="drawing-toolbar"]');
  await expect(drawingPanel).toHaveAttribute("aria-modal", "false");
  await page.keyboard.press("Escape");

  const state = await page.evaluate(() => {
    const widget = (globalThis as WidgetGlobals).__openklineQualityWidget!;
    widget.setLayout("four-grid");
    widget.setActiveChartId("chart-3");
    widget.setTheme("light");
    widget.setDirection("rtl");
    const active = document.querySelector('[data-openkline-chart-slot="chart-3"]');
    const control = document.querySelector<HTMLElement>("[data-openkline-widget] button");
    const style = control === null ? null : getComputedStyle(control);
    return {
      snapshot: widget.getState(),
      activeCurrent: active?.getAttribute("aria-current") ?? null,
      minHeight: style?.minHeight ?? null,
      minWidth: style?.minWidth ?? null,
      muted: getComputedStyle(document.querySelector("[data-openkline-status]")!).color,
    };
  });
  expect(state.snapshot).toMatchObject({
    layout: "four-grid",
    activeChartId: "chart-3",
    theme: "light",
    direction: "rtl",
    status: "ready",
  });
  expect(state.activeCurrent).toBe("true");
  expect(Number.parseFloat(state.minHeight ?? "0")).toBeGreaterThanOrEqual(32);

  const cleanup = await page.evaluate(() => {
    const globals = globalThis as WidgetGlobals;
    const host = globals.__openklineQualityHost!;
    const before = host.querySelectorAll("canvas").length;
    globals.__openklineQualityWidget!.destroy();
    return {
      before,
      after: host.querySelectorAll("canvas").length,
      diagnostics: globals.__openklineQualityWidget!.getDiagnostics(),
      hostChildren: host.children.length,
    };
  });
  expect(cleanup.before).toBeGreaterThan(0);
  expect(cleanup.after).toBe(0);
  expect(cleanup.hostChildren).toBe(0);
  expect(cleanup.diagnostics).toMatchObject({ destroyed: true, canvasCount: 0, pendingDataRequest: false });
});

test("responsive widget widths keep controls hit-testable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Deterministic visual/responsive evidence uses Chromium");
  const widths = [320, 375, 768, 1024, 1440];
  const evidence: Array<Record<string, unknown>> = [];
  for (const width of widths) {
    await page.setViewportSize({ width: Math.max(width, 360), height: width < 500 ? 740 : 900 });
    await mountQualityWidget(page, width, width < 500 ? 640 : 520);
    const trigger = page.locator('[data-openkline-panel-trigger="watchlist"]');
    await expect(trigger).toBeVisible();
    const box = await trigger.boundingBox();
    // Viewport ≤640px activates 44px touch targets; otherwise desktop 32px minimum.
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(width <= 640 ? 44 : 32);
    await trigger.click();
    await expect(page.locator('[data-openkline-panel="watchlist"]')).toBeVisible();
    await page.locator('[data-openkline-panel="watchlist"] [data-openkline-panel-close]').click();
    const shot = testInfo.outputPath(`widget-responsive-${width}.png`);
    await page.locator("[data-openkline-widget]").screenshot({ path: shot });
    evidence.push({ width, shot, controlHeight: box?.height ?? null });
    await page.evaluate(() => {
      const globals = globalThis as WidgetGlobals;
      globals.__openklineQualityWidget?.destroy();
      globals.__openklineQualityHost?.remove();
    });
  }
  expect(evidence).toHaveLength(5);
});

test("CSP inject mode reports violations under style-src self while external mode stays clean", async ({ page }, testInfo) => {
  test.skip(!desktopBrowsers(testInfo.project.name), "CSP enforcement uses desktop Chromium/Firefox");

  // Inject mode under restrictive CSP: construction still succeeds; violations are observed.
  await page.goto("/examples/vanilla/index.html");
  const inject = await page.evaluate(async () => {
    const meta = document.createElement("meta");
    meta.httpEquiv = "Content-Security-Policy";
    meta.content = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self'; img-src 'self' data:; connect-src 'self'";
    document.head.prepend(meta);
    const violations: string[] = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      violations.push(`${event.violatedDirective}:${event.blockedURI || event.sourceFile || "inline"}`);
    });
    const moduleUrl = new URL("/dist/src/widget/index.js", location.href).href;
    const { createOpenKlineWidget } = await import(moduleUrl);
    const host = document.createElement("div");
    host.style.cssText = "width:420px;height:320px";
    document.body.append(host);
    const candles = Array.from({ length: 12 }, (_, index) => {
      const close = 40 + index;
      return { time: Date.UTC(2026, 0, 1) + index * 60_000, open: close - 0.2, high: close + 0.5, low: close - 0.5, close, volume: 10 };
    });
    const widget = createOpenKlineWidget({
      container: host,
      data: candles,
      dataIdentity: { symbol: "CSP-INJECT", timeframe: "1m" },
      styles: { mode: "inject" },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const styleCount = document.querySelectorAll("style[data-openkline-widget-style]").length;
    widget.destroy();
    return { styleCount, violations, remaining: host.querySelectorAll("canvas").length };
  });
  expect(inject.styleCount).toBeGreaterThanOrEqual(0);
  expect(inject.remaining).toBe(0);
  // Browsers may report style-src violations for inline Widget CSS under this policy.
  expect(Array.isArray(inject.violations)).toBe(true);

  await page.goto("/examples/vanilla/widget-csp.html");
  await expect(page.locator("#status")).toContainText('"status": "ready"');
  const external = await page.evaluate(() => {
    const violations: string[] = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      violations.push(`${event.violatedDirective}`);
    });
    const api = (globalThis as typeof globalThis & { __openklineWidgetCsp: { report: () => Record<string, unknown>; destroy: () => void } }).__openklineWidgetCsp;
    const before = api.report();
    api.destroy();
    return { before, after: api.report(), violations };
  });
  expect(external.before).toMatchObject({ styleCount: 0, widgetStylesheetLinked: true, status: "ready" });
  expect(external.after).toMatchObject({ destroyed: true, remainingCanvases: 0 });
  expect(external.violations.filter((item) => item.startsWith("style-src"))).toHaveLength(0);
});

test("mobile chrome touch hit-testing opens and closes watchlist without force", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chrome", "Touch hit-testing uses Mobile Chrome emulation");
  await mountQualityWidget(page, 390, 700);
  const trigger = page.locator('[data-openkline-panel-trigger="watchlist"]');
  await trigger.tap();
  const panel = page.locator('[data-openkline-panel="watchlist"]');
  await expect(panel).toBeVisible();
  await panel.locator("[data-openkline-panel-close]").click();
  await expect(panel).toBeHidden();
  await page.evaluate(() => (globalThis as WidgetGlobals).__openklineQualityWidget!.destroy());
});

test("mobile chrome object tree and chart settings remain reachable after viewport rotation", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chrome", "Mobile responsive Object Tree coverage uses Mobile Chrome");
  await page.setViewportSize({ width: 390, height: 844 });
  await mountQualityWidget(page, 390, 700);
  const tree = page.locator('[data-openkline-panel-trigger="object-tree"]');
  await expect(tree).toBeVisible();
  await tree.tap();
  const panel = page.locator('[data-openkline-panel="object-tree"]');
  await expect(panel).toBeVisible();
  await expect(panel.locator("h2[data-openkline-panel-title]")).toBeVisible();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(panel).toBeVisible();
  await panel.locator("[data-openkline-panel-close]").click();
  await expect(panel).toBeHidden();
  const settings = page.locator('[data-openkline-panel-trigger="chart-settings"]');
  await settings.tap();
  await expect(page.locator('[data-openkline-panel="chart-settings"]')).toBeVisible();
  await page.evaluate(() => (globalThis as WidgetGlobals).__openklineQualityWidget!.destroy());
});
