# Corporate actions API

OpenKline exposes provider-neutral corporate-action contracts for stock splits,
reverse splits, and cash dividends. The source dataset is versioned and keeps
stable event IDs, monotonic revisions, source provenance, effective times, and
optional knowledge-time metadata.

```ts
import {
  adjustCorporateActionData,
  calculateTotalReturnIndex,
  type CorporateActionDataset,
} from "openkline";

const dataset: CorporateActionDataset = {
  version: 1,
  instrumentId: "ACME",
  source: { id: "offline-fixture", version: "2026-01" },
  knowledgeCoverage: "known",
  actions: [
    {
      id: "split-2-for-1",
      instrumentId: "ACME",
      kind: "stock-split",
      effectiveTime: Date.UTC(2026, 0, 15),
      revision: 1,
      source: { id: "offline-fixture", version: "2026-01" },
      newShares: 2,
      oldShares: 1,
    },
  ],
};

const adjusted = adjustCorporateActionData(candles, dataset, {
  mode: "split-adjusted",
  context: "retrospective",
  volumePolicy: "equivalent-shares",
});
const totalReturn = calculateTotalReturnIndex(candles, dataset.actions);
```

`adjustCorporateActionData()` always clones and validates the input candles.
`raw` returns executable observations, `split-adjusted` returns OHLCV with
pre-split values scaled, and `total-return` returns an explicit index in
`totalReturn` with cash dividends reinvested at the ex-dividend boundary. A
total-return result deliberately has `candles: null`; it is not synthetic
OHLCV.

Use `context: "retrospective"` for present-day historical normalization. Use
`context: "causal-as-of"` with `asOfTime` for replay or historical research.
The causal view excludes actions effective after the frontier and actions whose
declared `knowledgeTime` is later than the knowledge frontier. Missing
knowledge-time coverage remains labeled `unknown`; the library does not infer
announcements or revisions.

Causal source-candle availability is explicit. When the source timeframe is
known, pass `sourceDurationMs`; a candle contributes only when
`candle.time + sourceDurationMs <= asOfTime`, and provenance reports
`sourceAvailability: "fixed-duration"`. When it is omitted, the backward-
compatible opening-time rule includes candles with `candle.time <= asOfTime`,
but provenance reports `"opening-time-provisional"`: an opening timestamp is
not evidence that the final OHLCV was already known. Retrospective mode keeps
its complete historical behavior and does not apply this causal cutoff.

For a causal result, `appliedActions` is bounded by the knowledge frontier,
future payment metadata is removed, and `provenance.excludedActionIds` is
empty. Excluded future actions are an audit concern, not historical data, so
the public causal result does not expose their identifiers or terms. The
returned `candles` and `totalReturn` are likewise limited to available source
observations.

`CorporateActionStore` applies corrections only when a revision increases and
rejects contradictory equal revisions. `InMemoryCorporateActionDatafeed` is a
deterministic fixture adapter. `RestCorporateActionDatafeed` supports bounded,
abortable pagination only through the configured base/trusted origins and
rejects inconsistent source identities.

Charts expose `setCorporateActions`, `setCorporateActionDisplayMode`,
`getCorporateActionAdjustment`, `getDisplayedData`, and
`setCorporateActionMarkersVisible`. `getData()` remains the defensive raw
candle snapshot during normal operation; while replay is active it returns
only the revealed raw prefix so consumers cannot observe future bars.
`getCorporateActionAdjustment()` follows the same replay cutoff and returns a
causal projection while replay is active; it does not expose the complete
retrospective adjustment through a replay-time getter.
Chart indicators consume the currently displayed OHLCV
domain; total-return mode remains an explicit analytical result instead of
being passed off as executable candles. Workspace persistence stores only the
mode, policy, source identity, instrument association, as-of boundary, and
marker visibility. Missing sources remain unresolved references and are not
silently substituted.

`ComparisonEngine.addCorporateActionAsset()` requires an explicit adjustment
mode and records its `basis` as `raw`, `split-adjusted`, or `total-return`.
For causal comparison inputs, pass the same optional `sourceDurationMs` used
by the chart. Comparison lines are derived values and must not replace the raw
price series.

No provider, exchange calendar, FX conversion, or authoritative event history
is bundled by the core package.
