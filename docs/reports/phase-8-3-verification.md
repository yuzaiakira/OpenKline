# Phase 8.3 Verification

## Status

Phase 8.3 is open. This report records verified milestones through 8.3.5;
the final benchmark, acceptance matrix, and inherited browser/accessibility/
physical-device gates remain open.

## 8.3.0 baseline

- Implemented: versioned screener types, stable provider/venue-scoped instrument identity, bounded universe validation, Watchlist-to-universe conversion, and a deterministic paginated market-data provider.
- Verified: identity normalization and collision resistance across provider, exchange, and instrument ID; duplicate universe rejection; Watchlist conversion; repeatable confirmed OHLCV pages and cursor pagination.
- Not tested: external providers, credentials, live sockets, browser UI, mobile devices, accessibility, Firefox, WebKit, and visual compatibility.

## 8.3.2 deterministic snapshot scanning

- Implemented: bounded concurrent snapshot runner, provider resolution, cursor pagination, confirmed-bar filtering, duplicate/revision handling, out-of-order sorting, per-symbol error isolation, strict mode, cancellation, deterministic result identity, counts, progress, and diagnostics.
- Verified: `tests/screener-snapshot.test.ts` covers deterministic pagination, reproducible output, bounded progress, correction revisions, provider failure isolation, developing-only data, pre-acquisition validation, and cancellation.
- Not tested: live incremental watching, Worker protocol, Studio integration, external providers, Firefox, WebKit, mobile Safari, physical devices, accessibility, and visual compatibility.
- Security boundary: no dynamic code execution, no external network access, no broker or trading integration.

## Evidence

The baseline test is `tests/screener-baseline.test.ts` and is included in the local Node test command. Build/typecheck and the complete test command must be rerun after each subsequent milestone.

## 8.3.1 rule AST and reference evaluator

- Implemented: versioned typed rule AST, bounded validation, price/volume predicates, nested AND/OR/NOT, registered-indicator references, strict crossings, prior-channel breakout, causal cutoff evaluation, and tri-state unavailable diagnostics.
- Verified: `tests/screener-rules.test.ts` covers invalid ASTs, thresholds, percentages, volume, prior ranges, crossings, SMA reuse, compound unknown propagation, missing volume, invalid candles, developing-bar rejection, and future-bar isolation.
- Not tested: worker scheduling, snapshot aggregation, incremental subscriptions, browser Studio workflows, external providers, Firefox, WebKit, mobile Safari, physical devices, accessibility, and visual compatibility.

## 8.3.3 incremental watch session

- Implemented: `ScreenerWatchSession` lifecycle, confirmed append path through existing indicator incremental instances, correction/out-of-order recalculation for one instrument, duplicate suppression, developing-event filtering, subscription cleanup, rule/universe refresh hooks, and provider error callbacks.
- Verified: `tests/screener-watch.test.ts` covers initial snapshot, append, duplicate, correction, pause/resume, disposal, invalid event handling, and absence of fabricated events.
- Not tested: dedicated Worker, Studio panel, external realtime providers, reconnection policy, Firefox, WebKit, mobile Safari, physical devices, accessibility, and visual compatibility.

## 8.3.4 Screener Worker hardening

- Implemented: dedicated versioned Screener Worker protocol/handler/runtime, serializable calculation boundary, synchronous reference evaluator, progress, stale generation filtering, cancellation, timeout, supersession, crash/disposal cleanup, and structured errors.
- Verified: `tests/screener-worker.test.ts` covers protocol guards, handler evaluation, completion, cancellation, timeout, supersession, and disposal.
- Not tested: Studio integration, external Worker hosts, browser Worker performance, Firefox, WebKit, mobile Safari, physical devices, accessibility, and visual compatibility.

## 8.3.5 Studio integration

- Implemented: the private Next.js Studio now exposes a Market Screener panel
  backed by the public screener contracts. It supports Watchlist-derived
  universes, timeframe and price/indicator rules, nested AND/OR selection,
  bounded snapshot scans, Watch pause/resume/cancel controls, deterministic
  demo stepping, progress/status, result search/filter/sort, source-bar and
  diagnostic display, Open chart/Favorite actions, and versioned JSON preset
  save/load/import/export.
- Implemented: the deterministic demo provider accepts provider-scoped
  Watchlist identities outside its generated demo universe and emits only
  subscribed, confirmed bars for the local Watch workflow. This is a local
  fixture; it is not a vendor adapter, alert service, trading signal, or
  financial advice.
- Verified: `npm test` passed with 151 tests; root typecheck passed; the Next
  example typecheck passed; `npm run build` in
  `examples/nextjs-app-router` passed on Next.js 16.4.3; and the real local
  Chromium test `tests/react-browser/screener.spec.ts` passed (1 test).
- Not tested: Firefox, WebKit, Mobile Chrome, Mobile Safari, physical mobile
  devices, formal accessibility, visual-regression baselines, and external
  market-data providers. These gates remain open.

## 8.3.6 final local verification and benchmark

- Implemented: `npm run benchmark:screener` measures deterministic Node
  snapshot and incremental Watch work at 10, 100, 500, and 1,000 instruments.
  Each size runs three snapshot repetitions and three Watch sessions with five
  synchronous provider steps per session. The script checks that every result
  matches and that every subscribed instrument receives every step update
  before reporting timing values.
- Verified: the benchmark completed on 2026-10-26 with Node.js v24.19.0,
  Linux x64, five reported CPUs, and OpenKline's deterministic provider. These
  values are local reference-engine observations, not browser FPS, Worker
  throughput, network latency, production capacity, or memory limits.

| Instruments | Bars/instrument | Snapshot median / p95 (ms) | Watch start median / p95 (ms) | Watch step median / p95 (ms) | Matched / updates | Heap after dispose (MB) |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 240 | 4.677 / 8.103 | 4.003 / 5.030 | 0.995 / 1.686 | 10 / 50 | 6.03 |
| 100 | 240 | 34.021 / 37.792 | 46.415 / 53.116 | 4.296 / 13.997 | 100 / 500 | 6.19 |
| 500 | 240 | 573.279 / 596.981 | 618.942 / 621.338 | 21.849 / 45.232 | 500 / 2,500 | 6.23 |
| 1,000 | 240 | 2,209.262 / 2,593.837 | 2,280.816 / 2,292.877 | 43.318 / 73.977 | 1,000 / 5,000 | 6.24 |

The benchmark's post-dispose heap observations were 0.30 MB, 0.17 MB,
0.13 MB, and 0.11 MB above the per-size pre-run observations respectively.
The process was invoked with `--expose-gc`; those observations are not leak
proofs. The deterministic provider regenerates fixture history for each page,
so these numbers are useful for regression detection only.

### Local acceptance matrix

| Criterion | State | Evidence / limitation |
| --- | --- | --- |
| Versioned identity and Universe boundary | Implemented / Verified | Node unit tests and deterministic Watchlist conversion tests pass. |
| Declarative rules and tri-state evaluation | Implemented / Verified | Rule validation/evaluation tests pass, including no-lookahead and developing-bar cases. |
| Bounded historical snapshot scan | Implemented / Verified | Pagination, limits, cancellation, revisions, diagnostics, and error isolation tests pass. |
| Incremental Watch lifecycle | Implemented / Verified | Append/correction/duplicate/pause/resume/dispose tests pass; deterministic provider cleanup is covered. |
| Dedicated Screener Worker protocol | Implemented / Verified | In-process handler/runtime tests pass; browser Worker throughput is not claimed. |
| Private Studio integration | Implemented / Verified locally | Next.js 16.4.3 production build and one real Chromium screener workflow pass. |
| Deterministic Node benchmark | Implemented / Verified | `npm run benchmark:screener` completed with the table above. |
| Full local Node regression suite | Verified | `npm test`: 151 passing, 0 failing. |
| Root/package and Next type/build checks | Verified | Root typecheck, Next TypeScript check, package build, and Next production build pass. |
| Firefox and WebKit Playwright projects | Blocked by environment / Not verified | Managed Playwright cache is absent; only system Chromium is available. No substitution was made. |
| Mobile Chrome and Mobile Safari emulation | Not verified | Compatibility suite was not treated as passing without managed artifacts. |
| Physical-device verification | Not tested | No physical device is attached to this environment. |
| Formal accessibility and visual regression | Not tested | No formal audit or screenshot baseline was executed. |
| External provider, credentials, alerts, signals, or trading | Not tested / Out of scope | Phase 8.3 uses the deterministic offline provider only. |

Phase 8.3 therefore remains open. The implemented local milestones are
complete, but the unverified compatibility, accessibility, physical-device,
and external-provider gates must not be converted into a release claim.

### Verification command record

- `npm test`: 151 passing, 0 failing.
- `npm run benchmark:screener`: passed with the measurements above.
- `npm run typecheck`: passed; the Next example TypeScript check also passed.
- `npm run package:check`: passed; packed core contained 394 files.
- `npm run package:smoke`: passed; a clean temporary consumer imported the
  packed ESM package successfully.
- `npm run package:audit`: passed; the report correctly retains
  `licenseStatus: pending-owner-approval` and does not invent license metadata.
- `npm run build` in `examples/nextjs-app-router`: passed on Next.js 16.4.3.
- `npm run test:react:browser -- --grep screener`: passed, 1 Chromium test.
  This used Playwright 1.64.1 with system Chromium 154.0.8037.57 because no
  managed Playwright browser cache is available. No Firefox, WebKit, or mobile
  browser binary was substituted.

### Git and publication verification

The milestones were committed with `Akira Yuzai <yuzai.akira@gmail.com>` and
each successful commit was pushed immediately to `origin/work`:

| Milestone | Commit | Push state |
| --- | --- | --- |
| 8.3.0 | `82934181055ec10e2d158eec73baee4c7167d846` | Pushed and verified |
| 8.3.1 | `b40aa629a2d58962dc5cce0040df0b93b02d4731` | Pushed and verified |
| 8.3.2 | `23af6cfd96f93b75bc1ce670b7ab084d65eadf03` | Pushed and verified |
| 8.3.3 | `e6c51869acbfe780a6774a7812e2a29ad2aa27cc` | Pushed and verified |
| 8.3.4 | `6ed55327f0a4afa12b9501f657ab6c06c320d2a3` | Pushed and verified |
| 8.3.5 | `62bb7c87285c5eea2ce772985568c0c6ef685a07` | Pushed and verified |
| 8.3.6 benchmark/docs | `6509cfd62b6403fbaa26fc4d21068b18d055cc4b` | Pushed and verified |

At the time of this report update, `work` was clean and its local `HEAD`
matched `origin/work` at `6509cfd62b6403fbaa26fc4d21068b18d055cc4b`. No GitHub
Actions, npm publication, release tag, or public release was created. The
effective licensing state remains unchanged and pending owner/legal approval.


