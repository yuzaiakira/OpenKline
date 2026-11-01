# OpenKline Phase 16.4.1 — Professional Widget UI Verification

## Disposition

The owner-authorized Phase 16.4.1 internal UI increment is implemented and
verified in the available local Chromium environment. The result is an
internal engineering delivery only. A public Widget API, package export,
publication, and release readiness are not approved by this work.

| Item | Value |
| --- | --- |
| Repository | `yuzaiakira/OpenKline` |
| Starting SHA | `ebad652be2763a42ea094871b38aa6f9022dfa88` |
| Branch | `main` |
| Required identity | `Akira Yuzai <yuzai.akira@gmail.com>` |
| Scope | Phase 16.4.1 internal professional Widget UI only |
| Implementation commit | `59447a6458c49d14cda88ae7073f7d309bdea55f` |
| Report commit | The documentation commit containing this report |
| Publication state | No npm publication, Git tag, GitHub release, or license change |

The reviewed Phase 16.4 architecture document was available at
`docs/reviews/phase-16-4-architecture-design.md` and was reconciled with the
current implementation. The implementation remains within `src/widget/` plus
the narrowly required internal Chart cancellation hook, tests, benchmark, and
documentation. No history was rewritten and no GitHub Actions workflow was
added.

## Authorization and boundary

The owner authorization covers implementation, focused tests, internal
benchmarks, documentation, and direct pushes for Phase 16.4.1 only. It does
not authorize public Widget exports, protected API-baseline changes, React or
Next.js Widget adapters, licensing, backend or hosted infrastructure, accounts,
billing, broker connectivity, npm publication, releases, tags, or later Phase
16.4 increments.

All financial state, indicators, drawings, scales, viewport behavior, datafeed
work, workspace serialization, and Canvas2D rendering continue to be owned by
the existing Chart/Core implementation. The Widget supplies UI orchestration;
it does not create a second renderer or financial calculation model.

## Implemented internal UI

### Indicator Explorer

- Searches the built-in indicator metadata registry and supports host-selected
  indicator IDs.
- Renders typed parameter controls, defaults, descriptions, and categories.
- Adds indicators to the main or new pane according to the indicator metadata.
- Edits Widget-owned indicator instances through `ChartIndicatorApi` and
  removes them through Chart.
- Routes invalid parameters through the existing Widget error state.

### Drawing Toolbar

- Lists the supported drawing-tool registry, including line, channel, range,
  Fibonacci, position, and text tools.
- Starts, cancels, and reports the active interactive tool.
- Delegates undo and redo to Chart's drawing history.
- Uses an internal Chart cancellation hook only; it is not a public Chart
  method and is absent from the public declaration surface.

### Object Tree and layer management

- Lists price series, indicator instances, and drawings from live Chart state.
- Delegates series/drawing visibility, drawing selection and locking, and
  removal to existing Chart methods.
- Refreshes on indicator and drawing events rather than retaining a duplicate
  object model.

### Drawing Property Editor

- Edits the selected drawing's color, line width, visibility, and lock state.
- Applies changes through `setDrawingStyle` and removes through Chart.
- Shows an explicit empty state when no drawing is selected.

### Chart Settings

- Applies light/dark theme and LTR/RTL direction.
- Applies primary price-scale mode, autoscale, axis visibility, and precision.
- Uses the existing Chart options and price-scale contracts.

All five surfaces are scoped to the Widget root, use native controls, expose
labels and dialog semantics, restore trigger focus on Escape, and use
touch-sized controls in the responsive layout. Feature flags and labels are
internal extensions of the existing Widget controller and are not public
package exports.

## Verification matrix

The following commands were executed locally in the cloud workspace. Results
are evidence for this revision and environment, not universal compatibility
claims.

| Command | Result |
| --- | --- |
| `npm run build` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS — 387/387 Node tests |
| `npm run test:browser -- --reporter=line` | PASS — 41 passed, 1 skipped, 42 discovered on Chromium; the skip is the mobile-only test under the desktop project |
| `npx playwright test tests/browser/widget-professional.spec.ts --project=chromium --reporter=line` | PASS — 2 passed, 1 skipped |
| `npx playwright test tests/browser/widget-professional.spec.ts --project=mobile-chrome --reporter=line` | PASS — 2 passed, 1 skipped; touch/responsive workflow passed under Mobile Chrome emulation |
| `npm run test:react:browser` | PASS — 38/38 Chromium tests |
| `npm run test:react:production` | PASS — 1/1 Next.js production test |
| `npm run package:smoke` | PASS — local tarball installed by an ESM consumer; no publication |
| `npm run package:check` | PASS — local dry-run pack only |
| `npm run distribution:check` | PASS — no packaging problems; no publication |
| `npm run studio:check` | PASS — core has no React/Next runtime dependency |
| `npm run api:inventory` | PASS — 319 runtime and 736 type exports inventoried |
| `npm run api:diagnostics` | PASS_ADDITIVE_REVIEW_REQUIRED — no removals; inherited additive review required |
| `npm run stress:ci` | PASS — zero orphan failures, zero Worker orphans, zero remaining canvases |
| `npm run benchmark:browser` | PASS — system HeadlessChrome 154, 1k/10k/100k Canvas2D workload |
| `npm run benchmark:widget` | PASS — five panels, indicator lifecycle, drawing lifecycle, settings, and cleanup |
| `npm run api:check` | OPEN/FAIL — no removals, but the protected historical baseline still reports three changed declaration hashes |

The React/Studio browser server emitted existing warnings about unresolved
illustrative fixture sources; the 38 tests still passed. These warnings are
not treated as evidence of a new Widget defect.

## API boundary verification

The Widget remains internal:

- `src/widget/index.ts` is not re-exported from `src/index.ts`.
- No `@openkline/react` export, package subpath, or package metadata was added.
- No protected API baseline was rewritten.
- No license, release, tag, or publication state was changed.

`npm run api:check` remains intentionally open. It reports no removals, but
the historical baseline still differs for:

- `openkline:runtime:Chart`
- `openkline:type:WorkspaceDocument`
- `openkline:type:WorkspaceRestoreOptions`

Those inherited changes were not approved for baseline adoption by this phase.
The Widget UI does not add a public export and does not close this gate.

## Performance and memory evidence

The browser benchmark ran with the available system Chromium:

| Candles | RAF FPS | Frame median / p95 | Load | Update-frame |
| ---: | ---: | ---: | ---: | ---: |
| 1,000 | 63.21 | 16.6 / 16.9 ms | 24.3 ms | 2.005 ms |
| 10,000 | 61.82 | 16.6 / 17.1 ms | 102.1 ms | 1.223 ms |
| 100,000 | 62.99 | 16.7 / 16.8 ms | 1,702.3 ms | 1.144 ms |

The same run measured 590,984,700 bytes before destroying the 100k chart and
4,042,449 bytes afterward, with zero remaining canvases. These figures are
workload- and environment-specific; they are not a universal performance
promise and do not establish a Widget release budget.

The Widget-specific benchmark used 1,000 candles. Panel open/close, indicator
add/update/remove, drawing start/cancel, and settings apply each reached the
next visual frame in approximately 13.8–19.3 ms in this HeadlessChrome run.
Its diagnostics were:

```text
beforeDestroy: domListeners=25 chartSubscriptions=15 canvas=1 style=1 pending=false
afterDestroy:  domListeners=0  chartSubscriptions=0  canvas=0 style=0 pending=false
```

Ten repeated mount/unmount cycles had a 5.5 ms median and 6.3 ms p95 in the
same run. The existing stress suite separately reported Node realtime latency
of 0.1727 ms median / 13.6698 ms p95 and browser interaction latency of 32.6
ms median / 55.1 ms p95, with zero orphan failures and zero remaining canvases.

## Browser, accessibility, and responsive status

| Target | Status | Evidence/limitation |
| --- | --- | --- |
| Chromium desktop | VERIFIED | HeadlessChrome 154.0.0.0; full professional UI behavior tests passed |
| Mobile Chrome emulation | VERIFIED | Same system Chromium with Playwright device emulation; touch/responsive test passed |
| Firefox | BLOCKED / NOT TESTED | Playwright-managed `firefox-1555` executable is absent; no system-browser substitution was used |
| WebKit | BLOCKED / NOT TESTED | Playwright-managed `webkit-2370` executable is absent |
| Mobile Safari emulation | BLOCKED / NOT TESTED | Requires the unavailable Playwright WebKit browser in this environment |
| Physical devices | NOT TESTED | No device lab or physical-device access |
| Formal WCAG/AT/screen reader | OPEN | Behavioral keyboard semantics and visible focus were tested; formal assistive-technology and WCAG acceptance was not run |
| CSP/nonce deployment | OPEN | No production host CSP matrix was available |

The responsive test verifies narrow layout dimensions and touch-sized controls;
it does not claim Android or iOS physical-device compatibility. RTL behavior,
theme switching, keyboard Escape/focus restoration, and price-scale settings
were covered by the Chromium professional workflow.

## Lifecycle and cleanup

The Widget owns one Chart and one Canvas2D surface per instance. Replacement
datafeed requests are aborted and generation-checked. Destruction removes DOM
listeners, Chart subscriptions, plugin handles, Chart resources, pending
requests, scoped style ownership, and the Widget root. Independent instances
were mounted, transitioned through separate datafeed states, and destroyed
without cross-instance state leakage.

The browser stress run reported:

```text
orphanFailures=0
workerOrphans=0
remainingCanvasCount=0
```

No Widget Worker, timer, broker connection, authentication service, or
mandatory network service is created.

## Deferred and unsupported in this increment

- Public Widget types, root exports, package subpaths, and a React Widget
  adapter require separate owner review.
- Multi-chart layouts, watchlists, comparison, replay, and provider-specific
  metadata UI remain deferred.
- Full localization catalogs, host-customizable command/menu contracts,
  CSP nonce configuration, and formal accessibility/contrast evidence remain
  open.
- Official Firefox, WebKit, Mobile Safari, and physical-device evidence remain
  unavailable.
- The protected API baseline, licensing, npm/release, and legal gates remain
  unchanged and open.
- Phase 16.4.2 and later work was not started.

## Acceptance state

| Criterion | State |
| --- | --- |
| Five authorized internal UI surfaces implemented over Core | VERIFIED |
| Offline initialization and host data integration | VERIFIED |
| Indicator parameter/add/update/remove flow | VERIFIED in Chromium; Mobile Chrome covered the independent-instance workflow |
| Drawing tools, cancellation, object management, properties | VERIFIED in Chromium; Mobile Chrome covered touch panel activation and responsive controls |
| Theme, RTL, price-scale settings | VERIFIED in Chromium |
| Independent instances and lifecycle cleanup | VERIFIED |
| TypeScript, Node, package, distribution, React, Next, stress checks | VERIFIED as listed above |
| Protected public API baseline | OPEN — not changed; inherited strict check failure remains |
| Official Firefox/WebKit/Mobile Safari | OPEN/BLOCKED |
| Physical-device and formal accessibility acceptance | OPEN |
| Public Widget release readiness | NOT AUTHORIZED / NOT READY |

## Final status

**Phase 16.4.1 internal engineering:** complete within the explicitly
authorized boundary and verified by the available local evidence.

**Public Widget API or release readiness:** not complete, not authorized, and
not claimed. No public exports, package publication, tag, release, license
change, backend, broker integration, or later Phase 16.4 work was performed.
