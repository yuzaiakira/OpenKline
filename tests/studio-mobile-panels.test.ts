import assert from "node:assert/strict";
import test from "node:test";
import {
  STUDIO_MOBILE_BREAKPOINT_PX,
  buildStudioMobilePanelSummaries,
  describeStudioMobileActivePanel,
  formatStudioMobilePanelDetail,
  formatStudioMobilePanelLabel,
  isStudioMobileViewportWidth,
} from "../src/index.js";

test("isStudioMobileViewportWidth matches the 720px Studio compact breakpoint", () => {
  assert.equal(STUDIO_MOBILE_BREAKPOINT_PX, 720);
  assert.equal(isStudioMobileViewportWidth(720), true);
  assert.equal(isStudioMobileViewportWidth(390), true);
  assert.equal(isStudioMobileViewportWidth(721), false);
});

test("buildStudioMobilePanelSummaries marks the active panel and formats labels", () => {
  const summaries = buildStudioMobilePanelSummaries([
    { panelId: "chart-1", symbol: "BTC-USD", timeframe: "1h", indicatorCount: 2, drawingCount: 1 },
    { panelId: "chart-2", symbol: "ETH-USD", timeframe: "4h", indicatorCount: 3, drawingCount: 0 },
  ], "chart-2");
  assert.equal(summaries.length, 2);
  assert.equal(summaries[0]?.active, false);
  assert.equal(summaries[1]?.active, true);
  assert.equal(summaries[1]?.ordinal, 2);
  assert.equal(summaries[1]?.label, formatStudioMobilePanelLabel({
    panelId: "chart-2",
    symbol: "ETH-USD",
    timeframe: "4h",
  }));
  assert.equal(summaries[0]?.detail, formatStudioMobilePanelDetail({
    panelId: "chart-1",
    indicatorCount: 2,
    drawingCount: 1,
  }));
  assert.equal(
    describeStudioMobileActivePanel(summaries, "chart-2"),
    "Viewing panel 2 of 2: ETH-USD · 4h",
  );
});
