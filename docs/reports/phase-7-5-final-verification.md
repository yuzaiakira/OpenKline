# OpenKline Phase 7.5 Final Verification

Date: 2026-10-26

Status: In progress; acceptance gates remain open.

This report records the locally verified Phase 7.5 increment. It is not a
release approval and does not claim support for browsers that were not run.

## Scope delivered

- Added framework-independent ROC, CCI, Williams %R, OBV, MFI, ADX (+DI/-DI),
  Donchian Channels, and Keltner Channels definitions with metadata,
  parameter validation, warm-up handling, missing-volume policy, append
  updates, and correction-safe recalculation.
- Added reusable professional drawing definitions for rays, extended lines,
  parallel channels, Fibonacci extensions, price/date ranges, and long/short
  risk-reward annotations. They use the existing DrawingEngine, coordinate
  conversion, hit testing, edit locking, undo/redo, and workspace format.
- Added public drawing visibility, lock, and style controls and an explicit
  `visible-ohlc` snapping mode. Snapping uses the visible candle timestamp and
  nearest raw OHLC value; it does not alter stored data.
- Added the framework-neutral `StudioSynchronizationController` with
  source-panel tagging, UTC timestamp propagation, nearest-bar/clamped target
  handling, and loop prevention.
- Expanded the Next.js Studio with the Indicator Explorer, professional
  drawing toolbar, object tree, series/drawing visibility and lock controls,
  parameter overrides, and accessible in-page dialogs.
- Extended the Studio benchmark with interaction timing, heap observations,
  and post-destroy canvas cleanup checks.

No new chart engine, vendor datafeed, broker order path, or parallel rendering
architecture was introduced.

## Verification evidence

All commands below were run locally on 2026-10-26 unless noted otherwise.

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm test` | 93 passed, 0 failed |
| Next.js production build (`examples/nextjs-app-router`) | Passed with Next.js 16.4.3 |
| React browser suite, Chromium | 10 passed, 0 failed |
| `npm run package:check` | Passed; 214 files, 205.6 kB tarball, 1.2 MB unpacked |
| `npm run package:smoke` | Passed; isolated ESM consumer installed the tarball |
| `git diff --check` | Passed |

The Chromium browser suite covers workspace reload, multi-chart state,
responsive panel selection, dialogs, drawing snapping, logarithmic-scale
preservation, replay, alerts, KlineScript diagnostics/autocomplete/Worker
status, and object-tree controls.

The existing compatibility command was also executed with Playwright 1.64.1:

- Mobile Chrome emulation: 8 passed.
- Playwright-managed Firefox: 8 blocked because the managed Firefox binary was
  unavailable.
- Playwright-managed WebKit: 8 blocked because the managed WebKit binary was
  unavailable.
- Mobile Safari emulation: 8 blocked because its WebKit dependency was
  unavailable.

The environment had no usable managed browser cache. The previously observed
official artifact download path returned HTTP 403. System Firefox and Safari
were not substituted, TLS verification was not disabled, and no arbitrary
browser binary was used. The Firefox, WebKit, and Mobile Safari criteria are
therefore blocked rather than passed.

## Performance and memory observations

`npm run benchmark:browser` ran in local HeadlessChrome 154.0.8037.57. These
are observations from one reproducible local run, not universal performance
claims:

| Dataset | Load ms | Navigation p95 ms | Frame-work p95 ms | RAF FPS observation |
| ---: | ---: | ---: | ---: | ---: |
| 1,000 candles | 24.5 | 4.9 | 4.2 | 63.67 |
| 10,000 candles | 99.7 | 8.0 | 1.5 | 60.94 |
| 100,000 candles | 1,461.2 | 2.8 | 4.6 | 61.75 |

For 100,000 candles the measured frame interval median was 16.6 ms and p95
was 19.2 ms. The run observed 182,229,314 bytes before destruction and
2,325,551 bytes after destruction. The post-run canvas count was zero. These
heap values are browser observations, not a proof that every integration is
leak-free.

`npm run benchmark:studio` also passed in HeadlessChrome 154. The observed
transition times were 444.8 ms (single), 342.3 ms (two horizontal), 325.0 ms
(two vertical), and 387.8 ms (four-grid). It observed 1, 2, 2, and 4 visible
canvases respectively, 168 ms for the interaction workload, and a 6.26 MB
heap delta after cleanup. This workload is a lifecycle/interaction observation
and is not an FPS or memory-limit guarantee.

No optimization was introduced based on unsupported claims; the existing
append paths and chart architecture were preserved.

## Acceptance matrix

| Criterion | Status | Evidence / remaining work |
| --- | --- | --- |
| Primary indicator definitions and metadata | Implemented / verified | 93-test Node suite, indicator fixtures, public exports |
| Indicator warm-up, volume policy, append, and corrections | Implemented / verified | `indicators.test.ts` and full Node suite |
| Professional drawing geometry and validation | Implemented / verified | Drawing geometry tests and shared DrawingEngine contracts |
| Drawing style, visibility, locking, and OHLC snapping API | Implemented / partially verified | Public Chart API and Chromium snapping/object-tree tests; broader tool-by-tool workflows remain open |
| Multi-chart UTC crosshair/range synchronization | Implemented / partially verified | Controller unit test covers irregular timestamps and loop prevention; full pointer propagation matrix remains open |
| Indicator Explorer and parameter overrides | Implemented / verified in Chromium | 10-test React Chromium suite |
| Object tree and accessible in-page dialogs | Implemented / verified in Chromium | Visibility/lock and management-dialog browser assertions |
| Workspace persistence and existing Studio flows | Implemented / verified in Chromium and Node | Workspace parser, reload, panel, watchlist, replay, alert, and script tests |
| Canvas performance at 1k/10k/100k | Verified as local observation | Browser benchmark completed; no universal device claim |
| Studio lifecycle cleanup | Verified as local observation | Four layouts and post-destroy canvas count zero |
| Package installation and public exports | Verified | Dry-run pack and isolated ESM smoke consumer |
| Firefox | Blocked by environment | Playwright-managed binary unavailable; official artifact path previously returned HTTP 403 |
| WebKit | Blocked by environment | Playwright-managed binary unavailable |
| Mobile Safari | Blocked by environment | WebKit dependency unavailable |
| Mobile Chrome | Verified in emulation | 8 compatibility tests passed; physical Android not tested |
| Formal accessibility and assistive technology audit | Not tested | Requires keyboard/AT audit and documented baselines |
| Physical iOS/Android behavior | Not tested | Requires real devices or approved device lab |
| Full visual regression baseline | Not tested | No baseline approval was performed |
| Contextual drawing property editor | Not implemented in this increment | Object-tree selection and style/visibility/lock controls exist; a full property editor remains open |

## Documentation and public API

Updated PDR, roadmap, drawing API, drawing architecture, Studio guide, and
benchmark documentation. The new `StudioSynchronizationController`, drawing
snap mode, and drawing management methods are exported through the public
package entry point. The package check confirms that these declarations and
runtime modules are included in the tarball.

## Git and publication verification

This increment was committed as the following Conventional Commit with
author and committer:

`Akira Yuzai <yuzai.akira@gmail.com>`

The preceding Phase 7.5 commits already pushed to `origin/work` are:

- `51205eff4c45b9a66e513fbfac0dceb4867e5f6f`
  (`feat(indicators): add primary technical analysis definitions`)
- `ae47a0d1b4c305bdaa99531a6723997ed6b34c39`
  (`feat(drawings): add professional analysis tools`)

`a2db82f` — `feat(studio): harden phase 7.5 analysis workflow`

The commit was pushed immediately from `ae47a0d` to `origin/work`, and the
remote reported the update as `ae47a0d..a2db82f`. No GitHub Actions, npm
publication, release tag, or GitHub release was created.

## Phase 7.5 readiness decision

Phase 7.5 remains open. The delivered indicator, drawing, Studio, synchronization,
snapping, object-tree, package, and local Chromium capabilities are ready for
continued review. Formal completion is blocked by the unverified
Firefox/WebKit/Mobile Safari, accessibility, physical-device, and remaining
end-to-end workflow gates above. This report does not authorize Phase 8 or a
cross-browser release claim. The project owner must either provide approved
official browser/device environments or explicitly approve a documented
exception before those gates can be closed.
