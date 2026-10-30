import assert from "node:assert/strict";
import test from "node:test";
import {
  TradingCalendarEngine,
  defaultTradingCalendarDisplayOptions,
  renderTradingCalendarOverlay,
  resolveTradingCalendarDisplayOptions,
} from "../src/index.js";
import type { PluginRenderContext } from "../src/extensions/types.js";

function context(times: readonly number[]): PluginRenderContext {
  const pane = {
    id: "main",
    left: 0,
    right: 700,
    top: 0,
    bottom: 400,
    xForTime: (time: number) => (time - times[0]!) / (times.at(-1)! - times[0]!) * 700,
    timeForX: (x: number) => times[0]! + (x / 700) * (times.at(-1)! - times[0]!),
    yForPrice: (price: number) => 400 - price,
    priceForY: (y: number) => 400 - y,
  };
  return {
    width: 700,
    height: 400,
    devicePixelRatio: 1,
    theme: {
      background: "#fff",
      text: "#111",
      grid: "#ddd",
      border: "#ccc",
      upCandle: "#0a0",
      downCandle: "#a00",
      crosshair: "#555",
      volumeUp: "#0a0",
      volumeDown: "#a00",
    },
    series: [],
    panes: [pane],
    times,
    xForTime: pane.xForTime,
    timeForX: pane.timeForX,
    pane: (id) => id === undefined || id === "main" ? pane : undefined,
  };
}

test("trading calendar overlay renders boundaries, breaks, and localized session labels", () => {
  const calendar = new TradingCalendarEngine({
    id: "visual-market",
    version: "1",
    timeZone: "UTC",
    weeklySchedule: [{ weekday: 1, segments: [{ start: "09:00", end: "12:00" }, { start: "13:00", end: "16:00" }] }],
  });
  const from = Date.parse("2024-01-01T09:00:00.000Z");
  const times = [from, from + 60 * 60 * 1000, from + 2 * 60 * 60 * 1000, from + 4 * 60 * 60 * 1000, from + 6 * 60 * 60 * 1000, from + 7 * 60 * 60 * 1000];
  const overlay = renderTradingCalendarOverlay(calendar, defaultTradingCalendarDisplayOptions(), context(times), "en-US");
  assert.ok(overlay);
  assert.equal(overlay.id, "openkline.trading-calendar.visual-market");
  assert.equal(overlay.commands.filter((command) => command.kind === "rectangle").length, 1);
  assert.equal(overlay.commands.filter((command) => command.kind === "line").length, 2);
  assert.equal(overlay.commands.filter((command) => command.kind === "text").length, 1);
});

test("trading calendar display options are bounded and immutable at the API boundary", () => {
  const options = resolveTradingCalendarDisplayOptions({ showLabels: false, maxSessions: 4 });
  assert.equal(options.showLabels, false);
  assert.equal(options.maxSessions, 4);
  assert.throws(() => resolveTradingCalendarDisplayOptions({ opacity: 1.1 }), /Invalid/);
  assert.throws(() => resolveTradingCalendarDisplayOptions({ maxSessions: 0 }), /Invalid/);
});
