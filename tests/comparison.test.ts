import test from "node:test";
import assert from "node:assert/strict";
import { ComparisonEngine } from "../src/index.js";

const btc = [
  { time: 1_000, price: 100 },
  { time: 2_000, price: 110 },
  { time: 3_000, price: 90 },
];

function rounded(data: readonly { readonly time: number; readonly value: number }[]): Array<{ time: number; value: number }> {
  return data.map((point) => ({ time: point.time, value: Number(point.value.toFixed(10)) }));
}

test("comparison engine calculates percentage and indexed performance from one shared baseline", () => {
  const engine = new ComparisonEngine({ mode: "percentage" });
  engine.addAsset({ id: "BTC-USD", data: btc });
  engine.addAsset({ id: "ETH-USD", data: [{ time: 1_000, price: 200 }, { time: 2_000, price: 220 }, { time: 3_000, price: 180 }] });
  engine.setBaseline(1_000);

  assert.deepEqual(engine.getNormalizedData().map((asset) => rounded(asset.data)), [
    [{ time: 1_000, value: 0 }, { time: 2_000, value: 10 }, { time: 3_000, value: -10 }],
    [{ time: 1_000, value: 0 }, { time: 2_000, value: 10 }, { time: 3_000, value: -10 }],
  ]);
  assert.ok(Math.abs((engine.getNormalizedValueAt("BTC-USD", 2_000) ?? Number.NaN) - 10) < 1e-12);
  assert.equal(engine.getRawValueAt("BTC-USD", 2_000), 110);

  engine.setMode("indexed");
  assert.deepEqual(rounded(engine.getNormalizedData()[0]?.data ?? []), [
    { time: 1_000, value: 100 }, { time: 2_000, value: 110 }, { time: 3_000, value: 90 },
  ]);
});

test("comparison integration requires and preserves an explicit corporate-action basis", () => {
  const engine = new ComparisonEngine({ mode: "indexed", baseline: { time: 1_000, maxAgeMs: 0 } });
  const candles = [
    { time: 1_000, open: 100, high: 101, low: 99, close: 100 },
    { time: 2_000, open: 50, high: 51, low: 49, close: 50 },
  ];
  engine.addCorporateActionAsset({
    id: "split-adjusted",
    candles,
    corporateActions: {
      version: 1,
      instrumentId: "AAA",
      source: { id: "comparison-fixture", version: "1" },
      knowledgeCoverage: "known",
      actions: [{ id: "split", instrumentId: "AAA", kind: "stock-split", effectiveTime: 2_000, revision: 1, source: { id: "comparison-fixture", version: "1" }, newShares: 2, oldShares: 1 }],
    },
    mode: "split-adjusted",
  });
  const asset = engine.getNormalizedData()[0];
  assert.equal(asset?.basis, "split-adjusted");
  assert.deepEqual(rounded(asset?.data ?? []), [{ time: 1_000, value: 100 }, { time: 2_000, value: 100 }]);
});

test("baseline selection never uses a future observation and handles freshness explicitly", () => {
  const engine = new ComparisonEngine({ mode: "percentage" });
  engine.addAsset("late", [{ time: 2_000, price: 50 }, { time: 3_000, price: 75 }]);
  engine.addAsset("stale", [{ time: 500, price: 10 }, { time: 2_500, price: 20 }]);

  engine.setBaseline(1_000);
  assert.equal(engine.getStatus()[0]?.eligible, false);
  assert.equal(engine.getStatus()[1]?.eligible, false);
  assert.deepEqual(engine.getNormalizedData()[0]?.data, []);

  engine.setBaseline(2_000, { maxAgeMs: 1_600 });
  assert.equal(engine.getStatus()[0]?.baselineTime, 2_000);
  assert.equal(engine.getStatus()[1]?.baselineTime, 500);
  assert.equal(engine.getNormalizedValueAt("stale", 2_500), 100);

  engine.setBaseline(2_000, { maxAgeMs: 100 });
  assert.equal(engine.getStatus()[1]?.eligible, false);
  assert.deepEqual(engine.getNormalizedData()[1]?.data, []);
});

test("realtime, duplicate, out-of-order, and historical corrections remain ordered and deterministic", () => {
  const changes: string[] = [];
  const engine = new ComparisonEngine({ mode: "indexed", baseline: { time: 1_000, maxAgeMs: 0 } });
  engine.addAsset({ id: "asset", label: "Asset", data: [{ time: 1_000, price: 10 }, { time: 3_000, price: 30 }] });
  engine.subscribe((change) => changes.push(change.kind));
  engine.updateAsset("asset", { time: 2_000, price: 20 });
  engine.updateAsset("asset", { time: 2_000, price: 22 });
  engine.updateAsset("asset", { time: 4_000, price: 40 });
  engine.updateAsset("asset", { time: 3_000, price: 33 });

  assert.deepEqual(engine.getRawData("asset"), [
    { time: 1_000, price: 10 }, { time: 2_000, price: 22 }, { time: 3_000, price: 33 }, { time: 4_000, price: 40 },
  ]);
  assert.deepEqual(rounded(engine.getNormalizedData()[0]?.data ?? []), [
    { time: 1_000, value: 100 }, { time: 2_000, value: 220 }, { time: 3_000, value: 330 }, { time: 4_000, value: 400 },
  ]);
  assert.deepEqual(changes, ["data-updated", "data-updated", "data-updated", "data-updated"]);
});

test("comparison assets preserve defensive snapshots and lifecycle cleanup", () => {
  const engine = new ComparisonEngine();
  engine.addAsset({ id: "BTC-USD", color: "#f59e0b", data: btc });
  const snapshot = engine.getAssets();
  (snapshot[0]!.data as Array<{ time: number; price: number }>)[0]!.price = 999;
  assert.equal(engine.getRawValueAt("BTC-USD", 1_000), 100);
  assert.equal(engine.removeAsset("missing"), false);
  assert.equal(engine.removeAsset("BTC-USD"), true);
  engine.dispose();
  assert.throws(() => engine.getAssets(), /disposed/);
});

test("comparison validation rejects zero prices, duplicate timestamps, invalid baselines, and duplicate assets", () => {
  const engine = new ComparisonEngine();
  assert.throws(() => engine.addAsset("invalid", [{ time: 1_000, price: 0 }]), /Invalid comparison price/);
  assert.throws(() => engine.addAsset("invalid-order", [{ time: 2_000, price: 1 }, { time: 2_000, price: 2 }]), /strictly increasing/);
  engine.addAsset("asset", []);
  assert.throws(() => engine.addAsset("asset", []), /already exists/);
  assert.throws(() => engine.setBaseline(1_000, { maxAgeMs: -1 }), /maxAgeMs/);
});
