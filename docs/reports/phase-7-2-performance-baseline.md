# Phase 7.2 performance baseline and regression investigation

Verification date: 2026-10-25 (UTC)

## Environment and method

The comparison used the same repository, Linux x64 environment, Node.js
v24.19.0, Playwright 1.64.1, system Chromium 154.0.8037.57 at
`/usr/bin/chromium`, a 1,200 × 520 viewport, headless mode, `--disable-gpu`,
and `--js-flags=--expose-gc`. The existing deterministic Canvas2D workload was
used unchanged: 1,000/10,000/100,000 candles, four indicators, two drawings,
navigation, 100 append updates, five historical corrections, crosshair events,
and a 30-frame update loop.

The first two runs against commit `2d6f8be` reproduced the reported instability
but also exposed the regression. At 100,000 candles they measured 49.98 and
50.23 FPS, with frame-work p95 of 11.1 and 22.5 ms and append/update averages
of 11.027 and 18.132 ms. These values were slower than the Phase 7.0
observation of 62.81 FPS, 1.043 ms append/update, and 1.6 ms frame-work p95.

## Root cause

Phase 7.1 changed `ChartModel.getLatestCandleTime()` to read
`this.allCandles.at(-1)`. `allCandles` is a defensive full-history snapshot;
therefore every ordinary `Chart.update()` copied the complete primary candle
history before deciding whether the incoming point was an append or a
correction. At 100,000 candles this created avoidable allocation and garbage
collection pressure on the hot append path. Replay masking was not the only
cause: the copy occurred while replay was inactive as well.

The independent profiler before the fix showed renderer and indicator work in
the expected range but did not attribute the full benchmark delay to the
visible-data, series, or indicator functions. The allocation was outside those
timed subcalls and was confirmed by the source diff and the per-update result.

## Corrective change

The smallest correction adds an optional cutoff-aware latest-time lookup to
`CandleStore` and `SeriesCollection`. `ChartModel.getLatestCandleTime()` now
uses that direct ordered-store lookup, preserving the replay cutoff while
avoiding a full defensive snapshot. The public snapshot and replay data
integrity boundaries are unchanged.

A regression test covers normal latest lookup, a finite replay cutoff, and an
empty replay prefix. No financial values, correction behavior, or future-data
protection were weakened.

## Before and after

The post-fix run was executed with the same benchmark command and environment.
Values are local observations, not product-wide performance guarantees.

| Candles | Before append/update | After append/update | Before frame-work p95 | After frame-work p95 | After rAF FPS |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 1.822 ms | 2.108 ms | 3.0 ms | 3.1 ms | 65.23 |
| 10,000 | 1.487 ms | 0.997 ms | 11.6 ms | 2.1 ms | 61.60 |
| 100,000 | 11.027 / 18.132 ms | 1.033 ms | 11.1 / 22.5 ms | 2.2 ms | 62.07 |

The two pre-fix values for 100,000 are intentionally shown as a pair because
the benchmark was affected by runtime scheduling and garbage collection. The
post-fix value is close to the Phase 7.0 1.043 ms observation and the FPS is
within normal local-run variation of 62.81. The post-fix run observed 647.8 MB
heap before destroy, 2.07 MB after destroy and GC opportunity, and zero
remaining canvases; heap is allocation-sensitive and is not a release limit.

The post-fix profiler totals for the 30 instrumented updates were:

| Area | Total ms | Calls | Approx. average |
| --- | ---: | ---: | ---: |
| Visible data | 4.1 | 60 | 0.068 ms |
| Renderer | 37.2 | 30 | 1.240 ms |
| Series update | 4.3 | 300 | 0.014 ms |
| Collection update | 3.4 | 300 | 0.011 ms |
| Store update | 2.9 | 300 | 0.010 ms |
| Indicators | 6.3 | 120 | 0.053 ms |

## Replay-active measurements

The replay benchmark was rerun after the fix. It continued to restore the
original data length for every scenario and reported zero canvases after every
destroy. Current local observations include:

| Candles | Scenario | Step p50/p95 ms | Seek p50/p95 ms | Exit ms | Heap before destroy |
| ---: | --- | ---: | ---: | ---: | ---: |
| 1,000 | One indicator | 1.5 / 3.2 | 1.8 / 2.6 | 10.7 | 7.6 MB |
| 1,000 | Multiple indicators | 1.7 / 2.5 | 3.7 / 6.2 | 12.2 | 10.5 MB |
| 10,000 | One indicator | 1.3 / 1.6 | 7.3 / 10.0 | 33.3 | 40.2 MB |
| 10,000 | Multiple indicators | 1.4 / 2.1 | 25.3 / 32.7 | 68.4 | 57.6 MB |
| 100,000 | One indicator | 2.7 / 10.0 | 62.4 / 115.3 | 484.1 | 163.8 MB |
| 100,000 | Multiple indicators | 3.0 / 8.3 | 513.7 / 934.6 | 2,047.6 | 303.7 MB |
| 100,000 | KlineScript | 24.1 / 29.9 | 88.4 / 223.0 | 479.9 | 362.9 MB |

The higher arbitrary-seek and exit values vary materially between local runs;
they remain full-prefix/correction-safe paths. KlineScript replay still
recalculates the visible prefix and is not described as constant-time. The
ordinary append fix does not claim to optimize those paths.

## Verification status

- `npm run typecheck && npm test`: passed, 67 Node tests.
- `npm run benchmark:browser`: passed after the fix with the measurements
  above.
- `npm run profile:browser`: passed and confirmed the expected hot-path
  distribution after the fix.
- `npm run benchmark:replay`: passed with restored lengths and zero canvases.
- No system browser substitution, TLS bypass, GitHub Actions, package
  publication, release tag, license change, or history rewrite was used.

The verified inactive-replay regression is fixed. Remaining performance work is
alert-specific benchmarking and, if needed, a separately measured KlineScript
incremental replay design; neither is silently folded into the ordinary append
claim.
