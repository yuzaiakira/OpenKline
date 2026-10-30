import assert from "node:assert/strict";
import test from "node:test";
import {
  CorporateActionStore,
  CorporateActionValidationError,
  InMemoryCorporateActionDatafeed,
  adjustCorporateActionData,
  calculateTotalReturnIndex,
  type Candle,
  type CorporateAction,
  type CorporateActionDataset,
} from "../src/index.js";

const source = { id: "fixture-corporate-actions", version: "2026.1", provenance: "deterministic test fixture" } as const;
const start = 1_800_000_000_000;
const candles: Candle[] = [
  { time: start, open: 100, high: 105, low: 95, close: 100, volume: 1000 },
  { time: start + 60_000, open: 100, high: 105, low: 95, close: 100, volume: 1000 },
  { time: start + 120_000, open: 50, high: 55, low: 45, close: 50, volume: 2000 },
];

function split(id: string, effectiveTime: number, newShares: number, oldShares: number, revision = 1): CorporateAction {
  return { id, instrumentId: "ACME", kind: newShares >= oldShares ? "stock-split" : "reverse-stock-split", effectiveTime, newShares, oldShares, revision, source };
}

function dividend(id: string, time: number, amountPerShare: number, paymentTime?: number): CorporateAction {
  return { id, instrumentId: "ACME", kind: "cash-dividend", effectiveTime: time, exDividendTime: time, amountPerShare, currency: "USD", ...(paymentTime === undefined ? {} : { paymentTime }), revision: 1, source };
}

function dataset(actions: readonly CorporateAction[], knowledgeCoverage: "known" | "unknown" = "known"): CorporateActionDataset {
  return { version: 1, instrumentId: "ACME", source, knowledgeCoverage, actions };
}

test("2-for-1 split adjusts pre-split OHLCV without mutating raw candles", () => {
  const rawBefore = candles.map((candle) => ({ ...candle }));
  const result = adjustCorporateActionData(candles, dataset([split("split", start + 120_000, 2, 1)]), { mode: "split-adjusted" });
  assert.deepEqual(candles, rawBefore);
  assert.deepEqual(result.candles?.map((candle) => [candle.open, candle.close, candle.volume]), [[50, 50, 2000], [50, 50, 2000], [50, 50, 2000]]);
  assert.equal(result.provenance.rawDataUnchanged, true);
  assert.deepEqual(result.provenance.eligibleActionIds, ["split"]);
});

test("reverse split and consecutive ratios preserve deterministic adjustment math", () => {
  const result = adjustCorporateActionData([
    { time: start, open: 10, high: 10, low: 10, close: 10, volume: 100 },
    { time: start + 120_000, open: 50, high: 50, low: 50, close: 50, volume: 20 },
  ], dataset([split("reverse", start + 120_000, 1, 5)]), { mode: "split-adjusted" });
  assert.equal(result.candles?.[0]?.close, 50);
  assert.equal(result.candles?.[0]?.volume, 20);
  assert.equal(result.candles?.[1]?.close, 50);
  assert.throws(() => adjustCorporateActionData(candles, dataset([{ id: "bad", instrumentId: "ACME", kind: "stock-split", effectiveTime: start, newShares: 1, oldShares: 2, revision: 1, source }]), { mode: "raw" }), CorporateActionValidationError);
});

test("cash dividends form an explicit reinvested total-return index", () => {
  const points = calculateTotalReturnIndex([
    { time: start, open: 100, high: 100, low: 100, close: 100 },
    { time: start + 60_000, open: 100, high: 100, low: 100, close: 100 },
  ], [dividend("dividend", start + 60_000, 10)]);
  assert.equal(points[0]?.value, 100);
  assert.ok(Math.abs((points[1]?.value ?? 0) - 110) < 1e-12);
  const result = adjustCorporateActionData(candles, dataset([dividend("dividend", start + 60_000, 0.75)]), { mode: "total-return" });
  assert.equal(result.candles, null);
  assert.equal(result.provenance.totalReturnConvention, "cash-dividend-reinvested-at-ex-date");
  assert.ok((result.totalReturn?.[1]?.value ?? 0) > 100);
});

test("causal-as-of excludes future effective actions and future knowledge revisions", () => {
  const future = { ...split("future", start + 120_000, 2, 1), knowledgeTime: start + 240_000 } as CorporateAction;
  const before = adjustCorporateActionData(candles, dataset([future]), { mode: "split-adjusted", context: "causal-as-of", asOfTime: start + 180_000 });
  assert.deepEqual(before.provenance.eligibleActionIds, []);
  assert.deepEqual(before.candles, candles);
  const afterEffectiveBeforeKnowledge = adjustCorporateActionData(candles, dataset([future]), { mode: "split-adjusted", context: "causal-as-of", asOfTime: start + 180_000, knowledgeTime: start + 180_000 });
  assert.deepEqual(afterEffectiveBeforeKnowledge.provenance.eligibleActionIds, []);
  const known = adjustCorporateActionData(candles, dataset([future]), { mode: "split-adjusted", context: "causal-as-of", asOfTime: start + 300_000 });
  assert.deepEqual(known.provenance.eligibleActionIds, ["future"]);
});

test("store enforces stable ids, monotonic revisions, deterministic order, and bounded queries", async () => {
  const store = new CorporateActionStore({ instrumentId: "ACME", source, knowledgeCoverage: "known", actions: [dividend("b", start + 120_000, 1), dividend("a", start + 60_000, 1)] });
  assert.deepEqual(store.getAll().map((action) => action.id), ["a", "b"]);
  store.upsert({ ...dividend("a", start + 60_000, 1), revision: 2 });
  assert.equal(store.get("a")?.revision, 2);
  assert.throws(() => store.upsert({ ...dividend("a", start + 60_000, 2), revision: 2 }), CorporateActionValidationError);
  const feed = new InMemoryCorporateActionDatafeed(store.getDataset());
  const page = await feed.getCorporateActions({ instrumentId: "ACME", from: start, to: start + 120_000 });
  assert.deepEqual(page.actions.map((action) => action.id), ["a"]);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => feed.getCorporateActions({ instrumentId: "ACME", from: start, to: start + 120_000, signal: controller.signal }), /aborted/i);
  feed.dispose();
  store.dispose();
});
