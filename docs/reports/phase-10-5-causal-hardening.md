# OpenKline Phase 10.5 — Causal Hardening Verification

Date: 2026-10-30

Phase 10.5 started from `2b96a31ab31ec1251a89b7d790780f81a9dafa05` on
`main`. The verified implementation SHA before this report commit is
`6aa63d2202fff492fb8ce92b1cc0d898c8cf1a5d`. The report, roadmap, replay
documentation, and generated audit evidence are committed separately after
this file is checked. All Phase 10.5 commits use
`Akira Yuzai <yuzai.akira@gmail.com>` and are pushed to `origin/main`.

This report records engineering evidence only. It does not approve a public
release, change the API baseline, claim physical-device support, or close the
blocked browser gates.

## Scope and implementation result

Phase 10.5 hardens the as-of boundary for fixed-duration multi-timeframe
analysis and its Chart/replay consumers.

- `CausalTimeframeAggregator` now treats a source candle at `t` as eligible
  only when `t + sourceDurationMs <= asOfTime`. The default `time-closed`
  policy remains conservative and provider-neutral.
- Aggregated OHLCV, source timestamps, source counts, missing counts, coverage,
  status, and availability metadata are built from the eligible source subset.
- Buckets with no eligible source candle are omitted from an as-of result.
  The complete source store remains retained by the aggregator for deterministic
  forward and backward seeking, corrections, and replay movement.
- Indicator results and previous-period reference results carry the exact
  aggregation frontier. Source-time mapping returns unavailable values after
  that frontier and never maps a future derived value into an earlier source
  timestamp.
- Chart-managed higher-timeframe indicators and reference levels resolve a
  safe live frontier and clamp an explicit frontier to the replay-visible
  source opening time. Existing ChartModel scales, panes, renderers, viewport,
  and disposal paths remain the shared implementation.
- Replay regression coverage verifies forward completion, backward removal,
  deterministic re-entry, workspace restore, and exit restoration.
- The benchmark now measures as-of snapshots, backward/forward seeking,
  repeated replay movement, append/read, correction, indicator/mapping,
  previous levels, and disposal at 1,000, 10,000, and 100,000 source candles.

No new drawing or indicator feature, rendering architecture, public API
baseline adoption, licensing, release, npm, or Phase 11 work was started in
this increment.

## Reproduced defect and root cause

The pre-fix public aggregation path was reproduced with ten one-minute source
candles, a five-minute target, and `asOfTime = 120000` (two minutes after the
source sequence began). A deliberately extreme future correction made the leak
observable rather than relying only on status metadata.

Before the fix, the first forming target observation exposed source times
`[0, 60000, 120000, 180000, 240000]`, including future candles, and therefore
exposed the future correction's high `3004`, low `-1004`, close `2004`, and
volume `500010`. A second target bucket was also exposed although it had no
eligible historical source data.

The cause was that bucket construction aggregated the complete stored bucket
and calculated availability separately. The availability field therefore did
not protect OHLCV or source metadata from future values. The corrected
construction filters source times before every aggregate and metadata field,
then omits an empty eligible bucket. The regression suite asserts exact source
times, counts, values, status, coverage, availability, and future-correction
isolation.

## Causal contract

For source duration `S` and as-of frontier `A`, a source candle at `t` is
eligible exactly when:

```text
t + S <= A
```

This means a candle at its opening timestamp is still forming. A target bucket
may be represented while forming when it has at least one eligible source
candle, but its `availableAt` remains `null` until the target time boundary and
the selected finality policy allow it. `complete-only` still requires complete
coverage. `unknown` coverage does not invent an exchange session calendar.

The source store is not truncated when `asOfTime` moves backward. This is
important for replay and seek operations: an earlier result is a filtered view,
not destructive historical mutation. A later frontier can therefore recover
the same corrected source values deterministically.

## Verification matrix

All commands below were run locally in the managed Cloud environment on Node
`v24.19.0`, npm `11.9.0`, Linux x64, and Playwright `1.64.1` where applicable.

| Command | Result | Evidence |
| --- | --- | --- |
| `npm run typecheck` | PASS | TypeScript core and React checks |
| `npm test` | PASS — 241/241 | Node unit/integration suite, including causal regression matrix |
| `npm run api:inventory` | PASS | Current inventory: 222 runtime and 509 type exports |
| `npm run api:diagnostics` | PASS — additive review required | No removed exports or incompatible declaration findings |
| `npm run api:check` | OPEN / expected FAIL | Historical baseline still reports intentional `Chart` and `WorkspaceDocument` hash changes; baseline was not changed |
| `npm run studio:check` | PASS | Core remains framework-neutral; Studio remains private |
| `npm run package:check` | PASS | Local pack dry-run, 418 files |
| `npm run package:smoke` | PASS | Local packed ESM consumer installed and imported |
| `npm run distribution:check` | PASS | 418 files, 2,328,404 unpacked bytes, SHA-1 `a0a898c81a7d3845fbae9699ef8f70f3004a2fa1` |
| `npm --prefix examples/nextjs-app-router run build` | PASS | Next.js 16.4.3 production build |
| `npm run test:browser` | PASS — 28/28 | Available system Chromium |
| `npm run test:react:browser` | PASS — 33/33 | React/Next Studio Chromium workflows |
| `npm run stress:ci` | PASS | Zero orphan failures, zero Worker orphans, zero remaining canvases, no page errors |
| `npm run benchmark:multi-timeframe` | PASS | Deterministic 1k/10k/100k causal, seek, replay, correction, append, and disposal cases |
| `npm run benchmark:browser` | PASS | Fresh Canvas2D/frame/memory evidence below |
| `npm run test:browser:compat` | BLOCKED — exit 1 | 28 mobile-Chromium passes; 84 launch failures before assertions because managed Firefox/WebKit binaries are absent |

The strict API check is intentionally not converted into a pass. Its
historical baseline remains at
`3e7a889a94c40255bbcce210a672856cfc98b32b`; no baseline update was authorized.
The current inventory and distribution audit were regenerated as evidence, but
the baseline file was preserved.

## Compatibility browser evidence

The compatibility run discovered 112 tests, 28 for each project:

| Project | Result | Limitation |
| --- | --- | --- |
| Chromium | PASS — 28/28 | Available system Chromium evidence |
| Mobile Chrome emulation | PASS — 28/28 | Uses the available Chromium executable |
| Firefox | BLOCKED — 28/28 | Missing Playwright-managed `/home/agent/.cache/ms-playwright/firefox-1555/firefox/firefox` |
| WebKit | BLOCKED — 28/28 | Missing Playwright-managed `/home/agent/.cache/ms-playwright/webkit-2370/pw_run.sh` |
| Mobile Safari emulation | BLOCKED — 28/28 | Requires the missing Playwright-managed WebKit binary |

The 84 blocked cases failed at browser launch, not at application assertions.
No system Firefox or Safari substitute, Docker browser, test skip, or TLS
verification bypass was used. Physical-device compatibility, Firefox, WebKit,
mobile Safari behavior, and all-engine accessibility/visual approval are not
claimed.

## Multi-timeframe benchmark

Environment: Node `v24.19.0`, Linux x64, `INTEL(R) XEON(R) PLATINUM 8573C`.
Source timeframe was `1m`, target timeframe was `1h`. Values are milliseconds
as `median / p95`; the 1k and 10k cases used five repetitions and 100k used
three. `noLookahead` was `true` for every case.

| Source candles | Aggregate | As-of snapshot | Backward seek | Forward seek | Repeated replay movement | Append/read | Correction | Disposal | Output points |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 0.630800 / 1.360479 | 0.255967 / 0.342467 | 0.235922 / 0.295783 | 0.370611 / 0.636886 | 2.292927 / 2.912688 | 0.782241 / 0.794289 | 0.550019 / 1.566854 | 0.119031 / 0.236107 | 16 |
| 10,000 | 6.807254 / 7.679093 | 1.223378 / 1.317817 | 1.227375 / 1.238345 | 3.025772 / 3.118148 | 18.549007 / 18.896924 | 6.373358 / 6.379518 | 4.107256 / 4.805915 | 1.933986 / 1.947280 | 166 |
| 100,000 | 95.796361 / 95.796361 | 13.443660 / 13.443660 | 18.002714 / 18.002714 | 19.788850 / 19.788850 | 148.971391 / 148.971391 | 65.754433 / 65.754433 | 58.207368 / 58.207368 | 34.695129 / 34.695129 | 1,666 |

These are calculation timings, not Canvas2D FPS claims. The benchmark includes
future mutation isolation, backward/forward source retention, and disposal
checks. It does not imply a production latency guarantee for arbitrary data or
hardware.

## Canvas2D and resource evidence

The fresh Chromium browser benchmark reported:

| Candles | FPS | Frame interval median / p95 | Frame work median / p95 |
| ---: | ---: | ---: | ---: |
| 1,000 | 64.85 | 16.7 / 17.0 ms | 1.9 / 2.6 ms |
| 10,000 | 62.42 | 16.7 / 16.8 ms | 1.7 / 2.0 ms |
| 100,000 | 61.74 | 16.7 / 16.8 ms | 1.4 / 2.2 ms |

The benchmark ended with `remainingCanvasCount: 0`. Its browser-specific heap
samples were 2,827,452 bytes before the run, 625,897,703 bytes before
destruction, and 3,171,820 bytes after destruction. These values are evidence
for this run only, not cross-machine memory guarantees.

Stress evidence reported 4,000 Node events with median latency `0.1805 ms`,
p95 `13.6554 ms`, and maximum `76.547 ms`. Browser interaction rounds had
median/p95 `29.6 / 58.3 ms`; setDatafeed rounds had `37.8 / 73.8 ms`. The
browser stress report recorded zero orphan failures, zero Worker orphans, zero
remaining canvases, and no page errors.

## Acceptance matrix

| Criterion | Status | Basis or remaining gate |
| --- | --- | --- |
| Strict source-candle completion boundary | PASS | Exact eligibility regression tests and reproduced pre-fix leak |
| Filtered OHLCV and metadata | PASS | Extreme future-value, source-time, count, coverage, and availability assertions |
| Empty future buckets omitted while source history is retained | PASS | Backward/forward seek and correction tests/benchmark |
| Indicator and previous-period no-lookahead behavior | PASS | As-of result, mapping, correction, and source-frontier tests |
| Chart and replay causal integration | PASS in Chromium | Focused MTF browser test: replay forward/backward/exit and workspace restore |
| Append, correction, datafeed refresh, and disposal | PASS | Node suite, browser lifecycle tests, stress and benchmarks |
| Public API/package evidence | PARTIAL | Inventory/diagnostics/package checks pass; strict historical baseline approval remains open |
| Canvas2D performance and cleanup | PASS for available Chromium run | Fresh benchmark; not a universal browser/device claim |
| Firefox and WebKit | BLOCKED | Playwright-managed artifacts unavailable in this environment |
| Mobile Safari | BLOCKED | Depends on unavailable WebKit artifact |
| Physical-device/accessibility/visual approval | NOT TESTED | No physical devices or all-engine visual review available |

The Phase 10.5 implementation is verified for the available Node and Chromium
boundary, but the overall acceptance gate remains open for the blocked browser,
physical-device, visual/accessibility, and owner API-baseline decisions. No
Phase 11 work should begin until those gates are resolved or the project owner
records an explicit exception.

## Git and release status

Verified Phase 10.5 commits, all pushed to `origin/main`:

1. `0ebbbfcd8cee5aee01169c8b95ddd778fa46e0fb` —
   `fix(analytics): isolate multi-timeframe as-of snapshots`
2. `2eafc87e5b8cfc0b84e7e842bc1ce95d0653574f` —
   `test(analytics): reject future source data in causal snapshots`
3. `6aa63d2202fff492fb8ce92b1cc0d898c8cf1a5d` —
   `fix(chart): preserve causal multi-timeframe replay outputs`

The documentation/evidence commit will be recorded in this section after the
final verification and push. The final handoff must confirm
`git rev-parse HEAD == git rev-parse origin/main`, a clean working tree, the
requested Git identity, and no force-push, npm publication, release tag,
GitHub Actions workflow, or licensing change.
