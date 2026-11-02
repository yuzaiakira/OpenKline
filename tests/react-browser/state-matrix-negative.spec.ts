import { expect, placeVisibleChartPoint, studioChartCanvas, test } from "./studio-test.js";
import { contrastPageHelpers } from "./contrast-utils.js";

test.describe.configure({ mode: "serial" });

test("Rename watchlist empty submission keeps dialog open with aria-invalid and alert", async ({ page }) => {
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Rename watchlist", exact: true });
  await expect(trigger).toBeVisible();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Rename watchlist" });
  await expect(dialog).toBeVisible();
  const value = dialog.getByLabel("Dialog value");
  await value.fill("   ");
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(value).toHaveAttribute("aria-invalid", "true");
  const alert = dialog.getByRole("alert");
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(/must not be empty/i);

  const contrast = await alert.evaluate((element, helpersSource) => {
    // eslint-disable-next-line no-new-func
    const helpers = new Function(`return ${helpersSource}`)() as {
      sampleText: (name: string, element: Element | null) => { ratio: number; pass: boolean; threshold: number };
    };
    return helpers.sampleText("dialog validation alert", element);
  }, contrastPageHelpers);
  expect(contrast.pass, JSON.stringify(contrast)).toBe(true);

  await value.fill("Valid Watchlist Name");
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("Dialog cancel restores focus and leaves Object Tree semantics intact", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: "Trend", exact: true }).click();
  await placeVisibleChartPoint(page, 0.3, 0.35);
  await placeVisibleChartPoint(page, 0.65, 0.5);
  const objectTree = page.getByRole("complementary", { name: "Object tree" });
  await expect(objectTree).toHaveAttribute("data-object-tree-ready", "true");

  const trigger = page.getByRole("button", { name: "Rename watchlist", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Rename watchlist" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(objectTree.locator('[data-drawing-id="drawing-1"]')).toHaveAttribute("data-drawing-visible", "true");
});

test("Hiding a drawing while its Hide control is focused remaps to Show without focus loss", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: "Trend", exact: true }).click();
  await placeVisibleChartPoint(page, 0.32, 0.28);
  await placeVisibleChartPoint(page, 0.7, 0.48);
  const objectTree = page.getByRole("complementary", { name: "Object tree" });
  await expect(objectTree).toHaveAttribute("data-object-tree-ready", "true");
  const hide = objectTree.getByRole("button", { name: "Hide drawing-1", exact: true });
  await hide.focus();
  await page.keyboard.press("Enter");
  await expect(objectTree.locator('[data-drawing-id="drawing-1"]')).toHaveAttribute("data-drawing-visible", "false");
  const show = objectTree.getByRole("button", { name: "Show drawing-1", exact: true });
  await expect(show).toBeVisible();
  // Focus may move with the renamed control; ensure a named control remains focused in the tree.
  await expect(show).toBeFocused();
});

test("Locking a selected drawing updates locked state while selection control remains named", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: "Trend", exact: true }).click();
  await placeVisibleChartPoint(page, 0.4, 0.3);
  await placeVisibleChartPoint(page, 0.72, 0.44);
  const objectTree = page.getByRole("complementary", { name: "Object tree" });
  await expect(objectTree).toHaveAttribute("data-object-tree-ready", "true");
  await objectTree.getByRole("button", { name: "Select drawing-1", exact: true }).click();
  await objectTree.getByRole("button", { name: "Lock drawing-1", exact: true }).click();
  await expect(objectTree.locator('[data-drawing-id="drawing-1"]')).toHaveAttribute("data-drawing-locked", "true");
  await expect(objectTree.getByRole("button", { name: "Unlock drawing-1", exact: true })).toBeVisible();
  await expect(objectTree.getByRole("button", { name: "Select drawing-1", exact: true })).toBeVisible();
  await expect(studioChartCanvas(page)).toHaveCount(1);
});

test("Pressed chart-type control exposes aria-pressed and meets hover/pressed text contrast", async ({ page }) => {
  await page.goto("/");
  const candles = page.getByRole("button", { name: "Candles", exact: true });
  await expect(candles).toHaveAttribute("aria-pressed", "true");
  await candles.hover();
  const sample = await candles.evaluate((element, helpersSource) => {
    // eslint-disable-next-line no-new-func
    const helpers = new Function(`return ${helpersSource}`)() as {
      sampleText: (name: string, element: Element | null) => { ratio: number; pass: boolean; threshold: number; background: string };
      sampleNonText: (name: string, color: string, background: { r: number; g: number; b: number; a: number }) => { ratio: number; pass: boolean };
      backgroundFor: (element: Element) => { r: number; g: number; b: number; a: number };
      parseColor: (value: string) => { r: number; g: number; b: number; a: number };
    };
    const style = getComputedStyle(element);
    const text = helpers.sampleText("pressed chart type", element);
    const border = helpers.sampleNonText("pressed border", style.borderTopColor, helpers.backgroundFor(element.parentElement ?? element));
    return { text, border, background: style.backgroundColor, pressed: element.getAttribute("aria-pressed") };
  }, contrastPageHelpers);
  expect(sample.pressed).toBe("true");
  expect(sample.text.pass, JSON.stringify(sample.text)).toBe(true);
  expect(sample.border.pass, JSON.stringify(sample.border)).toBe(true);
});

test("Focused dialog content is not obscured by the viewport edge at 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 720 });
  await page.goto("/");
  await page.getByRole("button", { name: "Rename watchlist", exact: true }).click();
  const value = page.getByRole("dialog", { name: "Rename watchlist" }).getByLabel("Dialog value");
  await expect(value).toBeFocused();
  const geometry = await value.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  });
  expect(geometry.top).toBeGreaterThanOrEqual(0);
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth);
});

test("Disabled Start optimization control is announced as disabled without requiring 1.4.3 text contrast", async ({ page }) => {
  await page.goto("/");
  const cancel = page.getByRole("button", { name: "Cancel optimization", exact: true });
  await expect(cancel).toBeDisabled();
  const meta = await cancel.evaluate((element) => ({
    disabled: (element as HTMLButtonElement).disabled,
    ariaDisabled: element.getAttribute("aria-disabled"),
  }));
  expect(meta.disabled || meta.ariaDisabled === "true").toBe(true);
});
