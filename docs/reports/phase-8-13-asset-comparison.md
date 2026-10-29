# Phase 8.13 — Multi-Asset Comparison Verification

Date: 2026-10-29

## Scope and Git state

Phase 8.13 was implemented from the consolidated `main` baseline
`78941aa066d96bea94791b51f7b1fe3c778471f7`. The implementation was delivered
directly to `main`, as required by the Phase 8.13 specification; no obsolete
development branch was restored and no pull request, release, npm publication,
license change, or GitHub Actions workflow was created.

Implementation commits:

- `0524e94` — framework-independent normalized asset comparison engine.
- `8d49bc7` — Studio integration, workspace persistence, browser coverage,
  benchmark, API/architecture documentation, and roadmap update.
- `2353820` — strict-TypeScript browser fixture contract fix.

The final implementation snapshot before this report-only documentation change
is `2353820cd3f12a392f5617f336914db04096d621`. Git author and committer for all
new commits are `Akira Yuzai <yuzai.akira@gmail.com>`. The snapshot was pushed
to `origin/main` and local `main` matched the remote after verification.

## Implemented capabilities

### Public comparison engine

- Added and exported `ComparisonEngine` and its typed contracts from the root
  package.
- Supports percentage and indexed/base-100 normalization.
- Selects the latest observation at or before an explicit UTC baseline; future
  observations are never used.
- Applies an explicit maximum baseline age and reports ineligible assets
  without inventing values.
- Validates positive finite prices, integer timestamps, strict ordering, and
  duplicate rejection.
- Preserves defensive raw snapshots while exposing separate normalized output.
- Handles equal-time corrections and out-of-order inserts deterministically.
- Supports asset addition/removal, full data replacement, change listeners,
  status inspection, and idempotent disposal.

### Chart and Studio integration

- Renders normalized values as separate line series while preserving ordinary
  candlestick data, raw price scales, indicators, drawings, and viewport state.
- Supports BTC-USD, ETH-USD, and AAPL deterministic comparison fixtures in the
  private Next.js Studio reference consumer.
- Supports dynamic asset selection, baseline selection, percentage/indexed mode,
  legend values, and the existing chart crosshair.
- Captures and restores ordinary series visibility/style and price-scale
  configuration when entering and leaving comparison mode.
- Applies replay cutoffs without exposing future comparison observations.
- Persists optional comparison state in Studio workspaces while preserving
  legacy documents that omit the field.
- Keeps comparison controls responsive and accessible within the existing
  Studio layout and theme.

## Verification results

Environment: Node `v24.19.0`, Playwright `1.64.1`, local headless Chromium
`154.0.0.0` through `/usr/bin/chromium`. Measurements below are local cloud
observations and are not universal performance guarantees or substitutes for
trusted cross-browser/device testing.

| Check | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm test` | PASS — 198/198 Node tests |
| `npm run api:check` | PASS — no removals/signature changes; comparison and Studio exports additive |
| `npm run package:smoke` | PASS — local tarball installed and imported |
| `npm run distribution:check` | PASS — 402 files, 352,563 bytes, SHA-1 `689efaabd9c3b065df3c20dd8ec452aadf574585` |
| `npm run studio:check` | PASS — core has no React/Next runtime dependency |
| `npm run test:browser` | PASS — 25/25 Chromium tests |
| `npm run test:react:browser` | PASS — 29/29 React/Studio Chromium tests |
| `npm run benchmark:comparison` | PASS — deterministic 10k/100k three-asset benchmark |
| `npm run benchmark:browser` | PASS — 1k/10k/100k Canvas2D benchmark; zero remaining canvases |
| `npm run benchmark:multi-chart` | PASS — single/dual chart navigation and cleanup benchmark |
| `npm run profile:multi-chart` | PASS — component timing profile and cleanup evidence |

The new focused tests cover normalization formulas, indexed mode, baseline
freshness, missing/future data, corrections, raw-data preservation, disposal,
public chart rendering, crosshair alignment, Studio presentation restoration,
and workspace persistence.

## Comparison benchmark

The deterministic Node benchmark used three assets and a baseline at the
midpoint. It measured insertion, normalization, repeated latest-bar updates,
and disposal:

| Observations per asset | Normalized points | Add (ms) | Normalize (ms) | Update median (ms) | Update p95 (ms) |
|---:|---:|---:|---:|---:|---:|
| 10,000 | 15,000 | 8.315 | 6.468 | 0.003 | 0.056 |
| 100,000 | 150,000 | 29.173 | 30.798 | 0.002 | 0.031 |

All benchmark rows disposed the engine successfully. These figures measure the
comparison engine only, not a complete Canvas2D frame.

## Existing chart performance and cleanup

The post-change browser benchmark reported the following local observations:

| Dataset | FPS | Frame interval median/p95 (ms) | Update frame (ms) |
|---:|---:|---:|---:|
| 1,000 | 64.32 | 16.7 / 16.9 | 2.86 |
| 10,000 | 62.23 | 16.6 / 16.9 | 1.10 |
| 100,000 | 46.48 | 16.7 / 19.4 | 1.281 |

The run reported 164,914,949 bytes before destruction, 3,000,234 bytes after
destruction, and zero remaining owned canvases. The dual-chart benchmark
reported zero owned canvases after both 10k and 100k cleanup runs.

For dual 10k charts, visual median/p95 latency was 18.2/29.4 ms for visible
range, 17.5/20.2 ms for pan, 18.0/19.7 ms for zoom, 17.8/24.8 ms for rapid
alternation, and 18.1/20.8 ms during realtime navigation. For dual 100k
charts, the corresponding measurements were 158.0/220.8, 157.1/170.3,
159.0/225.5, 160.5/181.7, and 163.8/266.0 ms. Crosshair median/p95 was
3.6/4.3 ms for dual 100k. The profiler attributes the large dual-100k cost
primarily to Canvas2D series/pane drawing, not comparison-engine work; no new
renderer or unsupported optimization claim is made.

## Browser matrix and environment gates

The local Chromium project and React/Studio Chromium project passed. The
explicit compatibility command ran 100 tests across four projects:

| Project | Result | Classification |
|---|---:|---|
| `firefox` | 0/25 launched; 25 launch failures | Blocked — missing `/home/agent/.cache/ms-playwright/firefox-1555/firefox/firefox` |
| `webkit` | 0/25 launched; 25 launch failures | Blocked — missing Playwright WebKit executable |
| `mobile-chrome` | 25/25 passed | Verified with system Chromium mobile emulation, not a physical device |
| `mobile-safari` | 0/25 launched; 25 launch failures | Blocked — missing `/home/agent/.cache/ms-playwright/webkit-2370/pw_run.sh` |

The failures are browser-launch environment failures, not failed behavior
assertions. No unsupported system Firefox, WebKit, Safari, physical device, or
TLS-bypass workaround was used. Official managed Firefox/WebKit and
physical-device compatibility therefore remain open.

## Acceptance matrix

| Criterion | Status | Evidence |
|---|---|---|
| Framework-independent comparison API | Implemented / verified | `src/comparison.ts`, 5 Node tests, public API check |
| Percentage and indexed modes | Implemented / verified | Node and Chromium comparison tests |
| At-or-before baseline and freshness | Implemented / verified | Node comparison tests and public API docs |
| Missing intervals/calendars and no future lookahead | Implemented / verified locally | Engine validation/normalization tests |
| Realtime correction and out-of-order handling | Implemented / verified | Node correction/update tests |
| Raw data preservation | Implemented / verified | Engine and browser tests |
| Chart rendering and crosshair values | Implemented / verified in Chromium | `tests/browser/comparison.spec.ts` |
| Dynamic asset add/remove | Implemented / verified locally | Engine tests and Studio controls |
| Replay safety and lifecycle cleanup | Implemented / verified locally | Chart replay model plus Studio/cleanup tests |
| Studio responsive/accessibility/theme integration | Implemented / verified in Chromium | React/Studio suite 29/29 |
| Workspace persistence/backward compatibility | Implemented / verified | Studio workspace Node test and React browser test |
| Firefox | Not verified | Playwright-managed executable unavailable |
| WebKit | Not verified | Playwright-managed executable unavailable |
| Mobile Safari | Not verified | WebKit executable unavailable; no physical-device claim |
| Universal performance claim | Not claimed | Measurements are environment-specific |

## Remaining technical debt and readiness

- The public engine currently accepts normalized price observations; vendor
  symbol mapping and multi-feed aggregation remain host/datafeed concerns.
- The private Studio reference implementation uses deterministic fixtures and
  is not a production market-data provider.
- Dual-100k Canvas2D full-frame rendering remains the known performance limit;
  comparison mode does not change that architecture.
- Official Firefox, WebKit, mobile Safari, physical-device, and broader visual
  approval gates require a trusted environment with the exact Playwright
  browser artifacts. They remain open and must not be inferred from Chromium.
- Legal approval, package publication, release authorization, and licensing
  adoption remain outside this engineering increment.

Phase 8.13 implementation is ready for review on the verified local baseline,
but the milestone remains open for the explicitly unverified browser and device
gates. No Phase 9 or unrelated feature work was started.
