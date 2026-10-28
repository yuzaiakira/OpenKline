# OpenKline Phase 8.8.16 Verification

Status: **OPEN — NOT RELEASE READY**

This report records evidence-driven remediation for the seven remaining
Phase 8.8.15 full-matrix Studio failures. It does not convert local system
Chromium results into managed Mobile Chrome or Mobile Safari acceptance.

## Evidence import

Phase 8.8.15 sanitized evidence was fetched from
`qa/phase-8-8-15-browser-evidence` at
`806f3db05a2fc9bde386282a7beda548f35c318d` and integrated under
`docs/evidence/browser/phase-8-8-15/` without changing historical results.

`npm run evidence:browser:check` validates all versioned packs, including the
new Phase 8.8.15 policy that preserves:

| Gate | Result |
| --- | --- |
| Targeted seven | 7/7 PASS |
| Standalone five-browser | 75/75 PASS |
| Studio five-browser | 118 expected / 7 unexpected of 125 |

## Exact seven-failure ledger

| # | Project | Title | Prior mechanism | Confirmed cause |
| ---: | --- | --- | --- | --- |
| 1–3 | `studio-mobile-chrome` | drawing snap / reload / replay | `Drawings (0)` after touch gestures reached Canvas | Shared harness placed full-canvas Y fractions outside the primary pane |
| 4–6 | `studio-mobile-safari` | drawing snap / reload / replay | `Drawings (0)` after mouse gestures reached Canvas | Same geometry regression; modality used mouse because `navigator.maxTouchPoints` was unreliable |
| 7 | `studio-mobile-safari` | dialog keyboard focus | `Dialog value` element(s) not found / not focused | Dialog open/focus race and trigger capture on mobile WebKit |

## Drawing-pane geometry findings

Studio seeds Volume and RSI panes by default. On a ~350 CSS-pixel mobile
canvas, `getPaneBounds` allocates most height to the non-main panes, leaving
the primary drawing pane in roughly the top ~20–30% of the canvas.

Phase 8.8.14 changed placement from full-canvas fractions `0.08/0.12` (inside
the main pane) to `0.24/0.32` plus a `safeY <= 0.72` heuristic. On tall
desktop Firefox canvases those fractions still land in the main pane, which
is why Firefox recovered in Phase 8.8.15. On mobile they land in volume/RSI
space, so `handlePendingDrawingPoint` correctly rejects the anchors and the
counter stays `Drawings (0)`.

This is a harness geometry regression relative to Phase 8.8.11, not proof of a
chart-engine drawing defect. Pointer/touch events did reach Canvas in the
trusted diagnostics.

## Mobile input-modality findings

`placeVisibleChartPoint` previously selected touch via
`navigator.maxTouchPoints > 0`. Trusted Mobile Chrome used
`pointerType=touch`; trusted Mobile Safari used `pointerType=mouse` even though
the Playwright project configures `hasTouch`. The helper now uses
`test.info().project.use.hasTouch` so mobile projects exercise Playwright
touchscreen input when the project declares touch capability. The synthetic
touch-fallback regression remains a separate test.

No product `suppressNextPointerDown` defect was required to explain the six
drawing failures: rejected points never entered the pending-anchor path.

## Dialog lifecycle and focus findings

The trusted Mobile Safari failure reported `element(s) not found` for
`getByRole('dialog', { name: 'Rename watchlist' }).getByLabel('Dialog value')`.
Pointer diagnostics showed `pointerdown` on a button and `pointerup` on a
nearby `ul`, so dialog mounting was not guaranteed by the click alone.
Sibling accessibility tests that only asserted visibility could still pass.

Product corrections:

- Capture the Rename/Delete trigger from `event.currentTarget` instead of
  relying on `document.activeElement` after a mobile click.
- Move initial dialog focus into `useLayoutEffect`, preferring the prompt
  input before the focus trap runs.
- Publish bounded dialog open/kind/title diagnostics for failure attachments.

The accessibility test still asserts focus and Tab/Shift+Tab trapping; it now
waits for dialog visibility first without weakening the focus contract.

## Confirmed corrections

### Harness

- `placeVisibleChartPoint` resolves the real main-pane fractions from
  `data-openkline-main-pane`, maps requested fractions inside that pane, and
  refuses points outside it.
- Touch modality follows Playwright project `hasTouch`.
- Drawing and dialog diagnostics record pane fractions, modality outcomes, and
  dialog focusable order.

### Product / Studio example

- `Chart.getPrimaryDrawingPaneBounds()` exposes the drawable main-pane bounds.
- Studio ChartPanel publishes those bounds onto the canvas and refreshes them
  on publish, viewport, and resize.
- Dialog trigger capture and layout-time focus for prompt inputs.

### Tests / evidence

- Unit regression proving mobile-height volume+RSI layouts keep the main pane
  above full-canvas y=`0.24`.
- Phase 8.8.15 evidence validator and pack integration.

## Remaining hypotheses for trusted verification

- Managed Mobile Safari may still differ in dialog mounting timing under heavy
  layout thrash; the trusted rerun must confirm open + focus.
- If a mobile project declares `hasTouch` but touchscreen delivery differs,
  diagnostics will show the actual pointerType for Phase 8.8.17.

## Local verification

Exact remediation source SHA is recorded on `work` after the Phase 8.8.16
commits (see `git log` / handoff). Local system Chromium and package gates are
engineering feedback only.

| Gate | Result |
| --- | --- |
| `npm test` | 171/171 PASS |
| `npm run typecheck` | PASS |
| `npm run studio:check` | PASS |
| `npm run evidence:browser:check` | PASS (incl. Phase 8.8.15 pack) |
| `npm run api:check` | PASS after additive baseline refresh for `getPrimaryDrawingPaneBounds` |
| `npm run package:audit` / `package:smoke` / `package:portability` | PASS |
| `npm run distribution:check` | PASS |
| `npm run test:react:browser` | 27/27 PASS (local Chromium) |
| `npm run browser:diagnostic` | 30 expected / 0 unexpected (local Chromium diagnostic) |
| `npm run benchmark:browser` | PASS; destroy left `remainingCanvasCount: 0`; memory after destroy returned near baseline |
| `npm run release:readiness` | NOT READY — dirty tree before commit; consumer-smoke failed offline `react@19.3.1` ERESOLVE (`react@undefined`); managed-browser / license / physical / visual / owner gates remain blocked |

Additional product hardening after local Chromium failures: Studio
`syncMainPaneDiagnostics` now swallows post-`destroy()` ResizeObserver /
microtask calls so page errors are not raised during teardown.

## Explicit limitations

- No managed Mobile Chrome / Mobile Safari / Firefox acceptance claim from this
  environment.
- Full Studio compatibility remains unverified until Phase 8.8.17.
- Physical Android, native iOS Safari, formal accessibility certification,
  visual baseline, legal/license, owner authorization, and release readiness
  remain open.
- Consumer preview smoke failure above is an offline npm resolution environment
  issue, not a managed-browser result.

**NOT RELEASE READY.**
