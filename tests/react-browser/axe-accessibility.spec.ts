import AxeBuilder from "@axe-core/playwright";
import { expect, placeVisibleChartPoint, studioChartCanvas, test } from "./studio-test.js";

// Keep axe audits serial: Studio DOM mutations from parallel workers can race
// with accessibility tree snapshots on the shared production server.
test.describe.configure({ mode: "serial" });

test("Studio home has no serious axe-core WCAG 2.2 AA violations in the initial shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Objects" })).toBeVisible();
  await expect(studioChartCanvas(page)).toHaveCount(1);

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .disableRules([
      // Canvas chart summaries are provided via aria-label; color-contrast on
      // decorative canvas pixels is not meaningful for this surface.
      "color-contrast",
    ])
    .analyze();

  const serious = results.violations.filter((item) => item.impact === "serious" || item.impact === "critical");
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
});

test("Studio dialog and Object Tree state changes remain free of serious axe violations", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: "Trend", exact: true }).click();
  await placeVisibleChartPoint(page, 0.35, 0.3);
  await placeVisibleChartPoint(page, 0.7, 0.45);
  const objectTree = page.getByRole("complementary", { name: "Object tree" });
  await expect(objectTree).toHaveAttribute("data-object-tree-ready", "true");
  await objectTree.getByRole("button", { name: "Hide drawing-1", exact: true }).click();
  await expect(objectTree.locator('[data-drawing-id="drawing-1"]')).toHaveAttribute("data-drawing-visible", "false");

  const rename = page.getByRole("button", { name: "Rename watchlist", exact: true });
  await expect(rename).toBeVisible();
  await rename.click();
  const dialog = page.getByRole("dialog", { name: "Rename watchlist" });
  await expect(dialog).toBeVisible();

  const results = await new AxeBuilder({ page })
    .include('[aria-label="Object tree"]')
    .include('[role="dialog"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  const serious = results.violations.filter((item) => item.impact === "serious" || item.impact === "critical");
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toBeHidden();
});
