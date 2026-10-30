import { expect, test } from "@playwright/test";

test("calendar overlays and session analysis share chart lifecycle and workspace restoration", async ({ page }) => {
  await page.goto("/examples/vanilla/index.html");
  const result = await page.evaluate(async () => {
    const moduleUrl: string = "/dist/src/index.js";
    const { TradingCalendarEngine, createChart } = await import(moduleUrl);
    const host = document.createElement("div");
    host.style.width = "720px";
    host.style.height = "360px";
    document.body.append(host);
    const chart = createChart(host, { autoSize: false, width: 720, height: 360, timeZone: "UTC" });
    const from = Date.parse("2026-01-05T09:00:00.000Z");
    const candles = Array.from({ length: 7 }, (_, index) => {
      const time = from + index * 60 * 60 * 1000;
      const close = 100 + index;
      return { time, open: close - 1, high: close + 1, low: close - 2, close, volume: 10 };
    });
    chart.setData(candles);
    const calendar = new TradingCalendarEngine({
      id: "browser-session-market",
      version: "1",
      timeZone: "UTC",
      weeklySchedule: [{ weekday: 1, segments: [{ start: "09:00", end: "12:00" }, { start: "13:00", end: "16:00" }] }],
    });
    const calendarApi = chart.setTradingCalendar(calendar, { showLabels: false, maxSessions: 8 });
    const indicator = chart.addSessionIndicator({
      id: "browser-session-sma",
      indicatorId: "SMA",
      sourceTimeframe: "1h",
      targetPeriod: "session",
      calendar,
      asOfTime: Date.parse("2026-01-05T17:00:00.000Z"),
      parameters: { period: 1 },
      pane: "main",
    });
    const saved = chart.serializeWorkspace();
    const before = {
      calendar: chart.getTradingCalendar()?.getSnapshot(),
      display: calendarApi.getDisplayOptions(),
      sessions: indicator.getResult().observations.length,
      outputPoints: indicator.getResult().outputs[0]?.points.length ?? 0,
      persistedCalendar: saved.tradingCalendar,
      persistedSession: saved.sessionAnalysis?.indicators[0],
    };
    indicator.remove();
    chart.removeTradingCalendar();
    chart.restoreWorkspace(saved, { tradingCalendarResolver: (id: string, version: string) => id === calendar.id && version === calendar.version ? calendar : undefined });
    const restoredIndicator = chart.getSessionIndicators()[0];
    const after = {
      calendar: chart.getTradingCalendar()?.getSnapshot(),
      sessions: restoredIndicator?.getResult().observations.length ?? 0,
      restoredCount: chart.getSessionIndicators().length,
    };
    restoredIndicator?.remove();
    chart.destroy();
    host.remove();
    return { before, after, canvases: document.querySelectorAll("canvas").length };
  });

  expect(result.before.calendar).toMatchObject({ calendarId: "browser-session-market", version: "1", timeZone: "UTC" });
  expect(result.before.display.showLabels).toBe(false);
  expect(result.before.sessions).toBe(1);
  expect(result.before.outputPoints).toBeGreaterThan(0);
  expect(result.before.persistedCalendar?.calendarId).toBe("browser-session-market");
  expect(result.before.persistedSession?.targetPeriod).toBe("session");
  expect(result.after.calendar).toMatchObject({ calendarId: "browser-session-market", version: "1" });
  expect(result.after.sessions).toBe(1);
  expect(result.after.restoredCount).toBe(1);
  expect(result.canvases).toBe(1);
});
