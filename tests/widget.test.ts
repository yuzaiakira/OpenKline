import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeWidgetLabels } from "../src/widget/controller.js";
import { normalizeWidgetFeatures } from "../src/widget/controller.js";

test("widget defaults are deterministic and feature visibility is additive", () => {
  assert.deepEqual(normalizeWidgetFeatures(), {
    header: true,
    symbol: true,
    timeframe: true,
    chartType: true,
    indicators: true,
    drawings: true,
    theme: true,
    direction: true,
    workspace: true,
    status: true,
    indicatorExplorer: true,
    drawingToolbar: true,
    objectTree: true,
    drawingProperties: true,
    chartSettings: true,
  });
  assert.deepEqual(normalizeWidgetFeatures({ header: false, workspace: false }), {
    header: false,
    symbol: true,
    timeframe: true,
    chartType: true,
    indicators: true,
    drawings: true,
    theme: true,
    direction: true,
    workspace: false,
    status: true,
    indicatorExplorer: true,
    drawingToolbar: true,
    objectTree: true,
    drawingProperties: true,
    chartSettings: true,
  });
  assert.equal(normalizeWidgetLabels({ symbol: "نماد" }).symbol, "نماد");
  assert.equal(normalizeWidgetLabels({}).timeframe, "Timeframe");
});

test("widget foundation remains independent from React and Next.js", () => {
  const source = `${readFileSync("src/widget/controller.ts", "utf8")}\n${readFileSync("src/widget/types.ts", "utf8")}`;
  assert.doesNotMatch(source, /from ["'](?:react|next|next\/)/i);
  assert.doesNotMatch(source, /examples\/nextjs-app-router/i);
});
