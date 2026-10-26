import { expect, test } from "@playwright/test";

test("Studio rendered text, placeholders, controls, and focus indicators meet the preliminary contrast audit", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Search watchlist")).toBeVisible();
  const audit = await page.evaluate(() => {
    type Color = { readonly r: number; readonly g: number; readonly b: number; readonly a: number };
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
      const foregroundLuminance = luminance(text);
      const backgroundLuminance = luminance(background);
      return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
    };
    const backgroundFor = (element: Element): Color => {
      let current: Element | null = element;
      while (current !== null) {
        const color = parseColor(getComputedStyle(current).backgroundColor);
        if (color.a > 0) return color;
        current = current.parentElement;
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    };
    const sample = (name: string, selector: string, pseudo?: "::placeholder"): { readonly name: string; readonly selector: string; readonly text: string; readonly background: string; readonly ratio: number } => {
      const element = document.querySelector(selector);
      if (element === null) throw new Error(`Missing contrast sample: ${selector}`);
      const style = getComputedStyle(element);
      const textColor = getComputedStyle(element, pseudo).color;
      const background = backgroundFor(element);
      return { name, selector, text: textColor, background: style.backgroundColor, ratio: Number(contrast(parseColor(textColor), background).toFixed(2)) };
    };
    const input = document.querySelector<HTMLInputElement>("input[aria-label=\"Search watchlist\"]");
    const button = document.querySelector<HTMLButtonElement>("button");
    if (input === null) throw new Error("Search watchlist input is missing");
    if (button === null) throw new Error("Studio button is missing");
    input.focus();
    const focusStyle = getComputedStyle(input);
    const focusBackground = parseColor(focusStyle.backgroundColor);
    const focusColor = parseColor(focusStyle.outlineColor);
    return {
      text: sample("primary text", "button"),
      muted: sample("muted text", "header small"),
      placeholder: sample("placeholder", "input[aria-label=\"Search watchlist\"]", "::placeholder"),
      status: sample("status", "[aria-live=\"polite\"]"),
      disabled: sample("disabled control", "button:disabled"),
      border: { color: getComputedStyle(button).borderTopColor, outerBackground: getComputedStyle(button.parentElement ?? button).backgroundColor, ratio: Number(contrast(parseColor(getComputedStyle(button).borderTopColor), backgroundFor(button.parentElement ?? button)).toFixed(2)) },
      focus: { color: focusStyle.outlineColor, ratio: Number(contrast(focusColor, focusBackground).toFixed(2)) },
    };
  });
  console.log(JSON.stringify({ contrastAudit: audit }));
  expect(audit.text.ratio).toBeGreaterThanOrEqual(4.5);
  expect(audit.muted.ratio).toBeGreaterThanOrEqual(4.5);
  expect(audit.placeholder.ratio).toBeGreaterThanOrEqual(4.5);
  expect(audit.status.ratio).toBeGreaterThanOrEqual(4.5);
  expect(audit.disabled.ratio).toBeGreaterThanOrEqual(4.5);
  expect(audit.border.ratio).toBeGreaterThanOrEqual(3);
  expect(audit.focus.ratio).toBeGreaterThanOrEqual(3);
});
