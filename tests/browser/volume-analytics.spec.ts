import { expect, test } from "@playwright/test";

test("renders Anchored VWAP and an estimated Volume Profile through public chart APIs", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/examples/vanilla/index.html");
  await page.waitForFunction(() => Boolean((globalThis as { __openklineChart?: unknown }).__openklineChart));

  const state = await page.evaluate(() => {
    const chart = (globalThis as unknown as {
      __openklineChart: {
        getData(): Array<{ time: number; close: number }>;
        addAnchoredVwap(options: object): { id: string; getResult(): { outputs: Array<{ points: Array<{ value: number | null }> }> }; setAnchor(time: number): void };
        addVolumeProfile(options: object): { id: string; getResult(): { status: string; bins: Array<{ estimatedVolume: number }>; pointOfControl: unknown; valueArea: unknown }; setMode(mode: string, range?: { from: number; to: number }): void };
        getAnchoredVwaps(): Array<{ getOptions(): { anchorTime: number; priceSource: string }; startPlacement(): void }>;
        getSeriesIds(): string[];
        getVolumeProfiles(): Array<{ id: string; getOptions(): { id: string } }>;
        getPrimaryDrawingPaneBounds(): { left: number; right: number; top: number; bottom: number; chartWidth: number; chartHeight: number };
        serializeWorkspace(): { indicators: Array<{ indicatorId: string; parameters: Record<string, unknown> }>; volumeAnalytics?: { volumeProfiles: Array<{ id: string }> } };
        restoreWorkspace(document: unknown): void;
        zoom(scale: number): void;
        destroy(): void;
      };
    }).__openklineChart;
    const data = chart.getData();
    const anchored = chart.addAnchoredVwap({ id: "browser-anchored-vwap", anchorTime: data[10]!.time, priceSource: "close" });
    const profile = chart.addVolumeProfile({ id: "browser-volume-profile", mode: "visible", binCount: 12, allocation: "range-uniform", valueAreaPercentage: 0.7, showLabels: true });
    const initial = {
      resultPoints: anchored.getResult().outputs[0]?.points.length ?? 0,
      profile: profile.getResult(),
      profileIds: chart.getVolumeProfiles().map((item) => item.id),
      series: chart.getSeriesIds(),
    };
    anchored.setAnchor(data[20]!.time);
    const changed = anchored.getResult().outputs[0]?.points[0]?.value ?? null;
    profile.setMode("fixed", { from: data[0]!.time, to: data.at(-1)!.time + 1 });
    const fixed = profile.getResult();
    chart.zoom(0.8);
    const fixedAfterZoom = profile.getResult();
    const workspace = chart.serializeWorkspace();
    const beforeRestoreAnchor = chart.getAnchoredVwaps()[0]?.getOptions().anchorTime ?? null;
    const persistedProfile = workspace.volumeAnalytics?.volumeProfiles[0]?.id ?? null;
    chart.restoreWorkspace(workspace);
    const restoredAnchored = chart.getAnchoredVwaps()[0];
    const restoredProfile = chart.getVolumeProfiles()[0];
    restoredAnchored?.startPlacement();
    return {
      initial,
      changed,
      fixed,
      fixedAfterZoom,
      beforeRestoreAnchor,
      persistedProfile,
      restoredAnchor: restoredAnchored?.getOptions().anchorTime ?? null,
      restoredProfile: restoredProfile?.getOptions().id ?? null,
      restoredIndicator: chart.serializeWorkspace().indicators.find((item) => item.indicatorId === "ANCHORED_VWAP")?.parameters.anchorTime ?? null,
      pane: chart.getPrimaryDrawingPaneBounds(),
    };
  });

  expect(state.initial.resultPoints).toBeGreaterThan(0);
  expect(state.initial.profile.status).toBe("ready");
  expect(state.initial.profile.bins.some((bin) => bin.estimatedVolume > 0)).toBe(true);
  expect(state.initial.profile.pointOfControl).not.toBeNull();
  expect(state.initial.profile.valueArea).not.toBeNull();
  expect(state.initial.profileIds).toEqual(["browser-volume-profile"]);
  expect(state.initial.series).toContain("browser-anchored-vwap:value");
  expect(state.changed).not.toBeNull();
  expect(state.fixedAfterZoom).toEqual(state.fixed);
  expect(state.persistedProfile).toBe("browser-volume-profile");
  expect(state.restoredProfile).toBe("browser-volume-profile");
  expect(state.restoredAnchor).not.toBeNull();
  expect(state.restoredIndicator).toBe(state.restoredAnchor);
  const canvasBox = await page.locator("canvas").boundingBox();
  expect(canvasBox).not.toBeNull();
  await page.mouse.click(canvasBox!.x + state.pane.right * 0.9, canvasBox!.y + state.pane.top + (state.pane.bottom - state.pane.top) * 0.5);
  const placedAnchor = await page.evaluate(() => {
    const chart = (globalThis as unknown as { __openklineChart: { getAnchoredVwaps(): Array<{ getOptions(): { anchorTime: number } }>; serializeWorkspace(): { indicators: Array<{ indicatorId: string; parameters: Record<string, unknown> }> } } }).__openklineChart;
    const anchor = chart.getAnchoredVwaps()[0]?.getOptions().anchorTime ?? null;
    const persisted = chart.serializeWorkspace().indicators.find((item) => item.indicatorId === "ANCHORED_VWAP")?.parameters.anchorTime ?? null;
    return { anchor, persisted };
  });
  expect(placedAnchor.anchor).not.toBe(state.restoredAnchor);
  expect(placedAnchor.persisted).toBe(placedAnchor.anchor);
  expect(pageErrors).toEqual([]);

  const pixelCount = await page.evaluate(() => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    const pixels = canvas.getContext("2d")!.getImageData(68, 14, canvas.width - 80, canvas.height - 44).data;
    return Array.from({ length: Math.floor(pixels.length / 4) }, (_, index) => index).filter((index) => {
      const offset = index * 4;
      return (pixels[offset] ?? 0) > 120 && (pixels[offset + 2] ?? 0) > 80;
    }).length;
  });
  expect(pixelCount).toBeGreaterThan(0);

  await page.evaluate(() => (globalThis as unknown as { __openklineChart: { destroy(): void } }).__openklineChart.destroy());
  await expect.poll(() => page.locator("canvas").count()).toBe(0);
});
