# Phase 16.5.3 — Multi-Chart Performance, Memory Lifecycle & Restore Benchmarking

## 1. Executive summary

Phase 16.5.3 delivers reproducible multi-chart lifecycle benchmarks, collision-safe
imported workspace IDs, Studio resource-ownership hardening, and deterministic
regression coverage. Measured bottlenecks justified focused lifecycle fixes
(active-panel snapshot publication, sync registration pruning/disposal, import ID
allocation) rather than an architectural rewrite. Public Widget API and public
release remain **NOT AUTHORIZED**.

## 2. Starting repository state

| Item | Value |
|---|---|
| Branch | `main` |
| Starting HEAD | `b72157dc51f747ea3a1bfc66e6b3749e5c51f817` |
| Working tree | Clean before implementation |
| Remote-tracking | `origin/main` → `de33bb076b6bccd8f5e278e1f5c3998b77e21cb8` |
| Local ahead | 2 commits (16.5.2 implementation + docs) |

## 3. Performance benchmark architecture

| Script | Host | Workload |
|---|---|---|
| `npm run benchmark:multi-chart-lifecycle` | Chromium + `serve-example` / `dist` ESM | 1/2/4 charts × 10k bars × 8 drawings |
| `npm run benchmark:studio-lifecycle` | Chromium + production Next Studio | Supported layouts, save/restore, dispose cycles |
| Existing `benchmark:multi-chart` / `benchmark:studio` | Unchanged | Prior baselines retained |

Methodology notes: `performance.now()`; median + p95; warm-up discarded for Studio
layout samples; optional `globalThis.gc` when Chromium is launched with
`--js-flags=--expose-gc`. Timing thresholds are **not** wired into shared CI.

## 4. Test environment

| Field | Value |
|---|---|
| OS | Linux x64 (Manjaro kernel host) |
| CPU | AMD Ryzen 9 7900X3D 12-Core Processor (24 threads) |
| RAM | ~31 GiB |
| Node.js | v24.19.0 |
| Browser | HeadlessChrome/156 (system `/usr/bin/chromium`) |
| Studio build mode | `next-production` (`.next-lifecycle-bench`) |
| Core Chart build mode | Repository `dist` ESM |

## 5. Workload definitions

- **Core Chart:** equal deterministic OHLCV per panel; 8 horizontal-line drawings;
  crosshair + visible-range sync enabled; serialize/restore of live workspaces;
  mount/dispose cycles with sync controllers.
- **Studio:** deterministic demo seed (~120 bars/panel default); layouts
  `single` / `two-horizontal` / `four-grid` only (8-panel unsupported); sync
  crosshair + visible range during restore cycles; idle replay.
- Network: no live third-party data providers.

## 6. Baseline measurements (core Chart lifecycle)

| Panels | Load median-ish (ms) | Crosshair median (ms) | Visible-range median (ms) | Serialize median (ms) | Restore median (ms) | Dispose-cycle median (ms) | Sync leak cycles | Remaining canvases |
|---|---|---|---|---|---|---|---|---|
| 1 | 20.3 | 0.2 | 0.1 | 1.3 | 4.3 | 3.0 | 0 | 0 |
| 2 | 22.1 | 0.1 | 0.2 | 1.0 | 7.2 | 5.0 | 0 | 0 |
| 4 | 38.2 | 0.3 | 0.3 | 2.2 | 15.0 | 10.0 | 0 | 0 |

Samples: 30 sync iterations; 20 serialize/restore; 8 dispose cycles; 10k bars; 8 drawings/panel.

## 7. Multi-panel scaling results (Studio production)

Layout transition from `single` (after warm-up), n=4:

| Layout | Panels | Median (ms) | p95 (ms) | Min / Max (ms) | Final panels | Visible canvases |
|---|---|---|---|---|---|---|
| single | 1 | 8.6 | 18.6 | 7.0 / 18.6 | 1 | 2 |
| two-horizontal | 2 | 36.9 | 38.6 | 33.4 / 38.6 | 2 | 3 |
| four-grid | 4 | 75.4 | 80.9 | 67.3 / 80.9 | 4 | 5 |

Layout dispose cycle (four-grid → single), n=4: median **83.4 ms**, p95 **97.8 ms**.

Scaling observation: Studio layout cost grows roughly with panel construction,
not with an unexpected quadratic fan-out in the measured sync path.

## 8. Workspace save/restore timing (Studio)

| Operation | Samples | Median (ms) | p95 (ms) | Min / Max (ms) |
|---|---|---|---|---|
| Save (four-panel, localStorage) | 4 | 45.0 | 50.4 | 45.0 / 50.4 |
| Restore to chart readiness (`data-workspace-restore-panels="4"`) | 4 | 139.1 | 161.8 | 135.0 / 161.8 |

Document stats for the saved four-panel desk: ~732 KB collection JSON, 4 panels,
8 indicators, 0 drawings in the benchmark desk (drawings covered separately by E2E).

## 9. Memory lifecycle measurements

### Core Chart

- Sync registration leak counter across dispose cycles: **0**.
- Remaining owned canvases after destroy: **0**.
- `performance.memory` before/after destroy often unchanged in this Chromium build
  → classified **Inconclusive memory measurement** for absolute heap; resource
  counts are authoritative.

### Studio restore cycles

Chromium `performance.memory` heap trend across New → restore (1→4 panels):

| Cycle | Heap before (MB) | Heap after (MB) | Δ (MB) | Panels | Canvases |
|---|---|---|---|---|---|
| 1 | 12.41 | 15.20 | +2.79 | 4 | 5 |
| 2 | 13.88 | 16.57 | +2.69 | 4 | 5 |
| 3 | 15.21 | 17.85 | +2.64 | 4 | 5 |
| 4 | 16.51 | 19.18 | +2.67 | 4 | 5 |

Classification: **Suspicious memory growth** in JS heap across cycles (~+1.3 MB
per New baseline) while panel/canvas counts remain correct. **Not** claimed as an
observed retained-resource defect; GC and host caches may contribute. Sync
registrations are pruned when panels leave the live set.

## 10. Resource and subscription ownership

| Resource | Owner | Disposal |
|---|---|---|
| `Chart` instance + canvases | React `FinancialChart` / panel | Unmount → `chart.destroy()` |
| Sync registrations | Studio `ChartSynchronizationController` | `chartDestroy`, panel-set prune, explicit `removeChart`, host unmount `destroy()` |
| Panel snapshots (UI) | Active-panel React state + ref cache | Cleared on workspace replace / panel removal |
| Session-archived panel workspaces | `archivedPanelsRef` | Cleared on New; restored on layout expand |
| Comparison datafeed | Active-panel effect | Effect cleanup `dispose()` |
| Replay | Panel-local | Exit / unmount dispose |
| Object Tree / drawing selection | Active panel chart | Transient; cleared on restore |

Drawings remain panel-local; sync forwards UTC crosshair/visible-range only.

## 11. Verified bottlenecks / defects

1. **Import ID collision risk** — `imported-${Date.now()}` could collide within
   the same millisecond and overwrite after the previous guard only when ids
   matched exactly after generation.
2. **Inactive-panel snapshot fan-in** — every panel `publish()` updated parent
   React state, forcing full Studio re-renders during multi-panel churn.
3. **Sync registration survival** — panel-set changes and Studio unmount needed
   explicit prune/destroy beyond relying solely on `chartDestroy` ordering.

No evidence justified rewriting Chart synchronization policy or introducing a
global lifecycle manager.

## 12. Implemented fixes

1. `allocateStudioWorkspaceImportId(existingIds, nowMs?)` — `imported-{stamp}-{seq}`
   with occupied-set scanning; wired into Studio import finalize.
2. Active-panel-only snapshot React state; restore readiness driven by
   `panelReadyEpoch`.
3. Sync controller: prune removed panel ids; destroy on Studio unmount; remove on
   explicit panel deletion.
4. Benchmark harnesses + lifecycle/unit/browser regression coverage.

## 13. Before/after comparisons

| Change | Comparable evidence |
|---|---|
| Import ID allocation | Deterministic unit + browser collision tests (PASS). No timing claim. |
| Snapshot publication | Behavioral: inactive panels no longer `setState` the Studio shell. No fabricated render-ms delta (pre-change counter absent). |
| Sync prune/destroy | Unit cycle test + browser layout dispose counts (PASS). |

Core/Studio timing tables above are **post-fix baselines** for future comparisons.

## 14. Imported workspace ID collision assessment

- Pre-fix: `imported-${Date.now()}` — collision possible at identical ms.
- Post-fix: sequence suffix + occupied-id scan; finalize still assigns a new host id.
- Existing stored ids preserved; document schema unchanged.
- Coverage: unit (`allocateStudioWorkspaceImportId…`) + browser rapid triple import.

## 15. Added performance/lifecycle regression tests

- `tests/studio-workspace-import.test.ts` — unique import ids under identical timestamps
- `tests/synchronization.test.ts` — repeated 4-panel create/dispose without stale forwarding
- `tests/react-browser/multi-chart-studio.spec.ts` — layout dispose cycles, restore loops, import id uniqueness

## 16. Browser results

| Suite | Result |
|---|---|
| React Chromium (`test:react:browser`) | **67/67 PASS** |
| Focused multi-chart Studio spec | **17/17 PASS** |
| Firefox | **NOT TESTED** (managed binary often unavailable) |
| WebKit | **NOT TESTED** |
| Physical devices / formal WCAG | **OPEN** (unchanged) |

## 17. Standard regression verification

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm test` | **404/404 PASS** |
| `npm run api:check` | PASS (additive `allocateStudioWorkspaceImportId` only) |
| `npm run studio:check` | PASS |
| `npm run package:smoke` | PASS |
| `npm run distribution:check` | PASS |
| `npm run stress:ci` | PASS |
| `npm run benchmark:multi-chart-lifecycle` | PASS (observational) |
| `npm run benchmark:studio-lifecycle` | PASS (observational) |
| `npm run test:react:browser` | 67/67 PASS |

## 18. API and security compatibility

- Additive Studio helper export only; baseline not rewritten.
- CSP unchanged; no unsafe dynamic code; benchmarks stay script/test scoped.
- Public Widget API **NOT AUTHORIZED**.

## 19. Known measurement limitations

- Chromium-only heap API; Firefox/WebKit memory observability not claimed.
- Studio production warm-up excludes first-compile noise; cold Next compile is separate.
- Absolute heap equality after destroy is inconclusive without forced full GC.
- Visible canvas counts may include non-panel canvases on the Studio page shell.
- Emulation ≠ physical mobile verification.

## 20. Deferred improvements

- Deeper heap retainer analysis for Studio restore-cycle growth (devtools allocation timeline).
- Optional inactive-panel render isolation beyond snapshot publication.
- Firefox/WebKit lifecycle parity when managed browsers are available.
- Formal AT / physical / WCAG campaigns (unchanged OPEN gates).

## 21. Git delivery

Local commits only for implementation, benchmarks, and documentation. No push,
no tags, no history rewrite, no Cursor co-author trailer.
