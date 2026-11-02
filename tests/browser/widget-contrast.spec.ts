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

test("widget light and dark themes meet text and non-text contrast thresholds", async ({ page }, testInfo) => {
  test.skip(!["chromium", "firefox", "webkit"].includes(testInfo.project.name), "Widget contrast is verified on desktop browser projects");

  await page.goto("/examples/vanilla/index.html");
  const results = await page.evaluate(async (inputCandles) => {
    const moduleUrl = new URL("/dist/src/widget/index.js", location.href).href;
    const { createOpenKlineWidget } = await import(moduleUrl);
    const host = document.createElement("div");
    host.style.width = "760px";
    host.style.height = "420px";
    document.body.append(host);
    const widget = createOpenKlineWidget({
      container: host,
      data: inputCandles,
      dataIdentity: { symbol: "BTC-USD", timeframe: "1h" },
      chartOptions: { theme: "dark", direction: "ltr", autoSize: true },
    });

    type Color = { r: number; g: number; b: number; a: number };
    const parseColor = (value: string): Color => {
      const values = value.match(/[\d.]+/g)?.map(Number) ?? [];
      return { r: values[0] ?? 0, g: values[1] ?? 0, b: values[2] ?? 0, a: values[3] ?? 1 };
    };
    const composite = (foreground: Color, background: Color): Color => ({
      r: foreground.r * foreground.a + background.r * (1 - foreground.a),
      g: foreground.g * foreground.a + background.g * (1 - foreground.a),
      b: foreground.b * foreground.a + background.b * (1 - foreground.a),
      a: 1,
    });
    const luminance = (color: Color): number => {
      const channel = (value: number): number => {
        const normalized = value / 255;
        return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
    };
    const contrast = (foreground: Color, background: Color): number => {
      const text = composite(foreground, background);
      const L1 = luminance(text);
      const L2 = luminance(background);
      return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    };
    const backgroundFor = (element: Element): Color => {
      let current: Element | null = element;
      while (current !== null) {
        const color = parseColor(getComputedStyle(current).backgroundColor);
        if (color.a > 0.001) {
          if (color.a >= 0.999) return color;
          return composite(color, backgroundFor(current.parentElement ?? document.documentElement));
        }
        current = current.parentElement;
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    };

    const sample = (theme: "light" | "dark") => {
      widget.setTheme(theme);
      const root = host.querySelector<HTMLElement>("[data-openkline-widget]");
      if (root === null) throw new Error("widget root missing");
      const button = root.querySelector("button");
      const label = root.querySelector("label");
      if (button === null || label === null) throw new Error("widget controls missing");
      button.focus();
      const buttonStyle = getComputedStyle(button);
      const labelStyle = getComputedStyle(label);
      const panelBg = backgroundFor(button.parentElement ?? root);
      const buttonBg = backgroundFor(button);
      return {
        theme,
        hostTheme: root.getAttribute("data-theme"),
        textRatio: Number(contrast(parseColor(buttonStyle.color), buttonBg).toFixed(2)),
        mutedRatio: Number(contrast(parseColor(labelStyle.color), backgroundFor(label)).toFixed(2)),
        borderRatio: Number(contrast(parseColor(buttonStyle.borderTopColor), panelBg).toFixed(2)),
        focusRatio: Number(contrast(parseColor(buttonStyle.outlineColor), buttonBg).toFixed(2)),
        focusStyle: buttonStyle.outlineStyle,
        borderColor: buttonStyle.borderTopColor,
      };
    };

    const dark = sample("dark");
    const light = sample("light");
    widget.destroy();
    return { dark, light };
  }, candles);

  for (const result of [results.dark, results.light]) {
    expect(result.hostTheme, JSON.stringify(result)).toBe(result.theme);
    expect(result.textRatio, JSON.stringify(result)).toBeGreaterThanOrEqual(4.5);
    expect(result.mutedRatio, JSON.stringify(result)).toBeGreaterThanOrEqual(4.5);
    expect(result.borderRatio, JSON.stringify(result)).toBeGreaterThanOrEqual(3);
    expect(result.focusStyle).not.toBe("none");
    expect(result.focusRatio, JSON.stringify(result)).toBeGreaterThanOrEqual(3);
  }
});
