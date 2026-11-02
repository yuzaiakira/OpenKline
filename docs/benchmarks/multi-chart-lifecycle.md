# Multi-chart lifecycle benchmarks

Observational baselines for Phase 16.5.3. These scripts are **not** CI timing
gates; use them to compare environments and catch lifecycle regressions via
resource counts.

## Commands

```bash
npm run benchmark:multi-chart-lifecycle
npm run benchmark:studio-lifecycle
```

Optional workload knobs:

| Variable | Default | Applies to |
|---|---|---|
| `OPENKLINE_MULTI_CHART_BARS` | `10000` | Core Chart lifecycle |
| `OPENKLINE_MULTI_CHART_DRAWINGS` | `8` | Core Chart lifecycle |
| `OPENKLINE_MULTI_CHART_ITERS` | `40` | Sync sample count |
| `OPENKLINE_MULTI_CHART_DISPOSE_CYCLES` | `10` | Mount/dispose loops |
| `OPENKLINE_STUDIO_LIFECYCLE_CYCLES` | `6` | Studio layout cycles |
| `OPENKLINE_STUDIO_RESTORE_ITERS` | `5` | Studio save/restore samples |

## Harnesses

### `benchmark:multi-chart-lifecycle`

Chromium + vanilla `serve-example` against built `dist` ESM.

- Panel counts: **1 / 2 / 4** (Studio-supported; 8-panel layouts are not forced)
- Equal bar and drawing workloads per panel
- Crosshair and visible-range sync fan-out cost
- Workspace serialize / restore on live charts
- Dispose cycles with sync registration leak counter
- `performance.now()` medians and p95; optional `performance.memory`

### `benchmark:studio-lifecycle`

Production Next.js Studio host (same distDir pattern as React Playwright).

- Layout transitions: single → two-horizontal → four-grid
- Four-panel Save / restore readiness (`data-workspace-restore-panels`)
- Layout dispose cycles back to a single panel
- Chromium heap trend across restore cycles (engine-specific)

## Memory classification vocabulary

| Label | Meaning |
|---|---|
| Verified cleanup behavior | Subscriptions / canvases / sync ids return to expected baselines |
| Expected cache retention | Intentional session archives or host caches |
| Suspicious memory growth | Heap climbs across cycles without a proven retainer |
| Inconclusive memory measurement | Missing `performance.memory`, noisy GC, or mismatched configs |
| Observed retained-resource defect | Concrete ownership leak with a failing assertion |

Do not treat a stable absolute heap size as “zero leaks.”
