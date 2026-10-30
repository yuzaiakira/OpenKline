#!/usr/bin/env node
/** Orchestrate isolated Phase 11 calendar benchmark workers. */
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const sizes = [1_000, 10_000, 100_000];
const scenarios = [
  "enumeration", "expectedSlots", "coverageSlots", "sessionAggregation", "weekAggregation", "monthAggregation",
  "indicator", "previousLevels", "append", "correction", "asOfSeek", "calendarReplacement", "disposal",
];
const worker = fileURLToPath(new URL("./market-calendar-benchmark-worker.mjs", import.meta.url));

function runWorker(count, scenario) {
  const result = spawnSync(process.execPath, ["--expose-gc", worker], {
    cwd: process.cwd(),
    env: { ...process.env, OPENKLINE_CALENDAR_BENCHMARK_SIZE: String(count), OPENKLINE_CALENDAR_BENCHMARK_SCENARIO: scenario },
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`Calendar benchmark worker failed for ${count}/${scenario}: ${result.stderr || result.stdout}`);
  const output = result.stdout.trim().split("\n").at(-1);
  if (output === undefined) throw new Error(`Calendar benchmark worker returned no JSON for ${count}/${scenario}`);
  return JSON.parse(output);
}

const report = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  platform: `${process.platform}/${process.arch}`,
  cpu: os.cpus()[0]?.model ?? "unknown",
  sourceTimeframe: "1m",
  calendar: { id: "openkline-benchmark-market", version: "2026.1", timeZone: "America/New_York", fixture: "weekday split sessions with deterministic early close and holiday" },
  note: "Node calculation measurements only; not Canvas2D FPS, browser, exchange, or physical-device performance claims.",
  dstResolution: runWorker(1_000, "dst").measurement,
  isolation: "Each size/scenario runs in a fresh Node child process; 100k uses one cold sample and smaller cases use repeated samples.",
  cases: [],
};

for (const count of sizes) {
  const measurements = {};
  let metadata = null;
  for (const scenario of scenarios) {
    const result = runWorker(count, scenario);
    measurements[scenario] = result.measurement;
    metadata ??= { repetitions: result.repetitions, warmup: result.warmup, sessionCount: result.sessionCount, sourceSlotCount: result.sourceSlotCount };
  }
  report.cases.push({ count, ...metadata, measurements });
}

console.log(JSON.stringify(report, null, 2));
