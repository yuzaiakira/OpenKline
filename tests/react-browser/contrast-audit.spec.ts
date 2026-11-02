import { expect, placeVisibleChartPoint, studioChartCanvas, test } from "./studio-test.js";
import { contrastPageHelpers } from "./contrast-utils.js";

test.describe.configure({ mode: "serial" });

test("Studio dark chrome text, muted labels, placeholders, and status meet WCAG 1.4.3", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Search watchlist")).toBeVisible();

  const results = await page.evaluate((helpersSource) => {
    // eslint-disable-next-line no-new-func
    const helpers = new Function(`return ${helpersSource}`)() as {
      sampleText: (name: string, element: Element | null, options?: { threshold?: number; pseudo?: string }) => { name: string; ratio: number; pass: boolean; threshold: number; foreground: string; background: string; criterion: string };
    };
    const samples = [
      helpers.sampleText("button text", document.querySelector("button")),
      helpers.sampleText("muted brand small", document.querySelector("header small, .brand small, [class*=brand] small") ?? document.querySelector("small")),
      helpers.sampleText("placeholder", document.querySelector('input[aria-label="Search watchlist"]'), { pseudo: "::placeholder" }),
      helpers.sampleText("status live region", document.querySelector('[aria-live="polite"]')),
      helpers.sampleText("sidebar summary", document.querySelector("aside summary")),
      helpers.sampleText("object tree heading", document.querySelector('[aria-label="Object tree"] h2')),
      helpers.sampleText("dialog muted (closed shell label)", document.querySelector('[aria-label="Watchlist actions"] strong') ?? document.querySelector("strong")),
    ];
    return samples;
  }, contrastPageHelpers);

  for (const sample of results) {
    expect(sample, JSON.stringify(sample)).toMatchObject({ pass: true });
    expect(sample.ratio).toBeGreaterThanOrEqual(sample.threshold);
  }
});

test("Studio focus outline and control borders meet WCAG 1.4.11 non-text contrast", async ({ page }) => {
  await page.goto("/");
  const rename = page.getByRole("button", { name: "Rename watchlist", exact: true });
  await expect(rename).toBeVisible();
  await rename.focus();

  const results = await page.evaluate((helpersSource) => {
    // eslint-disable-next-line no-new-func
    const helpers = new Function(`return ${helpersSource}`)() as {
      parseColor: (value: string) => { r: number; g: number; b: number; a: number };
      backgroundFor: (element: Element) => { r: number; g: number; b: number; a: number };
      sampleNonText: (name: string, colorValue: string, adjacentBackground: { r: number; g: number; b: number; a: number } | string, threshold?: number) => { name: string; ratio: number; pass: boolean; threshold: number };
      contrast: (a: { r: number; g: number; b: number; a: number }, b: { r: number; g: number; b: number; a: number }) => number;
    };
    const button = document.querySelector<HTMLButtonElement>('button[aria-label="Rename watchlist"]');
    if (button === null) throw new Error("Rename watchlist missing");
    const style = getComputedStyle(button);
    const adjacent = helpers.backgroundFor(button.parentElement ?? button);
    const focusAdjacent = helpers.backgroundFor(button);
    const outline = style.outlineColor;
    return {
      border: helpers.sampleNonText("button border", style.borderTopColor, adjacent),
      focus: helpers.sampleNonText("focus outline", outline, focusAdjacent),
      focusWidth: Number.parseFloat(style.outlineWidth),
      focusStyle: style.outlineStyle,
    };
  }, contrastPageHelpers);

  expect(results.focusStyle).not.toBe("none");
  expect(results.focusWidth).toBeGreaterThanOrEqual(2);
  expect(results.border.pass, JSON.stringify(results.border)).toBe(true);
  expect(results.focus.pass, JSON.stringify(results.focus)).toBe(true);
});

test("Studio KlineScript line numbers meet WCAG 1.4.3 after contrast hardening", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "KlineScript", exact: true }).click();
  const editor = page.getByRole("region", { name: "KlineScript editor" });
  await expect(editor).toBeVisible();
  const lineNumbers = editor.locator("[class*='lineNumbers']").first();
  await expect(lineNumbers).toBeVisible();

  const sample = await lineNumbers.evaluate((element, helpersSource) => {
    // eslint-disable-next-line no-new-func
    const helpers = new Function(`return ${helpersSource}`)() as {
      sampleText: (name: string, element: Element | null) => { name: string; ratio: number; pass: boolean; threshold: number; foreground: string; background: string };
    };
    return helpers.sampleText("klinescript line numbers", element);
  }, contrastPageHelpers);

  expect(sample.pass, JSON.stringify(sample)).toBe(true);
  expect(sample.ratio).toBeGreaterThanOrEqual(4.5);
});

test("Object Tree selected/locked state remains non-color-only and focusable", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: "Trend", exact: true }).click();
  await placeVisibleChartPoint(page, 0.35, 0.3);
  await placeVisibleChartPoint(page, 0.7, 0.45);
  const objectTree = page.getByRole("complementary", { name: "Object tree" });
  await expect(objectTree).toHaveAttribute("data-object-tree-ready", "true");
  await objectTree.getByRole("button", { name: "Lock drawing-1", exact: true }).click();
  await expect(objectTree.locator('[data-drawing-id="drawing-1"]')).toHaveAttribute("data-drawing-locked", "true");
  await expect(objectTree.getByRole("button", { name: "Unlock drawing-1", exact: true })).toBeVisible();
  await objectTree.getByRole("button", { name: "Hide drawing-1", exact: true }).click();
  await expect(objectTree.getByRole("button", { name: "Show drawing-1", exact: true })).toBeVisible();
  await expect(studioChartCanvas(page)).toHaveCount(1);
});

test("Studio chrome reflow at 320px remains free of document horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Objects" })).toBeVisible();
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 8);
});

test("Disabled Studio controls are exempt from WCAG 1.4.3 text contrast assertions", async ({ page }) => {
  await page.goto("/");
  // Single-panel Studio disables "Remove chart"; inactive controls are exempt from 1.4.3.
  const disabled = page.getByRole("button", { name: "Remove chart", exact: true });
  await expect(disabled).toBeDisabled();
  const meta = await disabled.evaluate((element) => ({
    disabled: (element as HTMLButtonElement).disabled,
    opacity: getComputedStyle(element).opacity,
  }));
  expect(meta.disabled).toBe(true);
});

test("Hover and aria-pressed Studio toolbar controls keep AA text and border contrast", async ({ page }) => {
  await page.goto("/");
  const area = page.getByRole("button", { name: "Area", exact: true });
  await area.hover();
  const hoverSample = await area.evaluate((element, helpersSource) => {
    // eslint-disable-next-line no-new-func
    const helpers = new Function(`return ${helpersSource}`)() as {
      sampleText: (name: string, element: Element | null) => { ratio: number; pass: boolean };
      sampleNonText: (name: string, color: string, background: { r: number; g: number; b: number; a: number }) => { ratio: number; pass: boolean };
      backgroundFor: (element: Element) => { r: number; g: number; b: number; a: number };
    };
    const style = getComputedStyle(element);
    return {
      text: helpers.sampleText("hover toolbar", element),
      border: helpers.sampleNonText("hover border", style.borderTopColor, helpers.backgroundFor(element.parentElement ?? element)),
    };
  }, contrastPageHelpers);
  expect(hoverSample.text.pass, JSON.stringify(hoverSample.text)).toBe(true);
  expect(hoverSample.border.pass, JSON.stringify(hoverSample.border)).toBe(true);

  await area.click();
  await expect(area).toHaveAttribute("aria-pressed", "true");
  const pressedSample = await area.evaluate((element, helpersSource) => {
    // eslint-disable-next-line no-new-func
    const helpers = new Function(`return ${helpersSource}`)() as {
      sampleText: (name: string, element: Element | null) => { ratio: number; pass: boolean };
    };
    return helpers.sampleText("pressed toolbar", element);
  }, contrastPageHelpers);
  expect(pressedSample.pass, JSON.stringify(pressedSample)).toBe(true);
});
