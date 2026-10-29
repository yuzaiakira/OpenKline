# Phase 8.13.1 — Comparison Workspace Persistence Hardening

Date: 2026-10-29

## Scope and starting state

This increment started at `fd281903dbacf8d1c9d454fc64e10ebda3150d14` on the
consolidated `main` branch, with local `main` matching `origin/main`. It
addresses only the Phase 8.13.1 Studio workspace-persistence defect; the public
comparison engine and core chart architecture were not rewritten.

No npm publication, release, license change, GitHub Actions workflow, or
non-authorized browser workaround was performed.

## Defect reproduction and root cause

The defect was reproduced before the fix with a focused Chromium test. The
workflow selected a line presentation and logarithmic price scale, entered
percentage comparison, added AAPL, saved while comparison was active, and
inspected the saved document. The document incorrectly contained temporary
`comparison-*` series.

The root cause was that the Studio parent collected workspace state directly
from the live `Chart.serializeWorkspace()` result while comparison mode had
temporarily hidden ordinary series, added normalized comparison lines, and
changed the scale to linear. A separate initial-mount replay effect could also
reset a restored non-linear scale before the user interacted with replay.

## Implemented fix

- Added a panel-level canonical workspace snapshot that represents the
  ordinary chart presentation independently of temporary comparison overlays.
- Added a panel handle serializer used by workspace save and layout archival.
  It strips the Studio-owned `comparison-*` series and preserves ordinary
  series visibility, styles, indicators, drawings, raw OHLC data, and price
  scale settings.
- Captured canonical state before entering comparison and refreshed it after
  exiting comparison.
- Restored canonical state before reapplying active comparison after workspace
  restore or symbol/timeframe replacement.
- Kept comparison configuration (`active`, normalization mode, baseline, and
  selected assets) in the Studio document while excluding temporary rendered
  series from the chart workspace.
- Guarded replay-exit presentation reset so it runs only after an actual replay
  session, not during initial restoration.
- Added a regression test covering active-comparison save, reload, exit,
  canonical series/style restoration, raw OHLC preservation, indicator
  preservation, and page-error absence.

These changes are private to the Next.js Studio reference consumer. No public
package API or serialized core workspace schema was changed.

## Verification

Environment: Node `v24.19.0`, Playwright `1.64.1`, local headless Chromium
`154.0.0.0`. The browser results below are cloud-environment observations and
are not a universal compatibility claim.

| Check | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm test` | PASS — 198/198 Node tests |
| `npm run studio:check` | PASS |
| `npm run package:smoke` | PASS — local tarball installed and imported |
| `npm run distribution:check` | PASS — 402 files, 352,563 bytes |
| `npm run test:browser` | PASS — 25/25 Chromium tests |
| `npm run test:react:browser` | PASS — 30/30 React/Studio Chromium tests |
| Focused comparison persistence test before fix | FAIL as expected — temporary comparison series persisted |
| Focused comparison persistence test after fix | PASS — 1/1 |
| `npm run api:check` | PASS when run sequentially — no removals or signature changes; the earlier mismatch came from concurrent `clean`/`build` validation races |

The focused regression also verifies 8 ordinary series, 240 raw `studio-price`
OHLC points, 2 indicators, logarithmic scale, line presentation, selected
comparison state after reload, no temporary comparison series after save, and
no browser page errors.

## Compatibility and remaining gates

Only managed Chromium was available for this cloud run. Firefox, WebKit,
Mobile Safari, physical-device testing, and broader visual/accessibility
approval remain open according to the prior Phase 8.13 environment evidence.
No system-browser substitution or unsupported artifact download was used.

Newly saved workspaces are canonicalized before persistence. A legacy workspace
that was already saved by the pre-fix defect may contain temporary comparison
series or may have lost the original visibility/scale snapshot; temporary
series are filtered when loaded, but missing historical presentation metadata
cannot be reconstructed. Such documents require user review. Legacy documents
without comparison metadata remain supported.

No financial values are transformed by this fix: comparison overlays remain a
presentation concern, while raw chart OHLC data and indicator inputs remain in
their original workspace series.

## Acceptance matrix

| Criterion | Status | Evidence |
|---|---|---|
| Reproduce active-comparison persistence defect | Verified | Focused pre-fix test failed with persisted `comparison-*` series |
| Canonical save while comparison is active | Implemented / verified | Focused React/Studio test |
| Reload preserves comparison configuration | Implemented / verified | Focused React/Studio test |
| Exit restores ordinary presentation and scale | Implemented / verified | Focused React/Studio test |
| Raw OHLC and indicators remain intact | Implemented / verified | Focused document assertions and Node workspace tests |
| No temporary series in persisted documents | Implemented / verified | Focused localStorage assertions |
| Symbol/timeframe and layout lifecycle handling | Implemented / covered | Panel serializer used by replacement and archival paths; existing multi-chart suite |
| Public API compatibility | No new change; gate open | API checker historical baseline mismatch remains |
| Chromium browser behavior | Verified | 25/25 core and 30/30 React/Studio |
| Firefox/WebKit/Mobile Safari/physical devices | Not tested / open | Managed browser artifacts and physical devices unavailable |

## API verification correction

The initial report of a `WorkspaceRestoreResult` mismatch came from running
several build-backed checks concurrently. Those commands shared the same
generated `dist` directory while each invoked `clean`, so the API inventory
could observe a partial declaration set. The stored baseline declaration and
the regenerated current declaration have the same signature hash
(`04a723abd0b74519b8d98b7e8de4be0e90c208facd7a9e641dd2c173ce197147`). A
sequential `npm run api:check` passes; no API migration or baseline rewrite was
needed.

## Final delivery

The implementation and verification commit is
`40d0cd32406c666d6e4f01144c6fa1f7f892eebd`, authored and committed as
`Akira Yuzai <yuzai.akira@gmail.com>`. It was pushed to `origin/main`, and
local `main` matched `origin/main` at that revision. This report correction is
also pushed immediately after its documentation commit. Phase 8.13.1 is
functionally verified for the available environment, while the explicitly
listed browser and API baseline gates remain open.
