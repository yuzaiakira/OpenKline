import { expect, test } from "@playwright/test";

test("public alerts evaluate live and replay data with deterministic simulated history", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/examples/vanilla/index.html");
  await page.waitForFunction(() => Boolean((globalThis as { __openklineChart?: unknown }).__openklineChart));

  const result = await page.evaluate(() => {
    type Candle = { time: number; open: number; high: number; low: number; close: number; volume?: number };
    type AlertEvent = { alertId: string; simulated: boolean; evaluationMode: string; barTimestamp: number };
    type Replay = { start(): void; stepForward(): void; seekToBar(index: number): void; exit(): void; getStatus(): { currentIndex: number | null } };
    type Chart = {
      getData(): Candle[];
      addAlert(definition: object): { id: string; update(patch: object): unknown; remove(): void };
      getAlertHistory(mode?: string): AlertEvent[];
      subscribe(name: string, listener: (event: AlertEvent) => void): () => void;
      createReplay(options: object): Replay;
      serializeWorkspace(): { alerts?: { alerts: unknown[] } };
      getAlert(id: string): { update(patch: object): unknown };
    };
    const chart = (globalThis as unknown as { __openklineChart: Chart }).__openklineChart;
    const source = chart.getData();
    const threshold = (source[5]!.close + source[6]!.close) / 2;
    const received: AlertEvent[] = [];
    const unsubscribe = chart.subscribe("alertTriggered", (event) => received.push(event));
    const alert = chart.addAlert({
      id: "replay-cross",
      name: "Replay cross",
      condition: { type: "price-cross-above", value: threshold },
      frequency: "once-per-bar",
    });
    const replay = chart.createReplay({ source, startAt: source[0]!.time, speed: 100 });
    replay.start();
    for (let index = 0; index < 6; index += 1) replay.stepForward();
    const firstReplayHistory = chart.getAlertHistory("replay");
    const liveHistoryBeforeExit = chart.getAlertHistory("live");
    const workspace = chart.serializeWorkspace();
    const statusBeforeReseek = replay.getStatus();
    replay.seekToBar(6);
    const reseekHistory = chart.getAlertHistory("replay");
    const blockedUpdate = (() => {
      try {
        alert.update({ name: "blocked" });
        return "not-blocked";
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    })();
    replay.exit();
    unsubscribe();
    return {
      firstReplayHistory,
      reseekHistory,
      liveHistoryBeforeExit,
      workspace,
      received,
      statusBeforeReseek,
      blockedUpdate,
      afterExitLiveHistory: chart.getAlertHistory("live"),
      alertId: alert.id,
    };
  });

  expect(result.alertId).toBe("replay-cross");
  expect(result.firstReplayHistory).toHaveLength(1);
  expect(result.firstReplayHistory[0]).toMatchObject({ alertId: "replay-cross", simulated: true, evaluationMode: "replay" });
  expect(result.liveHistoryBeforeExit).toEqual([]);
  expect(result.reseekHistory).toHaveLength(1, "seek rebuilds simulated history deterministically");
  expect(result.workspace.alerts?.alerts).toHaveLength(1);
  expect(result.received.every((event) => event.simulated)).toBe(true);
  expect(result.statusBeforeReseek.currentIndex).toBe(6);
  expect(result.blockedUpdate).toMatch(/read-only during replay/);
  expect(result.afterExitLiveHistory).toEqual([]);
  expect(pageErrors).toEqual([]);
});
