import { expect, test } from "@playwright/test";

test("Studio completes a local chart-analysis workflow through public APIs", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Objects" })).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.getByText("Series (6)", { exact: true })).toBeVisible();
  await expect(page.getByText("Indicators (2)", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "line", exact: true }).click();
  await expect(page.getByRole("button", { name: "line", exact: true })).toHaveAttribute("aria-pressed", "true");

  await page.getByLabel("Indicator").selectOption("BOLLINGER_BANDS");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Indicators (3)", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Add overlay" }).click();
  const overlayRemoval = page.locator('button[aria-label^="Remove studio-overlay-"]');
  await expect(overlayRemoval).toHaveCount(1);
  await overlayRemoval.click();
  await expect(overlayRemoval).toHaveCount(0);

  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  await page.getByRole("button", { name: "Horizontal", exact: true }).click();
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.4);
  await expect(page.getByText("Drawings (1)", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Lock", exact: true }).click();
  await expect(page.getByRole("button", { name: "Unlock", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: /Remove drawing-/ }).click();
  await expect(page.getByText("Drawings (0)", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await expect(page.getByText("Drawings (1)", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "KlineScript", exact: true }).click();
  await expect(page.getByLabel("KlineScript source")).toBeVisible();
  await page.getByRole("button", { name: "Compile and add" }).click();
  await expect(page.getByText("Indicators (4)", { exact: true })).toBeVisible();

  await page.getByLabel("Theme").selectOption("light");
  await expect(page.getByText(/Light theme applied/)).toBeVisible();
  await page.getByLabel("Symbol").selectOption("ETH-USD");
  await expect(page.getByText(/Loaded ETH-USD at 1h/)).toBeVisible();
  expect(errors).toEqual([]);
});

test("Studio remains operable at a touch-sized viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Fit", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "area", exact: true }).click();
  await expect(page.getByRole("button", { name: "area", exact: true })).toHaveAttribute("aria-pressed", "true");
});
