# OpenKline Phase 13.5 — Causality, Performance, and Financial Regression Hardening

Verification date: 2026-10-30 UTC  
Repository: `yuzaiakira/OpenKline`  
Branch: `main`  
Verification environment: Codex cloud Linux, Node `v24.19.0`, npm `11.9.0`, system Chromium `HeadlessChrome/154.0.0.0` through Playwright `1.64.1`.

## Outcome

The Phase 13.5 implementation work is complete and locally verified for the
available Node and Chromium environments. The milestone remains open for the
protected public-API baseline approval and for browser engines unavailable in
this cloud environment. No browser, device, or release claim is made beyond
the evidence listed here.

Starting implementation SHA: `91d6020485523140cf6c8acd2acafe1ec4d1529f`  
Final verified implementation SHA before this report: `d8c3d48d875dc94eb97e76b32be55b3851b5ceee`

All Phase 13.5 implementation commits were pushed to `origin/main` with
author and committer `Akira Yuzai <yuzai.akira@gmail.com>`. The protected
`docs/audits/public-api-baseline.json` was not modified.

Phase 13.5 commit/push ledger:

- `5c1ea5b5945d833ac8019aed1d33ad3a96a66307` — remove realtime full-history clone
- `f0444fb097803be53e8e883861e462da91f2b47a` — enforce causal source isolation
- `15dd953be639cda19c58780cf8fcab85b6f0b319` — preserve adjusted indicator domains
- `8c36b5c88b3bdf1ec8e614912e8064e75f625193` — optimize and benchmark realtime paths
- `1f7379687dddc8e77832c0fb1f2e7036be62c985` — document incremental updates
- `1f72615ec774ebe17b4f127afe17a6877cf1da1b` — keep replay getters causal
- `9e21303f675dd097a9976ea507226fee2d6d9fc1` — verify action revisions
- `d8c3d48d875dc94eb97e76b32be55b3851b5ceee` — refresh public API inventory

Each hash was verified against `origin/main` immediately after its push. The
report and distribution evidence are committed separately after the listed
implementation verification.

## Root causes and focused fixes

### Realtime update cloning

`Chart.updateRawCandle()` previously caused a full `model.allCandles` snapshot
on each realtime update. The raw domain now has an in-place append path for a
newest timestamp and a binary-search correction path for historical timestamps.
The input is validated once and the canonical raw store is not cloned for the
normal append case. This preserves correction ordering and keeps the public
`setData`/`update` semantics unchanged.

### Causal corporate-action data isolation

`adjustCorporateActionData()` now has an explicit source-availability contract:

- `opening-time-provisional`: a candle is available when
  `candle.time <= asOfTime`.
- `fixed-duration`: a candle is available only when
  `candle.time + sourceDurationMs <= asOfTime`.

The complete ordered input is still validated, but future candles are excluded
from causal output. In causal mode, action knowledge metadata is bounded by the
same knowledge frontier; future action IDs and future payment/declaration
metadata are not exposed. Retrospective mode retains its previous behavior.
`sourceDurationMs` is validated as a positive safe integer and is persisted
through chart, comparison, and workspace contracts.

### Adjusted realtime and analysis domains

For split-adjusted charts, a single-candle update now adjusts and replaces only
the affected displayed candle while retaining the raw source. Total-return
updates still use a full rebuild when the prefix-dependent dividend index makes
that necessary. Primary `SeriesApi.update()` rebuilds indicators and related
analysis from the displayed adjusted domain, preventing stale raw-domain SMA
and other derived values.

Replay-aware corporate-action getters now use the replay raw source and causal
replay cutoff. Leaving replay restores retrospective behavior. Comparison and
workspace paths use the same source-availability semantics.

## Financial and lifecycle coverage

The implementation and regression suite covers:

- raw, split-adjusted, and total-return domains;
- future OHLCV exclusion for all causal modes;
- fixed-duration source availability;
- future action metadata exclusion;
- action factor correction and revised historical factors;
- adjusted primary-series indicators;
- replay forward/backward seek and retrospective restoration;
- comparison and workspace source-duration persistence;
- portfolio corporate-action accounting and worker protocol parity;
- datafeed, indicator, worker, drawing, and chart destruction cleanup.

The full Node suite completed with **287 passing tests, 0 failures**.

## Performance measurements

Measurements are reproducible observations from this cloud environment. They
are not universal device guarantees.

### Canvas2D browser benchmark

Command: `npm run benchmark:browser`

| Dataset | FPS | Frame interval median/p95 | Frame work median/p95 | Update frame | Post-destroy canvases |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 62.42 | 16.7 / 16.8 ms | 1.8 / 3.5 ms | 1.997 ms | 0 |
| 10,000 | 63.61 | 16.6 / 17.1 ms | 1.2 / 1.7 ms | 1.180 ms | 0 |
| 100,000 | 62.14 | 16.7 / 16.8 ms | 1.7 / 2.1 ms | 1.175 ms | 0 |

The 100k run observed `608,277,413` bytes before destruction and
`3,636,070` bytes after destruction. The historical pre-fix cloud sample was
approximately 24.66 FPS with 26.1 ms median frame work; it is retained only as
a directional comparison because the runs are not a controlled laboratory
experiment.

### Corporate-action Canvas2D update path

Command: `npm run benchmark:corporate-actions:chart`

| Dataset / scenario | Append median/p95 | Correction median/p95 |
| --- | ---: | ---: |
| 100k plain | 0.9 / 1.2 ms | 1.1 / 5.2 ms |
| 100k raw with actions | 1.0 / 2.3 ms | 1.2 / 1.3 ms |
| 100k split-adjusted | 32.7 / 134.5 ms | 35.0 / 105.2 ms |

The earlier full-rebuild split-adjusted sample was approximately
172.6 ms median append and 178.7 ms median correction at 100k. The optimized
path is materially lower, while its p95 remains workload- and environment-
sensitive. The benchmark ended with zero canvases and reported
`26,192,384` bytes of heap in the page.

### Deterministic Node benchmarks

Selected 100k observations:

- Corporate actions: split adjustment `39.920 ms` median / `50.425 ms` p95;
  causal as-of `47.067 ms` median / `67.414 ms` p95; correction `0.011 ms`
  median; portfolio lifecycle `1,182.897 ms` median / `1,201.092 ms` p95.
- Multi-timeframe: aggregation `98.808 ms`; as-of snapshot `17.512 ms`;
  repeated replay movement `146.319 ms`.
- Portfolio backtest, five instruments: run `5,715.926 ms` median /
  `5,897.229 ms` p95; observed post-run heap delta `0.16 MB`.
- Portfolio worker protocol, 10k: handler `413.593 ms`; disposal ACK
  `0.094 ms`.
- Portfolio result, 100k: serialization `315.762 ms`, parse and validation
  `470.120 ms`, chunk processing `325.623 ms`; process heap delta
  `119.92 MB`.
- Calendar, 100k: session aggregation `1,095.642 ms`, append `73.349 ms`,
  disposal `977.547 ms`.

These Node measurements include no Canvas2D claim. Heap values are process
observations, not leak limits.

## Stress and cleanup evidence

`npm run stress:ci` passed both deterministic Node and Chromium stress paths.

- Node: 4,000 realtime events, median latency `0.1694 ms`, p95 `13.6049 ms`,
  max `67.91 ms`, no timeout; all 40 advanced KlineScript/replay/backtest/
  paper-trading rounds passed.
- Browser: 16 interaction rounds and 24 datafeed rounds; orphan failures `0`,
  worker orphans `0`, page errors `0`, remaining canvases `0`.
- Repeated chart destruction and datafeed switching left no orphan canvas or
  Worker in the stress evidence.

## Verification commands

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm test` | PASS — 287/287 |
| `npm run api:inventory` | PASS; inventory refreshed without changing the protected baseline |
| `npm run api:diagnostics` | PASS_ADDITIVE_REVIEW_REQUIRED; no removals or structural breaking changes |
| `npm run api:check` | OPEN/expected FAIL; historical baseline requires owner approval for additive adoption |
| `npm run studio:check` | PASS |
| `npm run package:check` | PASS |
| `npm run package:smoke` | PASS |
| `npm run package:audit` | PASS |
| `npm run package:portability` | PASS |
| `npm run distribution:check` | PASS; no package problems |
| `npm run test:browser` | PASS — 33/33 Chromium |
| `npm run test:react:browser` | PASS — 36/36 Chromium |
| `npm run test:react:production` | PASS — production build and 1/1 Chromium test |
| `npm --prefix examples/nextjs-app-router run build` | PASS |
| `npm run benchmark:corporate-actions` | PASS |
| `npm run benchmark:corporate-actions:chart` | PASS |
| `npm run benchmark:portfolio` | PASS |
| `npm run benchmark:portfolio-worker` | PASS |
| `npm run benchmark:portfolio-result` | PASS |
| `npm run benchmark:multi-timeframe` | PASS |
| `npm run benchmark:calendar` | PASS |
| `npm run benchmark:browser` | PASS — Chromium only |
| `npm run stress:ci` | PASS |

## API and package gate status

The additive public API inventory was refreshed. Diagnostics found no removed
declarations or incompatible member changes. The strict compatibility check
still reports the pre-existing protected-baseline differences in `Chart`,
`WorkspaceDocument`, and `WorkspaceRestoreOptions`, plus additive exports. The
baseline is intentionally unchanged; Phase 13.5 is not authorized to approve
that API adoption decision.

Package smoke, audit, portability, and distribution checks passed. No npm
publication, release tag, or public release was performed. The package audit
continues to report the separately governed license state as
`pending-owner-approval`.

## Browser and device limitations

Only the cloud system Chromium executable was available for the local browser
runs. Firefox, WebKit, managed mobile emulation, and physical-device testing
were not reclassified as passed. Docker/GPU/physical-device capabilities were
not assumed. These remain open compatibility gates and require a trusted
browser environment before any cross-browser or release claim.

The React browser suite emitted an existing unresolved illustrative corporate-
action source warning while its assertions passed. It is recorded as a
non-failing warning and was not changed by this hardening increment.

## Acceptance matrix

| Criterion | Status | Evidence |
| --- | --- | --- |
| Remove full-history raw realtime clone | VERIFIED | Focused chart implementation, typecheck, browser and Canvas2D benchmarks |
| Causal OHLCV source isolation | VERIFIED | Node and browser causal/replay tests; fixed-duration coverage |
| Causal action metadata bounds | VERIFIED | Corporate-action unit tests and public-result provenance checks |
| Raw/split/total-return financial correctness | VERIFIED | `npm test`, browser chart/replay coverage, benchmark result counts |
| Adjusted indicator and analysis propagation | VERIFIED | Primary-series adjusted indicator browser regression |
| Replay, comparison, workspace consistency | VERIFIED | Replay, comparison, workspace tests and Studio suite |
| Portfolio and Worker parity | VERIFIED | Node suite, worker benchmark, browser stress and Studio flow |
| Canvas2D realtime performance | VERIFIED for cloud Chromium | Browser benchmark; no universal performance claim |
| Package/distribution integrity | VERIFIED | Package and distribution checks |
| Public API historical baseline approval | OPEN | `api:check` intentionally fails against protected baseline |
| Firefox/WebKit/mobile/physical-device verification | BLOCKED / NOT TESTED | Required managed browsers/devices unavailable in cloud |

## Phase decision

Phase 13.5 engineering hardening is ready for owner review, but the milestone
must remain open until the additive API baseline decision and the unavailable
browser/device gates are resolved or explicitly accepted by the project owner.
No Phase 14 work, release authorization, npm publication, or cross-browser
compatibility claim is implied by this report.
