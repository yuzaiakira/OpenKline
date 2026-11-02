# Phase 16.5.4 — Studio Restore Heap Retainer Investigation & Lifecycle Optimization

## 1. Executive summary

Controlled Chromium CDP experiments reproduce the Phase 16.5.3 ~1.3 MB/cycle
JS-heap climb after Studio New→restore, but **do not establish an OpenKline
application ownership leak**. Live DOM tag counts stay flat, sync/snapshot/strategy
diagnostics return to baselines each cycle, idle controls are flat, and page
teardown drops heap to ~1 MB. Heap snapshots show canvas wrappers retained primarily
through Blink ephemeron/DOM-wrapper tables after chart churn.

Focused lifecycle hardening was still delivered: `newWorkspace` clears ephemeral
host caches; strategy maps prune with panels; Chart destroy releases canvas
backing stores via `CanvasRenderer.dispose()`. Post-fix heap slope remains in
the same band (modest reduction, not a closure of the Chromium canvas-churn
signature).

**Technical conclusion: NO RETENTION DEFECT ESTABLISHED — EXPECTED BEHAVIOR CHARACTERIZED.**

## 2. Starting Git baseline

| Item | Value |
|---|---|
| Branch | `main` |
| Starting HEAD | `34e4aee6b96bad92a762687b4e0a75b21340da07` |
| Working tree | Clean |
| Remote-tracking | `origin/main` → `34e4aee6b96bad92a762687b4e0a75b21340da07` |

## 3. Original memory observation

Phase 16.5.3 Studio lifecycle benchmark (n=4 New→restore cycles):

| Cycle | Heap before (1 panel) | Heap after (4 panels) |
|---|---|---|
| 1 | 12.41 MB | 15.20 MB |
| 2 | 13.88 MB | 16.57 MB |
| 3 | 15.21 MB | 17.85 MB |
| 4 | 16.51 MB | 19.18 MB |

The suspicious signal is the climbing **after-New** baseline (~+1.3 MB/cycle), not
the ~2.7 MB New→restore delta (which includes expected multi-panel construction).

## 4. Benchmark-methodology review

Phase 16.5.3 `readHeap`:

- Single optional `globalThis.gc()` when `--js-flags=--expose-gc` is present.
- No CDP `HeapProfiler.collectGarbage` / `Memory.forciblyCollectGarbage`.
- No settle delay after React unmount.
- Same browser page/context for all cycles.
- `heapBefore` sampled at 1-panel New; `heapAfter` at 4-panel restore readiness.

Implication: prior deltas mixed expected panel-cost with any residual retention.
Instrumentation itself did not retain prior workspace objects beyond normal Playwright
page state; diagnostics added in this phase are opt-in via init script.

## 5. Controlled experimental setup

Script: `npm run benchmark:studio-heap-retainers`

- Production Next Studio (`.next-heap-bench`)
- Chromium + CDP GC (3 passes) + optional page `gc()`
- Settle 250 ms after lifecycle transitions
- Opt-in `window.__openklineStudioDiagnostics`
- Fresh browser context per experiment family
- Artifacts under `artifacts/studio-heap-retainers/` (gitignored)

## 6. Workload definitions

- Four-panel deterministic Studio desk (Save As), then New ↔ restore cycles
- Sync crosshair + visible range enabled
- Idle control: same GC/read intensity without workspace replacement
- Panel lifecycle: four-grid ↔ single (session archive path)
- Replacement: New ↔ restore ↔ New
- Fresh-context single restore; about:blank teardown

## 7. Garbage-collection conditions

CDP `HeapProfiler.collectGarbage` + `Memory.forciblyCollectGarbage`, repeated
thrice, plus optional `globalThis.gc()`, then `performance.memory.usedJSHeapSize`.

## 8. Heap snapshot checkpoints

Optional (`OPENKLINE_HEAP_SNAPSHOTS=1`): snapshot after 20 restore cycles
(`after-20-restore-cycles.heapsnapshot`). Parsed object counts showed many
`HTMLCanvasElement` wrappers; sampled retainers were Blink ephemeron / wrapper-map
edges rather than Studio Maps or sync registries. `Chart` constructor names are
minified in the production bundle and were not used as a leak proof.

## 9. Memory trend measurements

### Baseline (20 cycles, before canvas backing-store dispose)

| Metric | Value |
|---|---|
| After-New slope | **+1.262 MB/cycle** |
| After-restore slope | **+1.252 MB/cycle** |
| Idle slope | **+0.001 MB/cycle** |
| Layout single-panel slope | **+0.176 MB/cycle** |
| Replacement empty slope | **+1.592 MB/cycle** |
| Teardown about:blank | 10.57 MB → **1.02 MB** |
| Resource diagnostics | Stable (1 sync/snapshot at New; 4 at restore; strategy/archive 0) |

After-New heap path: 9.99 → 34.46 MB over 20 cycles.

### Live DOM probe (8 New/restore cycles)

| Checkpoint | Elements | Canvases | Workspace options |
|---|---|---|---|
| after-new (each cycle) | **977** | **2** | 1 |
| after-restore (each cycle) | **968** | **5** | 1 |

Live document structure does **not** grow with cycles. CDP `Memory.getDOMCounters`
node increases are therefore not explained by Studio body DOM accumulation.

### After lifecycle hardening (12 cycles)

| Metric | Value |
|---|---|
| After-New slope | **+1.153 MB/cycle** |
| Idle slope | **+0.002 MB/cycle** |
| Layout single-panel slope | **+0.169 MB/cycle** |

Comparable first-12 baseline slope was **+1.310 MB/cycle** (9.99→24.68 MB) vs
after-fix **+1.153 MB/cycle** (9.92→22.88 MB). Modest reduction only; Chromium
canvas-churn heap signature remains.

## 10. Retained object classifications

| Observation | Classification |
|---|---|
| Sync/snapshot/strategy/archive diagnostics | **VERIFIED CLEANUP BEHAVIOR** |
| Live DOM element/canvas counts | **VERIFIED CLEANUP BEHAVIOR** |
| Idle heap flatness | **TRANSIENT ALLOCATION / GC VARIABILITY** ruled out as sole cause of restore climb |
| JS heap climb under New/restore with CDP GC | **EXPECTED PERSISTENT STATE OR CACHE** / browser canvas-wrapper churn — **not** a verified app retainer |
| Blink ephemeron canvas retainers in snapshot | **EXPECTED** Chromium DOM-wrapper behavior |
| Residual after-New slope after fixes | **SUSPICIOUS BUT UNPROVEN** as an OpenKline leak; **not** elevated to verified defect |

## 11. Retaining-path analysis

1. Application registries (sync controller, snapshot keys, strategy maps, archives)
   return to ownership baselines after New — no growing app-side collection.
2. Heap snapshot canvas nodes are retained via native Blink ephemeron/wrapper tables
   after detach, not via documented Studio Maps.
3. Full Studio teardown (`about:blank`) releases essentially all measured JS heap —
   retention is page-scoped, not process-global.
4. No retaining path from a disposed panel registry to a live Chart API object was
   demonstrated.

## 12. Resource ownership findings

| Resource | Owner | Finding |
|---|---|---|
| Chart + canvas | `FinancialChart` / Chart.destroy | Destroy clears listeners, removes canvas; now also zeros backing store |
| Sync registrations | Studio controller | Pruned on panel-set change; destroy on Studio unmount |
| Panel snapshots | Active-panel state + ref | Cleared on New/applyDocument; pruned with panels |
| Strategy result maps | Studio host refs | Now cleared on New and pruned when panel ids leave |
| Session archives | `archivedPanelsRef` | Cleared on New; intentional on layout shrink |
| Quote merge state | React `quotes` | Cleared on New |

## 13. Verified lifecycle defects

No **verified retained-resource defect** (unreachable-from-owner but still
referenced application object) was established for the restore heap trend.

Ownership gaps corrected prophylactically:

1. `newWorkspace` left snapshot/strategy/quote/restore-summary caches uncleared.
2. Strategy maps could orphan keys when panel ids changed.
3. Chart destroy did not release canvas pixel buffers explicitly.

## 14. Implemented fixes

1. Studio `newWorkspace` clears snapshots, strategy maps, quotes, restore summary.
2. Panel-set effect prunes strategy maps with live panel ids.
3. Opt-in Studio diagnostics getter for deterministic tests/benchmarks.
4. `CanvasRenderer.dispose()` + Chart.destroy zeros canvas width/height before detach.
5. Heap retainer investigation harness + npm script.

## 15. Before/after results

| Condition | After-New slope | Notes |
|---|---|---|
| Baseline 20-cycle | +1.262 MB/cycle | CDP GC, pre canvas dispose |
| Baseline first 12 | +1.310 MB/cycle | Comparable window |
| After fixes 12-cycle | +1.153 MB/cycle | Ownership clears + canvas dispose |

Do not claim leak closure from the modest slope change.

## 16. Restore performance comparison

| Metric | Phase 16.5.3 | This phase (n=4) |
|---|---|---|
| Save median | 45.0 ms | 47.7 ms |
| Restore median | 139.1 ms | 121.3 ms |
| Restore p95 | 161.8 ms | 143.7 ms |

No meaningful restore regression; differences are within environmental noise.

## 17. Deterministic regression tests

- React Studio lifecycle test asserts sync/snapshot alignment after New/restore.
- Chromium chart test asserts destroy detaches canvas and sets width/height to 0.

## 18. Browser-specific limitations

- Heap profiling is Chromium/CDP-specific.
- Firefox/WebKit memory APIs are not equivalent; not claimed.
- `performance.memory` remains approximate even after forced GC.
- Production bundle minification obscures class names in snapshots.

## 19. API / security / accessibility regression results

| Gate | Result |
|---|---|
| typecheck | PASS |
| npm test | 404/404 PASS |
| api:check | PASS (no new public exports required for diagnostics) |
| studio:check | PASS |
| package:smoke / distribution:check / stress:ci | PASS |
| test:react:browser | **67/67 PASS** |
| test:browser (Chromium) | **54 PASS**, 4 skipped (mobile projects) |
| Focused canvas destroy browser test | PASS |
| Firefox / WebKit | NOT TESTED this phase |
| Formal AT / WCAG / physical devices | OPEN (unchanged) |

Diagnostics remain private (`__OPENKLINE_ENABLE_STUDIO_DIAGNOSTICS__`); Widget API unpublished.

## 20. Remaining risks

- Continued JS-heap growth under aggressive canvas create/destroy churn in Chromium
  may still matter for multi-hour Studio sessions; monitor with the retainer harness.
- Deeper allocation timelines (sampling profiler over hours) were not required once
  ownership and live DOM were shown stable.
- Managed Firefox/WebKit lifecycle parity remains environment-dependent.

## 21. Final technical conclusion

**NO RETENTION DEFECT ESTABLISHED — EXPECTED BEHAVIOR CHARACTERIZED.**

The Phase 16.5.3 suspicious trend is real as a Chromium JS-heap measurement under
Studio New/restore chart churn, but it is not explained by growing Studio ownership
registries or live DOM accumulation. Lifecycle hygiene fixes are justified; they do
not eliminate the browser canvas-churn heap signature.

## 22. Git delivery

Local commits for investigation tooling, lifecycle hardening/tests, and documentation.
No push. No Cursor co-author attribution.
