# OpenKline Phase 7.4 Verification

Date: 2026-10-25

Phase 7.4 adds the multi-chart Studio workspace, watchlists, named local
workspaces, and host-level synchronization. This report records local evidence
for the increment. It does not close inherited browser, accessibility, or
physical-device gates.

## Implemented

- Four validated layouts: `single`, `two-horizontal`, `two-vertical`, and
  `four-grid`.
- Stable panel IDs with independent Chart, symbol, timeframe, indicator,
  drawing, alert, replay, and KlineScript lifecycle state.
- Session archive and restoration when a layout is reduced and expanded.
- Optional crosshair, visible-range, symbol, and timeframe synchronization.
- Framework-neutral `StudioWorkspaceDocument` validation and legacy chart-only
  migration.
- Framework-neutral `WatchlistModel` with create, rename, delete, select,
  add/remove, reorder, favorite, subscription, and validated export behavior.
- Vendor-neutral `QuoteProvider` boundary and deterministic demo quote provider.
- Browser-local named workspace New/Save/Save As/Duplicate/Load/Delete and
  validated Import/Export flows.
- Responsive active-panel selection for compact/mobile-sized viewports.
- `npm run benchmark:studio` lifecycle workload for layout transitions and
  canvas cleanup observations.

The existing chart renderer, viewport, interaction, series, indicator,
drawing, alert, replay, and Worker runtime implementations were reused. No
parallel chart engine or vendor datafeed was introduced.

## Local verification

The following commands passed on 2026-10-25:

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm test` | 89 passed, 0 failed |
| `npm run test:react:browser` | 8 Chromium tests passed, 0 failed |
| `npm run build` in `examples/nextjs-app-router` | Next.js 16.4.3 production build passed |
| `npm run benchmark:studio` | Passed; four layout workloads and lifecycle counts reported |
| `npm run package:check` | Passed; dry-run package contained 206 files |
| `npm run package:smoke` | Passed; tarball installed in an isolated ESM consumer |

The browser suite covered the existing Studio regression flows plus:

- Four-panel rendering with four Canvas elements.
- Active-panel selection and per-panel EMA isolation.
- Symbol and synchronization switch state.
- Watchlist favorite and reorder controls.
- Four-panel named workspace save/load and panel removal.
- Mobile-sized viewport panel switching through the accessible selector.

The Node suite covers Studio layout cardinality, defensive nested workspace
validation, legacy migration, watchlist CRUD/reordering/favorites, and
round-trip serialization.

## Browser and compatibility status

Verified browser evidence for this increment:

- Chromium 154.0.8037.57 at `/usr/bin/chromium`.
- Playwright 1.64.1.
- Desktop Chromium and a 390×844 mobile-sized Chromium viewport.

Not verified in this environment:

- Playwright-managed Firefox.
- Playwright-managed WebKit.
- Playwright Mobile Chrome device project.
- Playwright Mobile Safari device project.
- Physical Android or iOS devices.
- Formal accessibility audit, keyboard-only audit, and visual regression
  baselines.

The managed Firefox/WebKit artifacts were unavailable and the previously
recorded artifact download path returned HTTP 403. System browsers were not
substituted. These remain open acceptance gates; no cross-browser compatibility
claim is made.

## Performance and memory

`npm run benchmark:studio` was run with local headless Chromium 154, Playwright
1.64.1, a 1,440×900 viewport, and the Next.js development host. Results are
layout/lifecycle observations, not universal performance limits:

| Layout | Transition observation (ms) | Panels | Visible canvases |
| --- | ---: | ---: | ---: |
| Single | 427.900 | 1 | 1 |
| Two horizontal | 331.600 | 2 | 2 |
| Two vertical | 328.000 | 2 | 2 |
| Four grid | 379.500 | 4 | 4 |

Returning to a single layout left one expected active canvas. This benchmark
does not measure FPS, heap limits, or physical-device battery usage. The
existing 1,000/10,000/100,000-candle Canvas2D benchmark and Phase 7.3 append
baseline were not rerun as part of this UI increment; no new performance claim
is made for them. The Node and Chromium regression suites passed without a
measured regression in the implemented flows.

## Public API and package status

The framework-neutral Studio contracts are exported from `openkline` through
`src/studio/index.ts` and the root entry point. The public documentation is in
`docs/api/studio.md`; host guides are in `docs/guides/studio-*.md`.

`npm run package:check` and `npm run package:smoke` verified that the package
can be packed and installed into an isolated ESM consumer. No npm publication,
release tag, or GitHub release was performed.

## Acceptance matrix

| Criterion | Status | Evidence or remaining work |
| --- | --- | --- |
| Four requested layouts | Implemented / verified | Chromium browser test and Studio benchmark |
| Stable panel identity | Implemented / verified | DOM panel IDs, workspace round trip, Strict Mode-safe ID allocation |
| Independent panel lifecycle | Implemented / partially verified | Indicator isolation, panel removal, and existing lifecycle tests pass; dedicated multi-panel drawing/alert/replay isolation coverage remains desirable |
| Optional crosshair/range sync | Implemented / partially verified | Timestamp API and switches are covered; dedicated multi-panel pointer propagation assertions remain open |
| Optional symbol/timeframe sync | Implemented / verified at UI state level | Chromium test verifies synchronized symbol state; irregular-history behavior remains core-level evidence |
| Watchlist model and UI | Implemented / partially verified | Node model tests and Chromium favorite/reorder coverage pass; prompt-based rename/delete controls are not browser-tested |
| Workspace persistence and migration | Implemented / verified | Parser tests, named four-panel save/load, and legacy migration evidence |
| Responsive/mobile behavior | Implemented / partially verified | Mobile-sized Chromium panel switching passes; device projects and physical devices remain open |
| Performance regression | Implemented / limited verification | Studio lifecycle benchmark passes; full candle benchmark was not rerun in this increment |
| Documentation | Implemented / verified | PDR, roadmap, API, architecture, guides, testing, and benchmark docs updated |
| Firefox/WebKit/Mobile Safari | Blocked by environment | Official managed binaries unavailable; criteria remain open |
| Accessibility gate | Not tested | Requires formal audit and baseline evidence |

## Git and publication verification

The implementation/documentation increment was committed as:

`129006913f5af95e1849f28bb0d50fb31b91a1c9`

Commit subject: `feat(studio): add multi-chart workspace host`

Author and committer were both verified as `Akira Yuzai
<yuzai.akira@gmail.com>`. The commit was pushed immediately to
`origin/work`; the push advanced the remote from `f6479e8` to `1290069`.
The worktree was clean after the push. No GitHub Actions were added or used.

## Phase 7.4 readiness decision

The multi-chart workspace foundation is ready for continued local engineering
and review. Phase 7.4 is not formally closed because the inherited managed
Firefox, WebKit, Mobile Safari, accessibility, and physical-device gates are
still open, and several multi-panel interaction cases are only partially
covered. Phase 8 or further platform expansion must not be treated as a
cross-browser release approval until the project owner accepts those open
criteria or the required official environments become available.
