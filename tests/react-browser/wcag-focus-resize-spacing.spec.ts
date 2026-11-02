import { expect, placeVisibleChartPoint, test } from "./studio-test.js";
import { contrastPageHelpers } from "./contrast-utils.js";

/**
 * Engineering checks for remaining WCAG gaps (2.4.11 / 1.4.4 / 1.4.12 / dense panels).
 * These are automated complements — they do not close formal AT or physical-device gates.
 */

test.describe.configure({ mode: "serial" });

const WCAG_TEXT_SPACING_CSS = `
html.openkline-wcag-text-spacing, html.openkline-wcag-text-spacing * {
  line-height: 1.5 !important;
  letter-spacing: 0.12em !important;
  word-spacing: 0.16em !important;
}
html.openkline-wcag-text-spacing p {
  margin-bottom: 2em !important;
}
`;

async function focusedClientRect(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    if (active === null || active === document.body || active === document.documentElement) {
      return null;
    }
    const rect = active.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const topHit = document.elementFromPoint(centerX, Math.min(rect.top + 2, rect.bottom - 1));
    const midHit = document.elementFromPoint(centerX, centerY);
    const obscuredByAuthorOverlay = (hit: Element | null) => {
      if (hit === null) return true;
      if (active.contains(hit) || hit === active || hit.contains(active)) return false;
      const style = getComputedStyle(hit);
      // Ignore transparent hit-through layers; treat opaque fixed/sticky chrome as obscuring.
      if (style.pointerEvents === "none") return false;
      const position = style.position;
      return position === "fixed" || position === "sticky" || Number(style.zIndex) > 0;
    };
    return {
      name: active.getAttribute("aria-label") ?? active.textContent?.trim().slice(0, 80) ?? active.tagName,
      rect: { top: rect.top, left: rect.left, bottom: rect.bottom, right: rect.right, width: rect.width, height: rect.height },
      inViewport: rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth,
      centerObscured: obscuredByAuthorOverlay(midHit),
      topObscured: obscuredByAuthorOverlay(topHit),
    };
  });
}

test("2.4.11 focused Object Tree and dialog controls are not fully obscured by Studio overlays", async ({ page }) => {
  await page.goto("/");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole("button", { name: "Trend", exact: true }).click();
  await placeVisibleChartPoint(page, 0.3, 0.35);
  await placeVisibleChartPoint(page, 0.65, 0.5);

  const objectTree = page.getByRole("complementary", { name: "Object tree" });
  await expect(objectTree).toHaveAttribute("data-object-tree-ready", "true");
  const hide = objectTree.getByRole("button", { name: /Hide/i }).first();
  await hide.focus();
  const hideFocus = await focusedClientRect(page);
  expect(hideFocus, "expected Hide control to be focused").not.toBeNull();
  expect(hideFocus!.inViewport).toBe(true);
  expect(hideFocus!.centerObscured, JSON.stringify(hideFocus)).toBe(false);

  const rename = page.getByRole("button", { name: "Rename watchlist", exact: true });
  await rename.click();
  const dialog = page.getByRole("dialog", { name: "Rename watchlist" });
  await expect(dialog).toBeVisible();
  const value = dialog.getByLabel("Dialog value");
  await value.focus();
  const dialogFocus = await focusedClientRect(page);
  expect(dialogFocus, "expected dialog field focus").not.toBeNull();
  expect(dialogFocus!.inViewport).toBe(true);
  expect(dialogFocus!.centerObscured, JSON.stringify(dialogFocus)).toBe(false);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("1.4.4 Studio chrome remains operable under 200% CSS zoom", async ({ page }) => {
  await page.goto("/");
  await page.setViewportSize({ width: 1280, height: 800 });
  // Drawing-tool "Trend" is not an aria-pressed control (chart-type buttons are).
  // Apply CSS zoom after load to approximate text enlargement; not identical to browser page zoom.
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });

  const candles = page.getByRole("button", { name: "Candles", exact: true });
  await expect(candles).toBeVisible();
  await expect(page.getByRole("button", { name: "Trend", exact: true })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Object tree" })).toBeVisible();

  // Chart-type pressed state remains discoverable under zoom.
  await candles.dispatchEvent("click");
  await expect(candles).toHaveAttribute("aria-pressed", "true");

  const rename = page.getByRole("button", { name: "Rename watchlist", exact: true });
  await expect(rename).toBeVisible();
  await rename.dispatchEvent("click");
  const dialog = page.getByRole("dialog", { name: "Rename watchlist" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Dialog value").fill("Zoomed Rename");
  await dialog.getByRole("button", { name: "Apply", exact: true }).dispatchEvent("click");
  await expect(dialog).toBeHidden();

  const overflow = await page.evaluate(() => ({
    documentScrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.documentScrollWidth).toBeLessThan(overflow.clientWidth * 2.5);
  await page.evaluate(() => {
    document.documentElement.style.zoom = "";
  });
});

test("1.4.12 WCAG text-spacing overrides keep Object Tree actions readable and operable", async ({ page }) => {
  await page.goto("/");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addStyleTag({ content: WCAG_TEXT_SPACING_CSS });
  await page.evaluate(() => document.documentElement.classList.add("openkline-wcag-text-spacing"));

  await page.getByRole("button", { name: "Trend", exact: true }).click();
  await placeVisibleChartPoint(page, 0.3, 0.35);
  await placeVisibleChartPoint(page, 0.65, 0.5);
  const objectTree = page.getByRole("complementary", { name: "Object tree" });
  await expect(objectTree).toHaveAttribute("data-object-tree-ready", "true");

  const hide = objectTree.getByRole("button", { name: /Hide/i }).first();
  await expect(hide).toBeVisible();
  await hide.click();
  await expect(objectTree.getByRole("button", { name: /Show/i }).first()).toBeVisible();

  const overlap = await page.evaluate(() => {
    const tree = document.querySelector('[aria-label="Object tree"], [aria-labelledby]') as HTMLElement | null
      ?? Array.from(document.querySelectorAll("[role='complementary']")).find((el) =>
        /object tree/i.test(el.getAttribute("aria-label") ?? ""),
      ) as HTMLElement | undefined;
    if (!tree) return { ok: false, reason: "missing object tree" };
    const buttons = Array.from(tree.querySelectorAll("button")) as HTMLElement[];
    for (let i = 0; i < buttons.length; i += 1) {
      const a = buttons[i]!.getBoundingClientRect();
      if (a.width < 1 || a.height < 1) return { ok: false, reason: `zero-size button ${i}` };
      for (let j = i + 1; j < buttons.length; j += 1) {
        const b = buttons[j]!.getBoundingClientRect();
        const intersects = !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
        if (intersects && a.width > 8 && b.width > 8) {
          // Same-row sibling controls may share a flex line; reject vertical smothering.
          const verticalSmother = a.top < b.top && a.bottom > b.bottom && a.left < b.right && a.right > b.left;
          if (verticalSmother) return { ok: false, reason: `smother ${i}/${j}` };
        }
      }
    }
    return { ok: true, reason: "ok", count: buttons.length };
  });
  expect(overlap.ok, JSON.stringify(overlap)).toBe(true);
});

test("dense Object Tree selected/locked and settings chrome keep AA text contrast under spacing", async ({ page }) => {
  await page.goto("/");
  await page.addStyleTag({ content: WCAG_TEXT_SPACING_CSS });
  await page.evaluate(() => document.documentElement.classList.add("openkline-wcag-text-spacing"));
  await page.getByRole("button", { name: "Trend", exact: true }).click();
  await placeVisibleChartPoint(page, 0.3, 0.35);
  await placeVisibleChartPoint(page, 0.65, 0.5);
  const objectTree = page.getByRole("complementary", { name: "Object tree" });
  await expect(objectTree).toHaveAttribute("data-object-tree-ready", "true");
  await objectTree.getByRole("button", { name: "Lock drawing-1", exact: true }).click();
  await expect(objectTree.locator('[data-drawing-id="drawing-1"]')).toHaveAttribute("data-drawing-locked", "true");

  const drawingName = objectTree.getByRole("button", { name: "Select drawing-1", exact: true });
  const unlock = objectTree.getByRole("button", { name: "Unlock drawing-1", exact: true });
  await expect(drawingName).toBeVisible();
  await expect(unlock).toBeVisible();

  const samples = await Promise.all([
    drawingName.evaluate((element, helpersSource) => {
      // eslint-disable-next-line no-new-func
      const helpers = new Function(`return ${helpersSource}`)() as {
        sampleText: (name: string, element: Element | null) => { name: string; ratio: number; pass: boolean };
      };
      return helpers.sampleText("object tree drawing name under text-spacing", element);
    }, contrastPageHelpers),
    unlock.evaluate((element, helpersSource) => {
      // eslint-disable-next-line no-new-func
      const helpers = new Function(`return ${helpersSource}`)() as {
        sampleText: (name: string, element: Element | null) => { name: string; ratio: number; pass: boolean };
      };
      return helpers.sampleText("unlock control under text-spacing", element);
    }, contrastPageHelpers),
  ]);

  for (const sample of samples) {
    expect(sample.pass, JSON.stringify(sample)).toBe(true);
  }
});
