# OpenKline Phase 12 — Final Engineering Verification

Date: 2026-10-30  
Environment: Codex managed cloud, Linux x64, Node v24.19.0, npm, Chromium
HeadlessChrome/154.0.0.0  
Status: **Engineering implementation complete for locally available gates;
release and historical compatibility gates remain open.**

This report records implementation and verification evidence only. It does not
claim live profitability, broker execution, currency conversion, physical-device
compatibility, formal accessibility approval, or unconditional release
readiness.

## Git evidence

- Starting SHA: `500683181d86bc55db5747dff33e5a4fb2ae821a`
- Branch: `main` (the Phase 12 specification requires direct work on main)
- Implementation commits:
  - `232e0f25eb0d70bcd7b845c9119c30aa83fa602f` —
    `feat(portfolio): add deterministic shared-capital backtesting`
  - `582c7748d602904872ce99750c833be837413614` —
    `feat(studio): add portfolio backtesting workflow`
  - `969e93d5b83631e008f9becc7045a58ef4a4c6fd` —
    `test(portfolio): tighten replay and verification evidence`
- Author and committer for each implementation commit: `Akira Yuzai
  <yuzai.akira@gmail.com>`
- `origin/main` was fetched after each push and matched the local tip.
- The report itself is committed as a separate documentation commit after the
  implementation tip above; the final remote HEAD is verified in the delivery
  handoff.
- No force-push, release tag, npm publication, GitHub Actions workflow, license
  change, or Phase 13 work was performed.

## Implemented portfolio capability

The additive provider-neutral API now includes:

- Instrument identity, symbol, quote currency, fixed timeframe, calendar
  identity, candles, strategy assignment, and per-instrument execution options.
- Canonical instrument ordering and a merged deterministic event timeline. Equal
  timestamps use market-open, bar-complete, order-fill, valuation priority,
  followed by stable IDs.
- Causal strategy evaluation. A signal becomes available after its source bar
  completes and can fill only at the next eligible bar open, including across
  gaps.
- One shared cash ledger with long-only, no-leverage, no-pyramiding initial
  semantics. Entry sizing supports fixed quantity, fixed notional,
  percent-equity, and target-weight modes.
- Percent/fixed commission and adverse slippage, deterministic order priority,
  accepted/rejected order reasons, completed trade ledger, open positions, cash,
  equity, exposure, drawdown, and per-instrument contributions.
- Explicit stale/unknown valuation policy and no fabricated end-of-data fills.
  Unsupported currency conversion, short selling, leverage, and broker
  execution are rejected or not implemented explicitly.
- Versioned JSON and CSV exports for results, orders, trades, and equity.
- Versioned Worker protocol with progress, cancellation, supersession, timeout,
  malformed-message, crash, stale-generation, and disposal handling. The
  synchronous engine and Worker handler are byte-for-byte equivalent in the
  focused parity test.
- Bounded workspace configuration persistence. Candles, credentials, Worker
  objects, subscriptions, progress, and results are not serialized.
- Offline deterministic Next.js Studio portfolio tester with three instruments,
  strategy assignment, shared capital/cost/risk controls, account metrics,
  order/trade/equity views, exports, replay entry/exit, and workspace save/load.
  The Studio reports an explicit main-thread fallback when its host cannot serve
  the module Worker artifact; this is not hidden as Worker success.

## Financial verification

The focused Node tests use independent numeric assertions:

- With initial capital 110 and simultaneous 10-unit entries at 10 and 20, the
  canonical first instrument fills, the second is rejected for shared cash, final
  cash is 120, and net profit is 10. Reversing input order produces identical
  serialized results.
- A signal on a 1-minute candle becomes available at `start + 60,000` and fills
  at the next eligible opening at `start + 120,000`, not on the signal bar. The
  pre-fill equity snapshot remains 200 and cannot use the future execution price.
- Heterogeneous 1-minute and 5-minute instruments retain deterministic fill
  times and result bytes under input-array reordering.
- Exposure rejection, stale valuation, duplicate rejection, explicit
  last-write-wins correction, export round trips, and disposal are covered by
  assertions in `tests/portfolio-backtesting.test.ts`.
- The Chromium Studio scenario independently produced 11 accepted orders, 21
  risk-rejected orders, and final equity `120632.79353620987` with the selected
  capital/cost/exposure settings.
- Existing replay tests verify that visible series, indicators, drawings,
  crosshair values, and strategy markers do not expose future timestamps. The
  new Studio portfolio test additionally compares the visible chart latest time
  with its replay cutoff.

## Verification results

All required commands were run sequentially; shared `dist` was not rebuilt by
concurrent commands.

| Command / gate | Result | Evidence |
|---|---|---|
| `npm run typecheck` | PASS | Core and React TypeScript checks |
| `npm test` | PASS | 266 Node tests, 0 failures |
| `npm run api:inventory` | PASS | 264 runtime and 599 type exports; baseline not written |
| `npm run api:diagnostics` | PASS with review | `PASS_ADDITIVE_REVIEW_REQUIRED`; no removals, 240 additive surfaces |
| `npm run api:check` | FAIL / open | Historical baseline reports no removals but intentional additive declarations/exports and changed legacy hashes; baseline was not modified |
| `npm run studio:check` | PASS | 117 core and 14 Studio files; no React/Next dependency in core |
| `npm run package:check` | PASS | Local dry-run package: 470 files, 472,498 bytes |
| `npm run package:smoke` | PASS | Tarball installed and imported as ESM |
| `npm run distribution:check` | PASS | No package problems; SHA-1 `32f97a5ca42ca6519d86351b2b476397aa9e16f1` |
| `npm run package:audit` | PASS with legal gate | Package audit passes; license status remains `pending-owner-approval` |
| `npm run package:portability` | FAIL / blocker | Existing provider-specific `binance` text remains in `dist/src/studio/workspace.d.ts` and `.js`; no unrelated API removal was made |
| `npm run test:browser` | PASS | 30/30 Chromium tests |
| `npm run test:react:browser` | PASS | 35/35 React/Studio Chromium tests |
| Focused portfolio browser test | PASS | Deterministic metrics, risk rejection, replay cutoff, export, save/reload, no page errors |
| `npm --prefix examples/nextjs-app-router run build` | PASS | Next 16.4.3 webpack build, TypeScript, static routes |
| `npm run stress:ci` | PASS | Node and browser stress; 0 orphan failures, 0 Worker orphans, 0 remaining canvases |

### Browser and resource evidence

The available Chromium browser benchmark measured:

| Candles | Load ms | Navigation median/p95 ms | Frame-work median/p95 ms | FPS | After destroy |
|---:|---:|---:|---:|---:|---:|
| 1,000 | 21.1 | 0.1 / 0.4 | 2.0 / 4.1 | 64.99 | 0 canvases |
| 10,000 | 107.6 | 0 / 0.2 | 1.3 / 1.8 | 62.92 | 0 canvases |
| 100,000 | 1,718.8 | 0.1 / 0.2 | 1.4 / 21.4 | 63.13 | 0 canvases |

The 100,000-candle browser run observed 160,672,172 bytes before destroy and
3,473,141 bytes after destroy. These are one cloud Chromium observation, not a
universal memory guarantee. Session analytics reported
`remainingCreatedCanvasCount: 0`; its one remaining canvas was the pre-existing
vanilla page canvas and is now accounted for explicitly by the benchmark.

The CI stress profile reported 4,000 realtime events, 0 timed out runs, 40/40
advanced KlineScript/replay/backtest-cancel/paper checks, median event latency
0.1745 ms, p95 13.6379 ms, browser `remainingCanvasCount: 0`, and
`workerOrphans: 0`.

## Portfolio benchmarks

Command: `npm run benchmark:portfolio` on Node v24.19.0. The benchmark uses
2 repetitions and deterministic inputs. Because two samples are not a robust
capacity study, values below are observations only; p95 is not a release SLA.

| Workload | Validation median ms | Run median / p95 ms | Export median ms | Result bytes | Heap delta MB | Fingerprint |
|---|---:|---:|---:|---:|---:|---|
| 2 assets × 1,000 | 5.639 | 50.067 / 60.627 | 5.425 | 1,141,981 | 0.45 | `fnv1a32-3d874868` |
| 3 assets × 10,000 | 8.306 | 363.050 / 417.621 | 48.285 | 15,304,617 | 0.17 | `fnv1a32-c0b3034f` |
| 5 assets × 100,000 | 232.672 | 5,594.745 / 5,934.891 | 1,146.290 | 226,583,453 | 0.21 | `fnv1a32-71aa0dd7` |

All three scenarios completed and disposed with `statusAfterDispose: disposed`.
The large 5×100k result is intentionally retained as an auditable timeline and
equity result; its size is a known memory/serialization tradeoff rather than an
unsupported performance claim.

The focused protocol-handler benchmark reported 64.805 ms for 2×1,000 and
412.336 ms for 3×10,000, with disposal acknowledgements under 0.11 ms. That
benchmark measures the deterministic handler path, not browser Worker startup,
structured-clone, or thread scheduling latency.

## Acceptance matrix

| Criterion | Status | Evidence / remaining condition |
|---|---|---|
| Multiple instruments share one deterministic timeline | PASS | Engine tests and 2/3/5 asset benchmarks |
| Causal strategy inputs | PASS | Signal availability and future-price assertions |
| Next-eligible-bar fills | PASS | Gap execution test with exact timestamps |
| One shared cash account / no duplicate capital | PASS | Simultaneous contention test |
| Deterministic order priority | PASS | Stable IDs and input reordering equality |
| Costs, sizing, ledgers, and accounting | PASS | Unit assertions, exports, Studio metrics |
| Portfolio-wide risk limits | PASS | Exposure and active-position rejection; 21 UI rejections |
| Causal/stale/unknown valuation | PASS | Explicit valuation policy and stale test |
| Portfolio metrics and contributions | PASS | Numeric result assertions and Studio table |
| Worker parity and lifecycle | PASS locally | Handler parity, malformed/cancel/dispose/supersession tests; Studio fallback documents host Worker failure |
| Replay and marker causality | PASS | Existing replay suite plus new cutoff/latest assertion |
| Offline Studio workflow | PASS | React Chromium focused and full suite |
| Deterministic exports | PASS | JSON round trip, CSV tests, browser export action |
| Bounded workspace persistence | PASS | Round-trip test excludes candles/results; browser reload verifies capital |
| Legacy API/workspace compatibility | PARTIAL | No removals; additive review required and historical strict check remains open |
| Node, Chromium, package, distribution verification | PARTIAL | Required gates pass; portability gate is blocked by existing Binance text |
| Performance and resource cleanup | PASS locally | Chromium FPS/memory, portfolio benchmarks, stress cleanup |
| Firefox / WebKit / mobile browser engines | BLOCKED | Playwright-managed official engines were not available in this cloud environment |
| Physical-device compatibility | BLOCKED | No physical devices are attached |
| Formal accessibility and visual approval | NOT VERIFIED | Preliminary Chromium checks exist; formal approval remains open |
| Provider-specific production data | NOT TESTED | Phase 12 uses deterministic offline fixtures and provider-neutral contracts |
| All implementation work pushed | PASS | `origin/main` matched the pushed implementation tip before report commit |

## Remaining technical debt and open gates

1. Obtain owner approval for the additive API surface and decide whether the
   protected historical API baseline should be intentionally regenerated. The
   baseline file was not changed.
2. Resolve or explicitly re-scope the existing package portability check that
   scans Studio workspace declarations containing the optional Binance demo
   source. This Phase 12 work did not remove an existing public Studio option.
3. Run the official Playwright Firefox, WebKit, mobile Chrome/mobile Safari
   projects in a trusted environment with compatible managed browser binaries.
   Chromium emulation in this cloud run is not physical-device certification.
4. Complete formal accessibility, visual-regression review, and provider-backed
   datafeed validation separately.
5. Consider bounded/lazy result retention or paged exports for very large
   portfolio timelines; the current implementation favors deterministic audit
   output and records its measured memory/result size.
6. The Next.js development host could not serve the module Worker's relative
   handler artifact reliably, so the Studio has an explicit synchronous fallback.
   The library Worker protocol itself remains tested with parity and lifecycle
   harnesses; a bundler-specific Worker integration fix should be tracked before
   claiming universal Worker availability.

## Phase decision

Phase 12 is implemented and locally engineering-verified for the available
Node/Chromium/package environment. The milestone must remain **open for formal
acceptance** until the historical API decision, package portability result, and
unavailable browser/device/accessibility/visual gates are independently resolved
or explicitly approved as exceptions by the project owner. Phase 13 was not
started.
