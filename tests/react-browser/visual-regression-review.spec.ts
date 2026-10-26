import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { expect, test, type TestInfo } from "@playwright/test";

function reviewScreenshot(bytes: Buffer, fileName: string, testInfo: TestInfo): void {
  const generatedPath = testInfo.outputPath(fileName);
  writeFileSync(generatedPath, bytes);
  const baselineRoot = process.env.OPENKLINE_VISUAL_BASELINE_DIR;
  const baselinePath = baselineRoot === undefined ? null : join(resolve(baselineRoot), fileName);
  let status = "SCREENSHOT GENERATED";
  let baselineBytes = 0;
  let differentBytes = 0;
  if (baselinePath !== null && existsSync(baselinePath)) {
    const baseline = readFileSync(baselinePath);
    baselineBytes = baseline.byteLength;
    differentBytes = Math.abs(bytes.byteLength - baseline.byteLength);
    for (let index = 0; index < Math.min(bytes.byteLength, baseline.byteLength); index += 1) {
      if (bytes[index] !== baseline[index]) differentBytes += 1;
    }
    status = differentBytes === 0 ? "SCREENSHOT COMPARED" : "REGRESSION DETECTED";
    expect(differentBytes, `Visual baseline differs for ${fileName}; review the generated artifact before changing a baseline`).toBe(0);
  } else if (baselineRoot !== undefined) {
    status = "UNABLE TO VERIFY";
  }
  writeFileSync(testInfo.outputPath(`${basename(fileName, ".png")}.image-difference.json`), `${JSON.stringify({
    schemaVersion: 1,
    status,
    generated: { path: generatedPath, bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") },
    baseline: baselinePath === null ? null : { path: baselinePath, bytes: baselineBytes },
    differentBytes,
    note: "This report never approves a baseline. Byte equality is a strict review signal, not a WCAG or cross-browser claim.",
  }, null, 2)}\n`);
}

test("captures deterministic desktop and light-theme review artifacts", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await expect(page.locator("canvas")).toHaveCount(1);
  const dark = await page.screenshot({ path: testInfo.outputPath("studio-dark.png"), fullPage: true });
  reviewScreenshot(dark, "studio-dark.png", testInfo);
  await page.getByLabel("Theme").selectOption("light");
  const light = await page.screenshot({ path: testInfo.outputPath("studio-light.png"), fullPage: true });
  reviewScreenshot(light, "studio-light.png", testInfo);
  expect(dark.byteLength).toBeGreaterThan(10_000);
  expect(light.byteLength).toBeGreaterThan(10_000);
});

test("captures a deterministic narrow-layout review artifact", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("canvas")).toHaveCount(1);
  const mobile = await page.screenshot({ path: testInfo.outputPath("studio-mobile.png"), fullPage: true });
  reviewScreenshot(mobile, "studio-mobile.png", testInfo);
  expect(mobile.byteLength).toBeGreaterThan(5_000);
});
