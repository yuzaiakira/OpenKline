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
        getSeriesIds(): string[];
        getVolumeProfiles(): Array<{ id: string }>;
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
    return { initial, changed, fixed, fixedAfterZoom };
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
