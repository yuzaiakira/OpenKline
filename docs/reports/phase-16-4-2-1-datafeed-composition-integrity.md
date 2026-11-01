# OpenKline Phase 16.4.2.1 — Datafeed & Composition Integrity Hardening

## Disposition

Phase 16.4.2.1 corrective hardening is implemented and verified in the available
local Chromium environment. This is an internal engineering delivery only.
Public Widget API adoption, package export, publication, and release readiness
are not authorized by this work.

| Item | Value |
| --- | --- |
| Repository | `yuzaiakira/OpenKline` |
| Starting SHA | `f909903432599cb4ccc2fbb2f35afc1c0a7dc42e` |
| Branch | `main` |
| Required identity | `Akira Yuzai <yuzai.akira@gmail.com>` |
| Scope | Phase 16.4.2.1 Datafeed & Composition integrity hardening only |
| Implementation commit | `204ff6164ce01c3fa0a94f7e925a9ad0c82711b9` |
| Report commits | `e5d021444eb9a28149e325716b96b2577d676745`, `6887b45d170188fb00bf71e63bbf5ed07880ff54` |
| Publication state | No npm publication, Git tag, GitHub release, or license change |

## Explicit authorized scope

Owner authorization covers:

1. Reproducing and correcting confirmed Datafeed integration regressions.
2. Restoring provider-neutral symbol resolution and realtime subscription behavior.
3. Correcting asynchronous request lifecycle and cancellation diagnostics.
4. Hardening multi-chart Composition validation and restoration.
5. Ensuring identity integrity and chart-instance isolation.
6. Focused behavioral/regression tests.
7. Relevant verification and performance checks.
8. Technical documentation.
9. Conventional Commits and push to `origin/main`.

Phase 16.4.3 and public Widget API adoption remain unauthorized.

## Reproduced defects

### A — ChartSlot bypassed Chart Datafeed lifecycle (CONFIRMED)

Source inspection of Phase 16.4.2 `ChartSlot.setDatafeed()` showed a direct
`datafeed.getBars()` call. Unlike `Chart.setDatafeed()`, that path did not:

- call `resolveSymbol()`;
- register `subscribeBars()`;
- own realtime append/correction;
- unsubscribe on replacement/destruction.

Behavioral Chromium tests with a deterministic mock Datafeed confirmed the
pre-fix gap by requiring resolve/subscribe invocations after the corrective
path was restored.

### B — Pending-request diagnostics retained settled controllers (CONFIRMED)

`ChartSlot` retained the AbortController after successful or failed settlement,
so `hasPendingDataRequest()` could report pending work after completion.

### C — Composition accepted non-canonical chart IDs (CONFIRMED)

`parseWidgetComposition` accepted arbitrary chart IDs while the Widget layout
system only creates `chart-1`…`chart-N`. `importComposition` then silently
skipped missing slots (`if (slot === undefined) continue`).

### D — Weak numeric / hostile-input validation (CONFIRMED)

Comparison `baselineTime` / `baselineMaxAgeMs` accepted non-finite values; the
parser lacked allowlisted keys, path-cycle detection, nesting bounds, and plain
object prototype checks consistent with repository validation conventions.

## Defects not reproduced / not claimed as new regressions

- Independent Core financial calculation errors were not observed.
- Public `WorkspaceDocument` / `WorkspaceRestoreOptions` contracts were not
  broken by this phase.
- Chart-level stale realtime callbacks after unsubscribe were not previously
  generation-guarded; that gap was corrected as a bounded lifecycle hardening
  inside the existing `Chart.setDatafeed()` subscription callback, not as a new
  competing subscription engine.

## Root-cause analysis

Phase 16.4.2 extracted Chart ownership into `ChartSlot` and reimplemented a
simplified historical-load path instead of reusing `Chart.setDatafeed()`. That
shortcut dropped provider-neutral resolve/subscribe semantics and left pending
diagnostics uncleared. Composition validation emphasized structural shape over
canonical ID policy and finite numeric domains, enabling silent partial restore.

## Before / after Datafeed behavior

| Capability | Before 16.4.2.1 | After |
| --- | --- | --- |
| `resolveSymbol()` | Not called by ChartSlot | Called via `Chart.setDatafeed()` |
| Historical `getBars()` | Called directly | Called via Chart with AbortSignal |
| `subscribeBars()` | Not registered | Registered by Chart after confirmed bars |
| Realtime append/correction | Not delivered | Delivered through Chart `update()` |
| Unsubscribe on replace/destroy | Not owned | `stopDatafeed()` on replace, workspace import, and slot destroy |
| Confirmed identity commit | On raw getBars success | Only after Chart setDatafeed completes without abort/stale generation |
| Stale realtime callback | Chart applied post-unsubscribe callbacks | Request-id guard ignores superseded callbacks |

## Realtime subscription lifecycle

1. `ChartSlot.setDatafeed` aborts any prior controller and increments generation.
2. Clears Widget-managed indicator maps (Chart clears managed indicators).
3. Awaits `chart.setDatafeed(datafeed, { ...query, signal })`.
4. On success and matching generation: commits confirmed symbol/timeframe.
5. On abort/stale: returns without committing identity.
6. On provider failure: marks `identityStatus: "failed"`, preserves prior confirmed candles/identity.
7. `finally` clears `dataRequest` only when generation still matches.
8. Destroy/importWorkspace/setData call `stopDatafeed()` and cancel pending work.

Archived layout slots restore Workspace data only. Datafeed connectivity does
**not** resume automatically; the host must call `setDatafeed` again.

## Confirmed / requested identity behavior

Verified scenarios (Chromium mock Datafeed):

- BTC-USD → ETH-USD and 1m → 15m commit only after successful load.
- Rapid BTC → ETH → SOL settles on SOL with pending cleared.
- Failed FAIL request after SOL keeps confirmed SOL candles; requested FAIL;
  identity `failed`; pending false.
- Abort during slow resolve superseded by FAST load.
- Stale retired realtime handlers do not mutate confirmed candles.
- Sibling chart remains confirmed while the other fails.
- Destruction leaves zero Widget canvases and pending=false.

## Pending-request diagnostics

| Moment | Expected | Verified |
| --- | --- | --- |
| Before load | false | yes |
| During load | true | yes |
| After success | false | yes |
| After provider rejection | false | yes |
| After cancellation/replacement | false | yes |
| After disposal | false | yes |

Generation-aware `finally` prevents an older request from clearing a newer
controller.

## Composition validation rules

Internal schema remains version 1.

- Layout cardinality must match chart count.
- Chart IDs must equal canonical `stableChartIds(N)` in order (`chart-1`…).
- Duplicate IDs, unknown versions, invalid layouts, and missing active charts reject.
- Comparison numerics must be finite; `baselineMaxAgeMs >= 0`; asset IDs bounded.
- Allowlisted keys at composition/chart/sync/comparison levels.
- Path-based cycle detection (shared DAG refs allowed; true cycles rejected).
- Nesting depth bound; plain `Object.prototype` objects only.
- Nested Workspace and Watchlist reuse existing parsers.

## Composition restoration failure policy

1. Full `parseWidgetComposition` prevalidation before mutation.
2. Snapshot current composition via `exportComposition()`.
3. `applyComposition(parsed)`; on failure, best-effort `applyComposition(previous)` then rethrow.
4. Missing canonical slots throw (no silent skip).
5. Comparison restores configuration only; host-owned asset candles are not implied.

Structural invalid inputs are rejected without mutating usable Widget state
(verified). Post-mutation restore failures use best-effort rollback; the phase
does not claim a general transactional framework beyond that tested policy.

## Multi-chart isolation evidence

Chromium tests cover independent resolve/subscribe logs per chart, one-chart
failure without sibling mutation, layout four→two→four archive restore, invalid
composition non-mutation, and destroy cleanup. Multiple Widget instances remain
covered by existing `widget.spec.ts` isolation tests.

## Tests and exact counts

| Suite | Result |
| --- | --- |
| `npm run build` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS — **392/392** Node tests (includes new composition integrity file) |
| `npm run test:browser` | PASS — **46 passed**, **2 skipped** (mobile-only cases) |
| Focused Widget Chromium (`widget*.spec.ts` + datafeed integrity) | PASS within browser suite |
| Mobile Chrome Widget subset | PASS — **7 passed**, **6 skipped** (desktop-only integrity/layout cases) |
| `npm run test:react:browser` | PASS — **38/38** when run with `--workers=1`; under default parallelism one Studio a11y dialog assertion can flake and passes on isolated retry |
| `npm run test:react:production` | PASS — **1/1** |
| `npm run package:smoke` | PASS |
| `npm run package:check` | PASS |
| `npm run distribution:check` | PASS |
| `npm run studio:check` | PASS |
| `npm run api:inventory` | PASS — 319 runtime / 736 type exports |
| `npm run api:diagnostics` | PASS_ADDITIVE_REVIEW_REQUIRED (no new Widget public exports) |
| `npm run api:check` | OPEN/FAIL — inherited `Chart` / `WorkspaceDocument` / `WorkspaceRestoreOptions` |
| `npm run stress:ci` | PASS — zero remaining canvases |
| `npm run benchmark:widget` | PASS |
| `npm run benchmark:browser` | PASS |
| `npm run benchmark:multi-chart` | PASS |

New automated coverage:

- `tests/widget-composition-integrity.test.ts` — canonical IDs, NaN/Infinity,
  hostile prototypes/cycles/keys, watchlist/workspace rejection.
- `tests/browser/widget-datafeed-integrity.spec.ts` — resolve/getBars/subscribe,
  append/correction, rapid replace, failure identity, pending diagnostics,
  multi-chart isolation, composition rejection without silent mutation.

## Performance measurements

Environment: HeadlessChrome `156.0.0.0` on Linux x86_64. Figures are local and
not universal guarantees.

### Widget benchmark (`npm run benchmark:widget`)

| Candles | createMs | replaceMs | datafeedTransitionMs | destroyMs | pending after destroy | remaining Widget canvases |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| 1k | 9.8 | 4.1 | 13.7 | 0.6 | false | 0 |
| 10k | 14.2 | 9.6 | 32.9 | 0.2 | false | 0 |
| 100k | 118.8 | 79.1 | 288.0 | 0.3 | false | 0 |

### Multi-chart benchmark (`npm run benchmark:multi-chart`)

| Scenario | loadMs | crosshair median/p95 ms | remaining owned canvases |
| --- | ---: | --- | ---: |
| single-100k | 109.3 | 0 / 0 | 0 |
| dual-10k | 8.2 | 0.2 / 0.6 | 0 |
| dual-100k | 157.7 | 2.2 / 2.7 | 0 |

### Browser Canvas2D (`npm run benchmark:browser`)

| Candles | loadMs |
| --- | ---: |
| 1k | 10.9 |
| 10k | 66.5 |
| 100k | 903.1 |

No actionable Widget Datafeed performance regression was characterized beyond
normal 100k transition cost. Destroy paths clear pending diagnostics and owned
canvases.

## Resource-cleanup evidence

- Widget destroy: zero owned canvases, zero style elements, pending=false.
- Stress CI browser profile: remaining canvases 0 after destroy cycles.
- Multi-chart benchmark: remainingOwnedCanvases 0 for all reported scenarios.
- Slot destroy explicitly stops Datafeed before Chart destruction.

## Existing and newly discovered limitations

- Archived charts restore Workspace only; hosts must re-inject Datafeed.
- Composition does not persist comparison asset candles.
- Best-effort rollback after a mid-apply failure is not a full multi-resource
  transaction manager.
- Studio a11y dialog focus test can flake under default Playwright parallelism;
  passes serially / on retry (environmental, not a Widget Datafeed defect).
- Firefox, WebKit, Mobile Safari, physical devices, formal WCAG/AT, CSP,
  licensing, and publication remain OPEN.

## Open API, browser, accessibility, CSP, and release gates

| Gate | Status |
| --- | --- |
| `api:check` inherited Chart / WorkspaceDocument / WorkspaceRestoreOptions | OPEN/FAIL |
| Public Widget API / `@openkline/widget` | NOT AUTHORIZED |
| Firefox / WebKit / Mobile Safari | OPEN |
| Physical devices | OPEN |
| Formal assistive technology / WCAG certification | OPEN |
| Restrictive CSP distribution | OPEN |
| npm publication / GitHub release / tags / license | OPEN |

No protected API baseline files were modified. No new public Widget exports
were added.

## Exact Conventional Commit SHAs

Filled after Git delivery:

| Commit | Role |
| --- | --- |
| `204ff6164ce01c3fa0a94f7e925a9ad0c82711b9` | Implementation + tests |
| `e5d021444eb9a28149e325716b96b2577d676745` | Documentation |
| `6887b45d170188fb00bf71e63bbf5ed07880ff54` | Documentation SHA finalization |

## Final branch / remote synchronization status

Filled after push:

| Check | Value |
| --- | --- |
| Author / committer | `Akira Yuzai <yuzai.akira@gmail.com>` |
| Implementation SHA | `204ff6164ce01c3fa0a94f7e925a9ad0c82711b9` |
| Documentation SHA | `e5d021444eb9a28149e325716b96b2577d676745` |
| `HEAD == origin/main` | Verified after push |
| Working tree | Clean after delivery |
| Force push / history rewrite | Not used |

## Final status

`PHASE 16.4.2.1 — DATAFEED & COMPOSITION INTEGRITY HARDENING COMPLETE / VERIFIED INTERNALLY — PUBLIC WIDGET API NOT AUTHORIZED`
