# Phase 7.1 verification

Verification date: 2026-10-25 (UTC)

Phase 7.1 implementation is complete through the replay-engine, chart
integration, analysis, Studio, package, and local verification increments.
The formal milestone remains **open**. The complete local Chromium and mobile
Chromium evidence is positive, but the required Playwright-managed Firefox,
WebKit, and Mobile Safari executables are unavailable in this environment.
Inherited accessibility and physical-device gates are also still open. An
unavailable browser is not treated as a passing browser.

## Implemented capabilities

- A framework-independent `ReplayEngine` validates and defensively clones its
  historical source, exposes an inclusive cursor, supports irregular
  timestamp seeking, deterministic stepping, bounded-speed playback,
  injectable scheduling, completion/error states, and disposal.
- Chart replay uses the existing ChartModel, series stores, shared viewport,
  price scales, renderer, interaction, and lifecycle. It masks future bars for
  supported candle and professional series, line/area/volume series, panes,
  crosshair/tooltip values, autoscaling, drawings, plugin contexts, and
  workspace-visible state without mutating the protected source.
- Heikin–Ashi remains a display projection derived from the visible raw prefix;
  raw OHLCV remains the indicator and persistence source.
- Native indicators and KlineScript are recalculated from the visible prefix.
  Sequential native-indicator replay steps reuse the existing append-
  incremental calculation path; arbitrary seeks use the correctness-preserving
  full prefix path.
- Datafeeds are suspended during replay, stale callbacks are ignored, and
  exit restores the complete workspace and resubscribes the datafeed. Source
  and structural mutations are rejected while replay is active.
- The private Next.js Studio exposes Enter/Exit, starting point, Beginning,
  Latest, inclusive timeline seeking, previous/next step, play/pause, bounded
  speed selection, status/date feedback, keyboard shortcuts, and a
  mobile-sized control layout. Exit restores chart series, indicators,
  drawings, scale, and workspace state.
- Package, React, and Next.js consumer checks were run locally. No package was
  published, no tag/release was created, and no effective license metadata was
  changed.

## Public API verification

| API area | Status | Evidence |
| --- | --- | --- |
| Replay engine | Verified locally | 5 deterministic Node tests cover cloning, inclusive cursors, irregular seeks, playback scheduling, errors, empty sources, and disposal. |
| Chart replay | Verified locally | Chart integration tests cover future-bar masking, restoration, datafeed suspension, stale callbacks, visible interactions, and cleanup. |
| Series and scales | Verified locally | The shared chart path is exercised with candle, OHLC, hollow, Heikin–Ashi, baseline, line, area, and volume presentations; no replay-specific renderer or viewport is introduced. |
| Indicators and KlineScript | Verified locally | Native indicator prefix equality, sequential-step equivalence to a full reseek, KlineScript replay output bounds, and restoration are covered. |
| Drawings and plugins | Verified locally | Future-anchored drawings are hidden from replay interaction/rendering; visible anchors and plugin contexts use the replay-visible chart state. |
| Studio React API | Verified locally | React browser tests use the public chart handle and `ReplayApi`, exercise the full control sequence, and verify lifecycle cleanup and workspace restoration. |
| Package and Next.js consumers | Verified locally | Packed ESM and TypeScript/React consumers, package artifact audit, and Next.js production build pass. |

## Local test results

| Command or check | Result |
| --- | --- |
| `npm run typecheck && npm test` | Passed: 66 Node tests. |
| `npm run test:browser` | Passed: 6 Chromium browser tests. |
| `npm run test:react:browser` | Passed: 4 Chromium React/Studio tests, including replay controls, touch-sized interaction, restoration, and lifecycle cleanup. |
| `npx playwright test tests/browser/replay.spec.ts --project=mobile-chrome` | Passed: 2 replay tests. |
| `npm run test:browser:compat` | 6 Mobile Chrome tests passed; 18 Firefox/WebKit/Mobile Safari tests blocked before execution because managed binaries are absent. |
| `npm run package:check` | Passed: `openkline@0.1.0`, 162 files in the dry-run tarball. |
| `npm run package:smoke` | Passed: packed ESM consumer. |
| `npm run preview:verify` | Passed: datafeed, indicator, drawing, plugin, and KlineScript preview checks. |
| Next.js production build | Passed under `release:check`: Next.js 16.4.3 optimized webpack build, including `/lifecycle-verification`. |
| `NPM_CONFIG_CACHE=/tmp/openkline-npm-cache npm run release:check` | All executable checks passed; the script reported the known compatibility gate as blocked rather than green. |
| Browser diagnostic | Passed: 12 Chromium/Pixel 7 emulation tests with zero unexpected results. |

The release check's first invocation was also run without the temporary npm
cache and stopped at publish dry-run because `/home/agent/.npm` was not
writable. It was rerun with the workspace-approved temporary cache; the
publish step was a dry-run only and did not contact npm for publication.

## Browser compatibility status

The project uses Playwright 1.64.1. The local Chromium executable is
`/usr/bin/chromium`, reporting Chromium 154.0.8037.57 on Debian GNU/Linux 13.
The Playwright compatibility projects require the following managed artifacts:

- Firefox 157.0, Playwright build `firefox-1555`, expected at
  `/home/agent/.cache/ms-playwright/firefox-1555/firefox/firefox`.
- WebKit 27.2, Playwright build `webkit-2370`, expected at
  `/home/agent/.cache/ms-playwright/webkit-2370/pw_run.sh`.
- Mobile Safari uses the same managed WebKit binary with the iPhone 13 device
  profile.

`npx playwright install --dry-run firefox webkit` confirmed the official
  Playwright artifact URLs and no matching browser cache is present. The test
  runner then failed at browser launch with the missing executable errors
  above. Earlier supported download attempts recorded HTTP 403 responses; no
  TLS verification was disabled, no arbitrary binary was used, and system
  Firefox/Safari was not substituted. The project has not retried the known
  blocked CDN indefinitely.

| Target | Status | Evidence |
| --- | --- | --- |
| Chromium 154.0.8037.57 | Verified locally | 6 browser tests, the 12-test diagnostic, React Studio tests, and Canvas2D measurements. |
| Mobile Chrome / Pixel 7 emulation | Verified locally | 6 compatibility tests and 2 direct replay tests pass using Playwright's Pixel 7 profile with local Chromium. |
| Firefox / Playwright 157 | Blocked by environment | Managed `firefox-1555` executable is absent; no system Firefox was used. |
| WebKit / Playwright 27.2 | Blocked by environment | Managed `webkit-2370` executable is absent. |
| Mobile Safari / iPhone 13 profile | Blocked by environment | Requires the unavailable managed WebKit executable. |
| Physical mobile devices | Not tested | Device emulation is not hardware validation. |
| Assistive technology and visual regression gates | Not tested / inherited open | These are not satisfied by automated browser emulation. |

## Performance and memory measurements

### Canvas2D regression check

The latest `release:check` Canvas2D run used headless Chromium 154 at a
1,200 × 520 viewport with `--disable-gpu` and `--js-flags=--expose-gc`. It
includes Canvas2D rendering, indicators, drawings, navigation, realtime
appends, corrections, crosshair dispatch, and frame sampling. Values are one
local observation, not a device-independent guarantee.

| Candles | Load ms | Navigation p50/p95 ms | 100 updates ms | Update ms | 5 corrections ms | Frame work p50/p95 ms | rAF FPS |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 18.6 | 2.1 / 4.2 | 168.5 | 1.685 | 42.1 | 1.6 / 2.1 | 64.75 |
| 10,000 | 101.2 | 2.2 / 2.8 | 151.5 | 1.515 | 365.5 | 1.4 / 1.8 | 61.77 |
| 100,000 | 2,185.4 | 1.9 / 4.8 | 1,091.3 | 10.913 | 6,070.6 | 4.4 / 9.7 | 60.69 |

The 100,000-candle run observed approximately 535.9 MB heap before destroy,
2.06 MB after destroy and a GC opportunity, and zero remaining canvases. The
existing O(1) append path remains distinct from historical correction and
arbitrary recalculation paths; no universal FPS or latency claim is made.

### Replay benchmark

`npm run benchmark:replay` uses a real Canvas2D chart and measures ten
sequential steps, four arbitrary seeks, a short play/pause cycle, exit
restoration, and destruction for one-indicator, multiple-indicator, and
KlineScript scenarios at 1,000, 10,000, and 100,000 bars. Step and seek values
are median/p95 milliseconds. Every scenario restored the original data length
and reported zero canvases after destruction.

| Bars | Scenario | Step p50/p95 ms | Seek p50/p95 ms | Exit ms | Play/pause ms | Heap MB |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 1,000 | One indicator | 2.2 / 2.9 | 2.7 / 3.4 | 12.8 | 38.3 | 7.3 |
| 1,000 | Multiple indicators | 2.4 / 3.8 | 3.7 / 6.0 | 11.7 | 36.5 | 10.1 |
| 1,000 | KlineScript | 1.3 / 2.4 | 1.4 / 2.5 | 5.5 | 35.3 | 5.2 |
| 10,000 | One indicator | 1.2 / 1.5 | 7.3 / 10.3 | 31.4 | 35.7 | 40.2 |
| 10,000 | Multiple indicators | 1.3 / 1.6 | 23.8 / 36.6 | 65.5 | 36.8 | 56.2 |
| 10,000 | KlineScript | 2.2 / 8.4 | 4.4 / 9.3 | 25.5 | 37.9 | 37.7 |
| 100,000 | One indicator | 4.1 / 9.7 | 67.1 / 138.8 | 507.4 | 40.4 | 156.5 |
| 100,000 | Multiple indicators | 2.7 / 8.4 | 371.8 / 794.8 | 1,185.2 | 43.0 | 425.5 |
| 100,000 | KlineScript | 23.0 / 27.3 | 101.7 / 156.6 | 405.8 | 39.3 | 311.2 |

Sequential native-indicator steps are materially cheaper than arbitrary seeks
because they reuse append-incremental calculations. KlineScript currently
recomputes its visible prefix on replay steps and seeks; this is measured
technical debt, not an unsupported constant-time claim. Large corrections
remain correctness-first full recalculation paths.

## Acceptance matrix

| Phase 7.1 acceptance criterion | Status | Basis |
| --- | --- | --- |
| Validated, protected replay source and inclusive historical cursor | Verified locally | ReplayEngine unit/integration tests and chart cursor assertions. |
| Deterministic play, pause, step, seek, speed, completion, error, and disposal | Verified locally | Scheduler-injected Node tests and Studio browser controls. |
| All supported chart series, shared viewport, scales, panes, crosshair, and tooltip isolation | Verified locally | Shared ChartModel/Canvas path, Node model tests, Chromium replay tests, and Studio workflow. |
| Drawings, plugins, datafeeds, stale callbacks, and workspace restoration | Verified locally | Browser replay/datafeed tests and React Studio restoration assertions. |
| Native indicators and KlineScript use only the visible prefix | Verified locally | Node tests, Chromium KlineScript replay, and sequential-vs-reseek equality assertion. |
| 1k/10k/100k replay measurements and cleanup | Verified locally | `benchmark:replay` table above; every scenario reports restored length and zero canvases. |
| Studio full control set and mobile-sized workflow | Verified locally | React browser test covers enter, start, timeline, beginning/latest, step, play/pause, speed, exit, keyboard, touch-sized viewport, and restore. |
| Chromium and Mobile Chrome emulation | Verified locally | 6 Chromium and 6 Mobile Chrome compatibility results pass. |
| Packed package and independent Vanilla/React consumers | Verified locally | `package:check`, `package:smoke`, artifact audit, and independent consumer smoke pass. |
| Next.js production integration | Verified locally | Next.js 16.4.3 optimized production build passes. |
| Firefox | Blocked by environment | Required official Playwright binary unavailable. |
| WebKit and Mobile Safari | Blocked by environment | Required official Playwright binary unavailable. |
| Physical mobile and accessibility acceptance | Not tested / inherited open | Requires owner-approved hardware and accessibility verification. |
| Formal Phase 7.1 closure | Open | Mandatory browser and inherited gates are not satisfied; no exception was authorized. |

## Remaining technical debt and handover

- Obtain the exact Playwright-managed Firefox and WebKit artifacts through an
  approved supported source or trusted offline transfer, then rerun the
  compatibility matrix without changing the test configuration.
- Complete inherited accessibility, visual-regression, and physical-device
  checks. Pixel 7 emulation is useful responsive evidence but does not close
  these gates.
- Consider an incremental KlineScript replay calculation contract after a
  measured workload and semantic review; do not call the current path O(1).
- Recheck large-history replay and correction budgets on agreed reference
  hardware before setting a product performance target.

The implementation is ready for review and handover, but Phase 7.1 must not be
marked complete or used to authorize Phase 8/another milestone until the owner
closes the blocked acceptance criteria or explicitly approves a documented
exception.

## Git and publication verification

The replay implementation increments were committed with author and committer
`Akira Yuzai <yuzai.akira@gmail.com>` and pushed immediately to `origin/work`:

- `26a6bca95a8fc11504685343ea14e6ce770cd2c2` — replay engine foundation
- `43f792085444e6867050233850b8c0312c892723` — chart replay state isolation
- `086bd0fb99add7b7e37ea8d0f81c71ed938933ad` — Studio replay controls
- `cfe2a1017b3f64c49a596b5c9e1bff2b5ee7963d` — analysis, benchmarks, and
  Studio verification

The final documentation commit containing this report will be pushed and
verified with `HEAD` equal to `origin/work`. No GitHub Actions, npm
publication, release tag, GitHub release, force-push, history rewrite, or
license-state change was performed.
