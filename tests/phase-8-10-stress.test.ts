import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("Phase 8.10 CI stress profile passes node integrity and advanced-module gates", () => {
  const result = spawnSync(process.execPath, ["--expose-gc", "scripts/phase-8-10-node-stress.mjs"], {
    env: { ...process.env, OPENKLINE_STRESS_PROFILE: "ci" },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const reportPath = "artifacts/phase-8-10/node-stress-ci.json";
  assert.equal(existsSync(reportPath), true);
  const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
    status: string;
    realtime: { processed: number; storeSize: number };
    advanced: { klineScriptOk: number; replayOk: number; backtestCancelOk: number; paperOk: number };
  };
  assert.equal(report.status, "pass");
  assert.ok(report.realtime.processed >= 1_000);
  assert.ok(report.realtime.storeSize >= 48);
  assert.equal(report.advanced.klineScriptOk, report.advanced.replayOk);
  assert.ok(report.advanced.backtestCancelOk > 0);
  assert.ok(report.advanced.paperOk > 0);
});
