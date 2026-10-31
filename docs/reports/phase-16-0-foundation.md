# Phase 16.0 — Replay-Causal Execution Research Foundation

Status: **INTERNAL IMPLEMENTATION COMPLETE — EXTERNAL AND RELEASE GATES OPEN**

Verification date: 2026-10-31

## Authorization boundary

The authorized owner approved internal Phase 16.0 implementation based on the
reviewed design at commit `76ad54525958e5689b752b49855209beacdb37ee`. The
authorization covers the internal replay-causal execution-research simulator,
numerical/causality/lifecycle/regression tests, internal benchmarks, and
technical documentation.

It does not authorize public exports, protected API-baseline changes,
licensing work, npm publication, tags, releases, broker connectivity, or live
execution. Simulated executions remain separate from observed exchange
transactions. Phase 15.5 compatibility, legal, accessibility, and release
gates remain open.

## Revisions and implementation scope

| Milestone | Revision | Result |
| --- | --- | --- |
| Reviewed design baseline | `76ad54525958e5689b752b49855209beacdb37ee` | Authorization basis |
| Internal simulator | `5dc6ab99997d1f8c5ef510fffc23e00f34209521` | Implemented and pushed |
| Research benchmark evidence | `e58991abb826fc0b771a0b02f0eec127e9ce5d8e` | Implemented, measured, and pushed |

The implementation is intentionally confined to the internal
`src/research-execution/` module and its internal tests/benchmark. The root
`src/index.ts`, React exports, Studio, package metadata, licensing files, and
`docs/audits/public-api-baseline.json` were not extended or approved.

The simulator now provides:

- versioned internal assumptions, decision, order, fill, ledger, quality,
  journal, diagnostic, and JSON-safe export contracts;
- a deterministic adapter over `MarketReplayController`, preserving event and
  receive clocks, strict-causal eligibility, cursor/seek/reset behavior, and
  disposal;
- spot, long-only, unleveraged market and limit decisions with fixed/bounded
  latency, idempotency, cancellation, precision, and risk checks;
- Level-2-only marketable execution using displayed depth, source coverage,
  sequence-gap, stale, crossed, locked, invalid, and missing-liquidity
  diagnostics. OHLCV is never treated as executable liquidity;
- conservative passive-order uncertainty and explicitly labelled hypothetical
  scenario fills;
- transaction costs, adverse slippage, optional price impact, partial fills,
  cash/position/P&L accounting, split/dividend boundaries, and no synthetic
  end-of-tape liquidation;
- source-generation-safe observed-trade revision tracking without writing
  simulated fills into canonical trades, CVD, Footprint, or the replay tape;
- deterministic backward reconstruction and forward replay, bounded journal
  retention, deterministic JSON-safe export, and disposal cleanup; and
- an independent `ReferenceExecutionLedger` used by numerical parity tests.

## Verification results

### Internal correctness and lifecycle

| Check | Result |
| --- | --- |
| Research causality/numerical suite | **PASS — 12/12** |
| Full Node/integration suite | **PASS — 337/337** |
| TypeScript build and test compilation | **PASS** |
| Same-event lookahead prevention | **PASS** |
| Missing/stale/crossed/locked/gapped L2 handling | **PASS** |
| Displayed-depth budget and no reuse without a new book event | **PASS** |
| Passive uncertainty and scenario labels | **PASS** |
| Latency, idempotency, cancellation, and risk | **PASS** |
| Precision, fees, slippage, partial fills, and ledger parity | **PASS** |
| Split/dividend causal accounting | **PASS** |
| Backward/forward reconstruction | **PASS** |
| Corrected/source-generation observations | **PASS** |
| Receive-time missing receipt handling | **PASS** |
| Canonical observed-data isolation | **PASS** — no mutation path into canonical market trades, CVD, Footprint, or replay tape |
| Disposal and post-disposal rejection | **PASS** |

The tests intentionally distinguish simulated decisions/fills from observed
market events. There is no broker adapter, live order path, or exchange
transaction claim.

### Research benchmark

Command:

```text
npm run benchmark:research
```

Environment: Linux x64, Node `v24.19.0`, forced GC available. The deterministic
synthetic workload used one source-status event, one synchronized Level-2
snapshot, unique observed trades, one market buy, two seeks, reference-ledger
parity, JSON export, disposal, and forced-GC readings. It did not use external
data, a chart, a Worker, or a Studio consumer.

| Events | Samples | Processing median/p95 (ms) | Construction median/p95 (ms) | Seek median/p95 (ms) | Serialization median/p95 (ms) | Heap before dispose median/p95 (MiB) | Retained after dispose median/p95 (MiB) |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 5 | 43.66 / 46.25 | 28.44 / 39.96 | 11.97 / 12.39 | 0.091 / 0.312 | 7.74 / 7.82 | 0.103 / 0.612 |
| 10,000 | 5 | 530.25 / 568.68 | 253.97 / 257.82 | 311.75 / 365.48 | 0.097 / 0.128 | 34.12 / 34.48 | 0.217 / 0.247 |
| 100,000 | 3 | 3,856.63 / 3,932.73 | 2,636.97 / 2,661.19 | 1,353.45 / 1,355.37 | 0.086 / 0.142 | 141.97 / 142.00 | 0.212 / 0.231 |

The required 1k/10k/100k internal benchmark is **PASS**. No 500k run was
performed. These are simulator workload measurements, not broker, exchange,
chart-FPS, or production-capacity claims. The full protocol and limitations
are in [`docs/benchmarks/replay-execution-research.md`](../benchmarks/replay-execution-research.md).

### Existing chart and Order Flow baselines

The separate existing baselines were run without changing chart or Order Flow
subsystems:

- `npm run benchmark:market-replay`: **PASS** for 1k/10k/100k replay workloads.
- `npm run benchmark:order-flow`: **PASS** for deterministic 1k/10k/100k
  trade/CVD/Footprint and order-book workloads.
- `npm run benchmark:order-flow:browser`: **PASS** for 45 real Canvas2D
  workloads on system Chromium; each scenario reported `1 → 0` canvases and
  `0` active Workers after disposal. The current environment-specific 100k
  fit readings included 35.84 FPS plain and 7.97 FPS combined navigation;
  combined fit navigation was 124.9 ms median / 135.2 ms p95. These values
  are not directly comparable to the historical approximately 62 FPS plain
  and approximately 60 FPS realistic-combined baselines, so no regression or
  universal performance claim is made from that comparison. Dense fit-content
  remains an open limitation.

## Regression, package, and distribution checks

| Command/check | Result |
| --- | --- |
| `npm run build` / `npm run typecheck` | **PASS** |
| `npm test` | **PASS — 337/337** |
| `npm run stress:ci` | **PASS** — Node 4,000 events; browser 0 orphan failures, 0 Worker orphans, 0 remaining canvases |
| `npm run api:inventory` | **PASS** — baseline not written; root exports unchanged |
| `npm run api:diagnostics` | **PASS_ADDITIVE_REVIEW_REQUIRED** — pre-existing additive review remains open |
| `npm run api:check` | **OPEN / expected failure** — three pre-existing hash changes in `Chart`, `WorkspaceDocument`, and `WorkspaceRestoreOptions`; no removals |
| `npm run package:check` | **PASS** — 534 files, 640,520-byte tarball, 3,781,039-byte unpacked, shasum `a7fb8e3bed464f76cd0de6d850a0564812d70c66` |
| `npm run package:audit` | **PASS** — license status remains `pending-owner-approval` |
| `npm run package:portability` | **PASS** |
| `npm run package:smoke` | **PASS** — installed local tarball and ESM consumer |
| `npm run distribution:check` | **PASS** — no distribution problems; no publication performed |
| `npm run studio:check` | **PASS** — core and private Studio separation checks |

Phase 16.0 added no public API declaration and did not alter the protected
baseline. The additive API gate is an inherited project gate and is not
silently re-baselined by this work.

## Browser evidence and environment limits

The available local browser was system Chromium `/usr/bin/chromium`, version
`154.0.8037.57`, under Playwright `1.64.1`:

| Check | Result |
| --- | --- |
| `npm run test:browser` | **PASS — 35/35** |
| `npm run test:react:browser` | **PASS — 38/38** |
| `npm run test:react:production` | **PASS — 1/1** |
| `npm run browser:diagnostic` | **PASS — 70/70** across system Chromium and mobile-Chrome emulation |
| `npm run test:browser:compat` | **BLOCKED — 35/140 passed; 105 launch-blocked before assertions** |

The compatibility run scheduled 140 tests: mobile-Chrome emulation passed
35/35; Firefox 35/35, WebKit 35/35, and mobile-Safari 35/35 could not launch
because the Playwright-managed executables are absent:

- Firefox: `/home/agent/.cache/ms-playwright/firefox-1555/firefox/firefox`
- WebKit: `/home/agent/.cache/ms-playwright/webkit-2370/pw_run.sh`

The command exited with code 1 because of those launch failures. The failures
were not converted into passes and system Chromium was not substituted for
Firefox, WebKit, or Safari. Physical-device testing, formal accessibility
approval, and visual approval were not performed.

## Acceptance matrix

| Acceptance criterion | Status | Evidence/limitation |
| --- | --- | --- |
| Authorized internal implementation | **PASS** | Unexported research-execution module and pushed commits |
| Strict causal decision frontier | **PASS** | Same-event and latency fixtures |
| Level-2-only executable liquidity | **PASS** | Quality, source, sequence, stale, crossed, locked, and depth-budget tests |
| Passive-order uncertainty | **PASS** | Conservative and hypothetical scenario labels |
| Costs, precision, risk, partial fills | **PASS** | Numerical parity and invariant tests |
| Corporate-action causality | **PASS** | Split/dividend tests |
| Reconstruction and bounded journal | **PASS** | Backward/forward seek and lifecycle tests |
| Observed-data/source isolation | **PASS** | Revision/source-generation tests and architecture review |
| Deterministic JSON-safe export | **PASS** | Benchmark serialization and deterministic test fixtures; no public import API added |
| Lifecycle cleanup | **PASS** | Simulator disposal plus browser `1 → 0` canvas and zero Worker checks |
| 1k/10k/100k internal benchmark | **PASS** | `benchmark:research`, forced-GC measurements |
| Full local regression | **PASS** | 337 Node tests and CI stress profile |
| Package/distribution verification | **PASS** | Local pack, audit, portability, smoke, and distribution checks |
| Public API exposure | **PASS** | Deliberately not exposed; protected baseline unchanged |
| Existing chart/Order Flow regression | **OBSERVED, NOT COMPARABLE** | Separate benchmarks ran; host/workload differs from historical baseline |
| System Chromium and mobile emulation | **PASS** | Local browser evidence above |
| Firefox, WebKit, Mobile Safari | **BLOCKED** | Managed browser binaries unavailable in this environment |
| Physical devices, formal accessibility, visual approval | **NOT TESTED / OPEN** | Requires separate approved environment and review |
| Protected API additive approval | **OPEN** | Three inherited hash changes remain under owner review |
| License, npm, tags, releases, live broker | **NOT AUTHORIZED / NOT PERFORMED** | Outside owner authorization |

## Final assessment

The authorized **internal Phase 16.0 implementation milestone is complete**:
the simulator, causal protections, Level-2 uncertainty model, accounting,
reconstruction, lifecycle behavior, tests, benchmarks, and technical evidence
are implemented and verified locally. This does not close inherited Phase
15.5 compatibility/legal/accessibility/release gates, does not approve the
public API proposal, and does not authorize Phase 16.1, public distribution,
or live execution.

Git verification after the final documentation commit must continue to show
the required identity `Akira Yuzai <yuzai.akira@gmail.com>`, a clean working
tree, and `HEAD == origin/main`. No GitHub Actions, npm publication, release,
tag, license change, or force-push was used.
