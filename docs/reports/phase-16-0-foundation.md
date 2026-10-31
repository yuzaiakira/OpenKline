# Phase 16.0 foundation status

Status: **IN PROGRESS — INTERNAL IMPLEMENTATION ONLY**

## Authorization boundary

The owner explicitly authorized internal Phase 16.0 implementation in the
current owner instruction, based on the reviewed design at commit
`76ad54525958e5689b752b49855209beacdb37ee`. The authorization is limited to
an internal replay-causal execution-research simulator, numerical/causal/
lifecycle/regression tests, internal benchmarks, and technical documentation.

It does not authorize public exports, API-baseline changes, licensing work,
npm publication, tags, releases, broker connectivity, or live execution.
Simulated results remain distinct from observed exchange records. Phase 15.5
compatibility, legal, accessibility, and release gates remain open.

## Milestone 1 implementation

The unexported `src/research-execution/` module now contains:

- versioned internal assumptions, decision, order, fill, ledger, quality,
  journal, diagnostic, and JSON-safe export contracts;
- a deterministic session adapter over `MarketReplayController`, preserving
  the existing event/receive clock, strict-causal eligibility, cursor, seek,
  reset, and disposal lifecycle;
- market and limit order decisions for one spot, long-only, unleveraged
  instrument, with fixed/bounded latency, idempotency, cancellation, risk and
  precision checks;
- Level-2-only marketable execution using synchronized displayed depth,
  source coverage, sequence-gap, stale, crossed, locked, invalid, and missing
  liquidity diagnostics; OHLCV is never used as executable liquidity;
- conservative passive-order uncertainty plus explicitly labelled hypothetical
  scenario fills;
- transaction costs, adverse slippage, optional price impact, partial fills,
  cash/position/P&L accounting, split/dividend boundaries, and no synthetic
  end-of-tape liquidation;
- source-generation-safe observed trade revision tracking without writing
  simulated fills into canonical trades, CVD, Footprint, or the replay tape;
- deterministic backward reconstruction, forward replay, bounded journal
  retention, scenario export, and disposal cleanup; and
- an independent `ReferenceExecutionLedger` used by numerical parity tests.

The root `src/index.ts`, React package exports, Studio, package metadata, and
protected API inventory were not extended.

## Verified milestone evidence

| Check | Result |
| --- | --- |
| Research unit/causality suite | **PASS** — 12/12 |
| TypeScript build (`npm run build:core`) | **PASS** |
| Test TypeScript compilation | **PASS** |
| Same-event lookahead prevention | **PASS** |
| Missing/stale/crossed/locked/gapped L2 handling | **PASS** |
| Displayed-depth budget and no reuse without a new book event | **PASS** |
| Passive uncertainty and explicit scenario labels | **PASS** |
| Latency and idempotency | **PASS** |
| Precision, risk, cancellation, disposal | **PASS** |
| Split/dividend causal accounting | **PASS** |
| Backward/forward reconstruction parity | **PASS** |
| Corrected/source-generation observations | **PASS** |
| Receive-time missing receipt handling | **PASS** |
| Public API baseline | **NOT YET RECHECKED** — root exports unchanged by inspection |
| 1k/10k/100k benchmark | **NOT VERIFIED** — next milestone |
| Full repository regression suite | **NOT VERIFIED** — next milestone |

The displayed-depth test deliberately places a candle between two book
updates and verifies that one observed level cannot be consumed repeatedly by
unrelated market events. Corporate-action fixtures verify that a split scales
entitlements and cancels pending orders before reserve normalization.

## Acceptance matrix at this milestone

| Criterion | Status |
| --- | --- |
| Internal deterministic engine | **PASS** — implementation and targeted tests |
| Causal order frontier and deterministic latency | **PASS** |
| Marketable Level-2 uncertainty | **PASS** — targeted fixtures |
| Passive-order uncertainty | **PASS** |
| Tick, quantity, fees, slippage, and partial fills | **PASS** — targeted numerical fixtures |
| Cash/position/risk invariants | **PASS** — targeted ledger assertions |
| Corporate-action causality | **PASS** — split/dividend fixtures |
| Replay reconstruction | **PASS** — order/fill/ledger/journal parity |
| Source isolation and revisions | **PASS** — targeted fixture |
| Canonical observed-data isolation | **PASS by architecture** — no store/tape mutation path; broader regression pending |
| Serialization/export determinism | **PARTIAL** — JSON-safe export exercised through reconstruction; dedicated benchmark/round-trip pending |
| Lifecycle/resource safety | **PASS** — session disposal and controller cleanup fixture |
| Required 1k/10k/100k benchmark | **NOT VERIFIED** |
| Existing chart/order-flow performance regression | **NOT VERIFIED** |
| Public API exposure | **PASS** — intentionally not exposed; proposal remains NOT PUBLIC |

## Remaining work before Phase 16.0 completion

1. Add and run the deterministic 1k/10k/100k benchmark with median/p95
   construction, processing, seek, serialization, heap, and disposal metrics.
2. Run the complete local regression, API diagnostics, package/distribution,
   stress, and supported browser checks; record unavailable official engines
   accurately.
3. Compare existing chart/order-flow baselines without changing those
   subsystems.
4. Complete documentation and final Git evidence after each verified
   milestone.

## Open independent gates

- protected API additive approval remains open;
- official Firefox/WebKit/mobile browser evidence remains environment-blocked
  unless compatible managed binaries are available;
- physical-device, formal accessibility, visual approval, licensing, and
  release gates remain open;
- npm publication, tags, releases, and live broker execution are outside the
  authorization; and
- this internal simulator must not be described as exchange transaction
  history or release-ready functionality.
