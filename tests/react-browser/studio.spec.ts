import { expect, test } from "@playwright/test";

test("Studio preserves chart type, price scale, indicator, and drawing state through a workspace reload", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Objects" })).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.getByText("Series (10)", { exact: true })).toBeVisible();
  await expect(page.getByText("Indicators (2)", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "OHLC", exact: true }).click();
  await expect(page.getByRole("button", { name: "OHLC", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Heikin-Ashi", exact: true }).click();
  await expect(page.getByRole("button", { name: "Heikin-Ashi", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Price scale").selectOption("logarithmic");
  await expect(page.getByText(/Log price scale applied/)).toBeVisible();

  await page.getByLabel("Indicator").selectOption("EMA");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Indicators (3)", { exact: true })).toBeVisible();

  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  await page.getByRole("button", { name: "Trend", exact: true }).click();
  await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.22);
  await page.mouse.click(box.x + box.width * 0.65, box.y + box.height * 0.34);
  await expect(page.getByText("Drawings (1)", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const anchorsBeforeLinear = await page.evaluate(() => {
    const workspace = JSON.parse(window.localStorage.getItem("openkline-studio-workspace-v1") ?? "null") as {
      drawings: { drawings: Array<{ points: Array<{ time: number; price: number }> }> };
    };
    return workspace.drawings.drawings[0]?.points;
  });
  expect(anchorsBeforeLinear).toHaveLength(2);
  await page.getByLabel("Price scale").selectOption("linear");
  await page.getByLabel("Theme").selectOption("light");
  await expect(page.getByText(/Light theme applied/)).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const saved = await page.evaluate(() => JSON.parse(window.localStorage.getItem("openkline-studio-workspace-v1") ?? "null") as {
    chart: { priceScale?: { mode?: string }; theme: { background: string } };
    series: Array<{ id: string; style: { visible?: boolean } }>;
    indicators: Array<{ indicatorId: string }>;
    drawings: { drawings: Array<{ points: Array<{ time: number; price: number }> }> };
  });
  expect(saved.chart.priceScale?.mode).toBe("linear");
  expect(saved.chart.theme.background).toBe("#ffffff");
  expect(saved.series.find((series) => series.id === "studio-heikin")?.style.visible).not.toBe(false);
  expect(saved.indicators.some((indicator) => indicator.indicatorId === "EMA")).toBe(true);
  const anchors = saved.drawings.drawings[0]?.points;
  expect(anchors).toHaveLength(2);
  expect(anchors).toEqual(anchorsBeforeLinear);

  await page.reload();
  await expect(page.locator("canvas")).toHaveCount(1);
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await expect(page.getByRole("button", { name: "Heikin-Ashi", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Price scale")).toHaveValue("linear");
  await expect(page.getByLabel("Theme")).toHaveValue("light");
  await expect(page.getByText("Drawings (1)", { exact: true })).toBeVisible();
  await expect(page.getByText("Indicators (3)", { exact: true })).toBeVisible();
  const restored = await page.evaluate(() => JSON.parse(window.localStorage.getItem("openkline-studio-workspace-v1") ?? "null") as { drawings: { drawings: Array<{ points: Array<{ time: number; price: number }> }> } });
  expect(restored.drawings.drawings[0]?.points).toEqual(anchors);

  await page.setViewportSize({ width: 800, height: 700 });
  await expect(page.locator("canvas")).toBeVisible();
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await expect(page.getByLabel("Price scale")).toHaveValue("linear");
  expect(errors).toEqual([]);
});

test("Studio remains operable at a touch-sized viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Fit", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Area", exact: true }).click();
  await expect(page.getByRole("button", { name: "Area", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "OHLC", exact: true }).click();
  await expect(page.getByRole("button", { name: "OHLC", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Price scale").selectOption("percentage");
  await expect(page.getByLabel("Price scale")).toHaveValue("percentage");
});
