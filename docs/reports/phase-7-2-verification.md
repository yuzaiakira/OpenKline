# OpenKline Phase 7.2 verification

Verification date: 2026-10-25 UTC  
Repository: `yuzaiakira/OpenKline`  
Branch: `work`  
Playwright: 1.64.1  
Available browser: Chromium 154.0.8037.57 at `/usr/bin/chromium`

This report records the Phase 7.2 performance-regression fix, deterministic
Alert Engine, Chart/Replay integration, and Studio workflow. It does not close
the inherited Phase 7.1 managed-Firefox, managed-WebKit, Mobile Safari,
accessibility, or physical-device gates.

## Implemented capabilities

- Fixed the verified Phase 7.1 inactive-replay append regression by replacing a
  full defensive candle snapshot in latest-time lookup with an ordered,
  replay-cutoff-aware store lookup. Correction and future-data isolation
  semantics remain unchanged.
- Added a framework-neutral `AlertEngine` with serializable definitions,
  validation, lifecycle APIs, bounded event history, diagnostics, status, and
  public subscriptions.
- Added strict price thresholds/crossings, numeric indicator thresholds and
  crossings, indicator-output pair crossings, numeric KlineScript output
  conditions, host-supplied boolean script conditions, and horizontal drawing
  crossings.
- Added explicit `seed`, `append`, and `correction` semantics, deterministic
  event IDs, duplicate/out-of-order handling, frequency modes, cooldowns, and
  caller-supplied finality for confirmed-bar rules.
- Integrated alert evaluation with Chart candles, indicator results,
  KlineScript numeric outputs, visible drawings, datafeed symbol/timeframe
  metadata, workspace definitions, and chart lifecycle cleanup.
- Integrated isolated simulated replay state. Sequential replay steps evaluate
  one new bar; seeks rebuild the visible prefix. Simulated events are marked
  and cleared on replay exit without contaminating live state.
- Added public Chart alert APIs and `alertTriggered`/`alertError` events.
- Added a functional local Studio Alerts panel for price-crossing definitions,
  pause/enable/remove, recent live/simulated history, and workspace save/load.
- Added the reproducible Node-only `benchmark:alerts` command.

## Performance and memory evidence

The detailed investigation is in
`docs/reports/phase-7-2-performance-baseline.md`. The same local Canvas2D
environment measured the corrected append workload as follows:

| Candles | Append/update average | Frame-work p95 | Observed rAF FPS |
| ---: | ---: | ---: | ---: |
| 1,000 | 2.108 ms | 3.1 ms | 65.23 |
| 10,000 | 0.997 ms | 2.1 ms | 61.60 |
| 100,000 | 1.033 ms | 2.2 ms | 62.07 |

The 100,000-candle run observed 647.8 MB before destruction, 2.07 MB after
the GC opportunity, and zero remaining canvases. These are engine- and
workload-specific observations, not release limits or universal FPS claims.

Replay verification retained restored data lengths and zero canvases after
destruction. The latest recorded 100,000-candle observations were:

| Scenario | Step p50/p95 | Seek p50/p95 | Exit | Heap before destroy |
| --- | ---: | ---: | ---: | ---: |
| One indicator | 2.7 / 10.0 ms | 62.4 / 115.3 ms | 484.1 ms | 163.8 MB |
| Multiple indicators | 3.0 / 8.3 ms | 513.7 / 934.6 ms | 2,047.6 ms | 303.7 MB |
| KlineScript | 24.1 / 29.9 ms | 88.4 / 223.0 ms | 479.9 ms | 362.9 MB |

The alert benchmark passed at 1,000/10,000/100,000 bars. One run measured
live evaluation at 8.14/47.48/286.41 ms and replay-prefix evaluation at
13.78/76.87/781.81 ms. It also verified capped history and disposal. This is
the Alert Engine's Node workload, not Canvas2D rendering or FPS.

## Automated verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm test` | Passed: 75 tests |
| `npm run test:browser` | Passed: 7 Chromium tests |
| `npm run test:react:browser` | Passed: 5 Next.js/React Chromium tests |
| `npm run benchmark:browser` | Passed; Canvas2D/memory cleanup evidence recorded |
| `npm run profile:browser` | Passed; hot-path profile recorded |
| `npm run benchmark:replay` | Passed; lengths restored and canvases cleaned |
| `npm run benchmark:alerts` | Passed at 1k/10k/100k |
| Next.js `npm run build` in `examples/nextjs-app-router` | Passed |
| `npm run package:check` | Passed; dry-run tarball contained public alert exports |
| `npm run package:smoke` | Passed; clean ESM consumer imported the tarball |

The Node suite includes alert, workspace, correction, invalid-data,
indicator, script, drawing, replay, plugin, React, datafeed, and disposal
coverage. Browser alert coverage verifies public API creation, replay
simulation, seek rebuilding, live-history isolation, mutation blocking, and
page-error cleanup. The Studio test verifies create, pause, persistence, and
remove through the UI.

## Browser compatibility status

The compatibility command was executed locally with the exact project
Playwright version:

```text
npm run test:browser:compat
7 passed: mobile-chrome emulation
21 blocked at browser launch
```

The 21 blocked launches were not application failures:

- Firefox was unavailable at
  `/home/agent/.cache/ms-playwright/firefox-1555/firefox/firefox`.
- WebKit was unavailable at
  `/home/agent/.cache/ms-playwright/webkit-2370/pw_run.sh`; this also blocks
  the Mobile Safari emulation project.
- The output explicitly requested `npx playwright install`. No system Firefox,
  Safari substitution, TLS bypass, arbitrary binary, or unsupported artifact
  was used.

Chromium and Mobile Chrome emulation are verified. Firefox, WebKit, Mobile
Safari, physical devices, accessibility tooling, and assistive-technology
behavior are not verified and remain open acceptance criteria.

## Public API and package verification

The package root exports `AlertEngine`, alert types/errors, definition parsing,
and the Chart alert methods/events through the existing ESM entry point. The
workspace parser accepts legacy documents without alerts and validates version-1
alert documents defensively. Runtime history and observations are not included
in workspace JSON.

The package dry run and clean temporary consumer smoke test passed. No npm
publication, release tag, GitHub release, root license change, or package
license metadata change was performed.

## Documentation status

Updated:

- `docs/PDR.md`
- `docs/ROADMAP.md`
- `docs/architecture/alert-engine.md`
- `docs/architecture/alert-evaluation-semantics.md`
- `docs/api/alerts.md`
- `docs/guides/studio-alerts.md`
- `docs/development/benchmarks.md`
- `docs/development/testing.md`
- `docs/reports/phase-7-2-performance-baseline.md`

The documentation distinguishes live versus simulated events, explicit
finality, correction policy, bounded history, and the lack of external
delivery. The current Chart adapter does not infer bar finality, so a host must
provide explicit finality to the framework-neutral engine for confirmed-bar
semantics.

## Acceptance matrix

| Criterion | Status | Evidence / limitation |
| --- | --- | --- |
| Performance regression explained and fixed | Verified | Baseline report and regression test |
| Framework-independent Alert Engine | Verified | `src/alerts`, 75 Node tests |
| Price alerts | Verified | Node and Chromium public-API tests |
| Indicator alerts | Verified | Engine threshold/pair tests and Chart output adapter |
| Supported KlineScript outputs | Verified with scope | Numeric plot outputs; boolean remains host-supplied |
| Deterministic frequency/deduplication | Verified | Unit tests and semantics document |
| Historical correction policy | Verified | Correction/out-of-order tests and documented no-replay policy |
| Replay alerts explicitly simulated | Verified | Chromium replay alert test and `simulated` events |
| Future data cannot affect replay | Verified | Existing replay suite plus alert replay prefix test |
| Live/replay isolation | Verified | Unit and browser history checks |
| Public alert management APIs | Verified | Typecheck, package check, browser lifecycle tests |
| Functional Studio controls | Verified in Chromium | 5 React/Next tests, including mobile-sized viewport coverage |
| Serializable validated definitions | Verified | Workspace and engine round-trip tests |
| Existing consumer compatibility | Verified locally | Node, vanilla Chromium, React/Next build and smoke checks |
| Resource cleanup | Verified locally | Chart/replay tests, zero canvases after benchmark destruction |
| Firefox | Blocked | Official Playwright binary unavailable |
| WebKit | Blocked | Official Playwright binary unavailable |
| Mobile Safari | Blocked | Requires unavailable Playwright WebKit |
| Accessibility and physical device gates | Not tested | Inherited Phase 7.1 gates remain open |

## Remaining technical debt and readiness

- Arbitrary replay seek and KlineScript replay still use full-prefix,
  correctness-first recalculation; no constant-time claim is made.
- The Chart adapter cannot infer finality from a plain `Candle` or current
  datafeed callback, so confirmed-bar live alerts require an explicit host
  integration.
- There is no external notification, background scheduler, webhook, broker,
  or vendor alert-delivery adapter by design.
- Visual regression baselines, accessibility audits, physical-device checks,
  and managed Firefox/WebKit runs remain outstanding.
- Historical corrections update runtime observations without replaying old
  notifications; applications that need a rebuilt historical alert history
  must reset and evaluate an explicit prefix.

Phase 7.2 engineering implementation is complete for the verified local
scope, but the formal milestone gate remains open because inherited mandatory
browser/accessibility/physical-device criteria are unresolved. Phase 3 or
subsequent milestone closure must not be inferred from this report, and no
owner-approved exception was supplied for these gates.

## Git verification

The coherent increments were committed and pushed in order:

| Commit | Subject | Push |
| --- | --- | --- |
| `c3efbb3` | `fix(performance): avoid full snapshot on candle updates` | Verified |
| `2d5078f` | `feat(alerts): add deterministic alert engine` | Verified |
| `e13fd74` | `feat(chart): integrate alerts with workspace and replay` | Verified |
| `94083af` | `feat(studio): add local alerts workflow and verification` | Verified |

The final report change is pending this final documentation commit. All
commits use author and committer `Akira Yuzai <yuzai.akira@gmail.com>`. The
branch was fetched and verified before this report: `HEAD == origin/work ==
94083af116bdc58a5a687c70b3eafd4b81dd942d`. No force-push, history rewrite,
GitHub Actions workflow, package publication, or release tag was used.
