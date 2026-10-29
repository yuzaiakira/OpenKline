# Phase 8.12.1 Synchronization Hardening Verification

Date: 2026-10-30  
Branch: `phase-8.12.1-sync-hardening`  
Starting SHA: `cde427846a8149390f7d63e7ef546b61814de6b1`  
Behavioral implementation SHA: `fe31222f677053a9a68f1deee06e08a1580c85d2`  

This increment started from the latest `origin/main` and preserves the merged
Phase 8.12 architecture. It focuses on synchronization correctness and
measured Canvas2D responsiveness. It does not claim a cross-browser or
physical-device result.

## Correctness defect and root cause

The defect reproduced with two registered charts:

1. Chart A forwarded crosshair/range T1 to B.
2. B moved independently to T2 and forwarded T2 to A.
3. A moved back to T1.

Before the fix, B's `lastCrosshair`/`lastVisibleRange` entry still contained
the old forwarded T1 value. Deduplication therefore suppressed the final
valid T1 update. The same stale-target problem occurred when navigation took
place while synchronization was disabled and then synchronization was
re-enabled.

The fix is intentionally narrow:

- Independent target events invalidate only that target's relevant channel
  cache before propagation.
- Events generated during controller propagation remain protected by the
  existing reentrancy guard and do not invalidate the forwarding cache.
- Explicit synchronization also invalidates the source channel cache.
- Data/replay invalidation, removal, destruction, and idempotent disposal are
  preserved.

## Regression evidence

Added Node and real Chromium coverage for:

- A→B→A bidirectional crosshair alternation.
- A→B→A visible-range alternation.
- Independent crosshair/range changes while disabled followed by re-enable.
- Existing data/replay invalidation, missing timestamps, cleanup, and chart
  destruction paths.

The pre-fix focused Node run reproduced two failures and passed four existing
tests. After the fix, the synchronization suite passed `6/6`; the real
Chromium synchronization suite passed `2/2` and verified the public Chart
viewport event remains index-based while synchronization remains UTC-based.

## Performance investigation

The diagnostic profiler measures source-only, target-only, controller-only,
linked, and rapid alternating operations. It also writes a Playwright trace
archive. Final trace:

`/tmp/openkline-phase-8-12-1-multi-chart-trace.zip`

The profile showed that large crosshair latency was not controller iteration
or UTC matching. It came from redrawing a large visible Canvas2D dataset for a
transient crosshair. Visible-range latency remains dominated by the required
full chart render when tens of thousands of bars are made visible.

## Targeted performance changes

- `ChartModel` now reuses a validated visible-data snapshot until data,
  viewport, pane, style, replay, or series state changes.
- Time-range navigation reuses a model-owned UTC time-axis snapshot instead of
  cloning the complete cached axis for every range request.
- `CanvasRenderer` retains the current render geometry and can draw only the
  transient crosshair/tooltip layer.
- `Chart` keeps a base frame only when needed, restores it for crosshair-only
  updates, and uses full rendering when data, viewport, drawings, or layout
  actually changed. Lazy capture avoids adding the frame-copy cost to ordinary
  append updates.
- No financial data is mutated, no UTC conversion is delayed, and no WebGL or
  Canvas2D architecture rewrite was introduced.

## Before and after measurements

Environment: system Chromium 154, headless, `--disable-gpu`, 1,440×900, two
real Chart instances, deterministic 100k-candle fixtures. Values are local
observations, not universal guarantees.

| Scenario | Baseline crosshair median/p95 | Final crosshair median/p95 | Baseline range median/p95 | Final range median/p95 |
|---|---:|---:|---:|---:|
| Dual 10k | 8.3 / 12.6 ms | 1.4 / 2.1 ms | 7.7 / 10.1 ms | 17.2 / 24.1 ms |
| Dual 100k | 179.0 / 277.4 ms | 5.5 / 6.1 ms | 163.0 / 230.6 ms | 154.2 / 170.7 ms |

The 10k range result varies with browser scheduling and includes the new
base-frame/Canvas2D path; it is not presented as an improvement. The 100k
range result improved modestly, but remains render-bound. The crosshair
improvement is the material result of the targeted overlay change.

Final profile component observations for the wide dual-100k workload:

| Operation | Median | p95 |
|---|---:|---:|
| Source crosshair only | 0.3 ms | 0.7 ms |
| Target crosshair only | 0.2 ms | 0.4 ms |
| Controller + target crosshair | 0.3 ms | 0.5 ms |
| Linked crosshair | 0.2 ms | 0.4 ms |
| Source visible range | 70.7 ms | 101.5 ms |
| Target visible range | 72.4 ms | 87.7 ms |
| Controller + target range | 74.2 ms | 110.8 ms |
| Linked visible range | 156.9 ms | 182.1 ms |
| Rapid alternating crosshair | 4.5 ms | 5.4 ms |

The existing single-chart benchmark on the final code measured 100k-candle
`61.89 FPS`, `16.7/17.0 ms` frame median/p95, and zero canvases after destroy.
Memory was `629,753,290` bytes before destruction and `2,979,063` bytes after
the GC opportunity. These are browser observations, not leak proofs or
portable limits.

## Verification matrix

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm test` | 192 passed, 0 failed |
| `npm run api:check` | PASS; no removals or changed public signatures |
| `npm run package:smoke` | PASS; local tarball installed/imported as ESM |
| `npm run distribution:check` | PASS; 398 files, no problems |
| `npm run studio:check` | PASS; core remains framework-independent |
| `npm run stress:ci` | PASS; zero orphan failures and zero remaining canvases |
| `npm run test:browser` | 22 passed on system Chromium |
| `npm run test:react:browser` | 28 passed on system Chromium |
| `npm run benchmark:multi-chart` | PASS; dual 10k/100k and cleanup |
| `npm run benchmark:browser` | PASS; 1k/10k/100k and cleanup |
| `npm run profile:multi-chart` | PASS; component profile and trace archive |
| `npm run test:browser:compat` | Not run; managed Firefox/WebKit/mobile artifacts unavailable |

The final Node suite includes all prior datafeed, replay, indicator, drawing,
worker, and lifecycle coverage. The final standalone browser suite includes
RTL, replay, datafeed, cleanup, and synchronization paths. React/Studio
coverage includes desktop/mobile layouts, crosshair/range sync, workspace
state, and lifecycle behavior.

## Resource and compatibility status

All final browser stress and multi-chart runs reported zero remaining owned
canvases. Controller listeners are removed on chart destruction/removal, and
the base frame is cleared during Chart destruction.

The managed cloud environment can run system Chromium but cannot access the
official Playwright-managed Firefox, WebKit, Mobile Chrome, or Mobile Safari
artifacts. The supported artifact path previously returned:

```text
error pulling image configuration: download failed after attempts=6: Forbidden
```

No TLS bypass or arbitrary browser substitution was used. Previous five-browser
evidence does not certify this changed SHA.

## Manjaro-host verification handoff

Run the changed behavioral SHA on a trusted host with the official pinned
Playwright environment:

```bash
git fetch origin phase-8.12.1-sync-hardening
git checkout fe31222f677053a9a68f1deee06e08a1580c85d2
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run test:browser:compat
```

Record browser versions, managed Playwright availability, test counts, and
the complete evidence archive separately. This handoff is required before
claiming Firefox/WebKit/mobile compatibility for Phase 8.12.1.

## Git and review status

- Correctness commit: `b589b0c` (pushed).
- Performance commit: `fe31222f677053a9a68f1deee06e08a1580c85d2` (pushed).
- Author and committer for both: `Akira Yuzai <yuzai.akira@gmail.com>`.
- No merge, release, npm publication, license change, or GitHub Actions was
  performed.
- PR URL: https://github.com/yuzaiakira/OpenKline/pull/new/phase-8.12.1-sync-hardening

Phase 8.12.1 is **implemented and locally verified**, but its managed
Firefox/WebKit/mobile and trusted-Manjaro evidence gates remain open.
