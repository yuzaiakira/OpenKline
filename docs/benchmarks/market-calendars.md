# Market-calendar benchmark

Command:

```bash
npm run benchmark:calendar
```

The benchmark uses Node.js `v24.19.0` on the managed Cloud Linux host
(`INTEL(R) XEON(R) PLATINUM 8573C`, Linux x64) with a deterministic
`America/New_York` calendar. The fixture has weekday 09:30–12:00 and
13:00–16:00 segments, a documented early close, and a documented holiday. It
is not an exchange-authoritative schedule.

Each size/scenario runs in a fresh Node child process. The 1k and 10k cases
use five and three samples respectively, including a warm-up. The 100k case
uses one cold sample because full session observations retain source-time
evidence and repeated samples would make the harness a memory stress test.
Consequently, its p95 equals its single sample and is not a distributional
claim.

All values below are milliseconds, shown as `median / p95`:

| Operation | 1,000 | 10,000 | 100,000 |
| --- | ---: | ---: | ---: |
| Session enumeration | 16.496 / 17.184 | 86.586 / 102.711 | 834.726 / 834.726 |
| Expected-slot lookup | 14.684 / 17.244 | 85.108 / 86.463 | 856.598 / 856.598 |
| Calendar coverage slots | 14.864 / 15.639 | 89.792 / 90.091 | 808.936 / 808.936 |
| Session aggregation | 72.312 / 76.379 | 587.195 / 595.211 | 8,109.559 / 8,109.559 |
| Trading-week aggregation | 81.651 / 83.648 | 641.323 / 650.053 | 7,142.162 / 7,142.162 |
| Trading-month aggregation | 122.175 / 131.679 | 611.577 / 622.592 | 6,961.699 / 6,961.699 |
| Session SMA | 68.956 / 76.141 | 595.200 / 609.509 | 6,708.810 / 6,708.810 |
| Previous-session levels | 72.346 / 77.244 | 606.631 / 796.447 | 6,819.650 / 6,819.650 |
| Incremental append/read | 44.256 / 48.028 | 470.486 / 477.329 | 6,790.940 / 6,790.940 |
| Historical correction/read | 44.280 / 47.535 | 464.755 / 487.844 | 6,686.214 / 6,686.214 |
| As-of backward/forward seek | 66.672 / 72.350 | 700.730 / 725.789 | 10,690.589 / 10,690.589 |
| Calendar replacement/read | 70.719 / 74.690 | 592.891 / 602.137 | 6,830.416 / 6,830.416 |
| Dispose | 0.514 / 0.638 | 2.038 / 2.599 | 31.969 / 31.969 |

The final implementation reuses resolved calendar sessions while walking
sorted source candles and checks coverage with set membership rather than
repeated array scans. A focused 100k session-aggregation worker measured
approximately 7,058 ms after the cursor change; the final isolated matrix
measured 8,110 ms under different host load. These are local calculation
observations, not universal performance targets and not Canvas2D/FPS results.

DST boundary resolution was measured separately at 15.582 ms for the two
valid New York boundary fixtures. Calendar, aggregation, coverage, correction,
seek, replacement, and disposal correctness is covered by the Node test suite.
Chart overlay rendering and browser frame time remain covered by the existing
Chromium browser benchmark, not this Node calculation benchmark.

## Phase 11.5 remeasurement

The incremental index and single-segment calendar match were remeasured on the
same host and Node version at `2026-10-30T13:57:49.718Z`. Values are again
`median / p95` milliseconds; the 100k case is one cold sample.

| Operation | 1,000 | 10,000 | 100,000 |
| --- | ---: | ---: | ---: |
| Session enumeration | 14.757 / 15.111 | 84.948 / 85.309 | 807.664 / 807.664 |
| Expected-slot lookup | 14.342 / 14.839 | 85.439 / 88.843 | 815.652 / 815.652 |
| Calendar coverage slots | 13.649 / 15.214 | 87.968 / 90.621 | 861.663 / 861.663 |
| Session aggregation | 30.555 / 30.769 | 129.966 / 139.635 | 1,179.807 / 1,179.807 |
| Trading-week aggregation | 58.327 / 120.019 | 144.816 / 148.889 | 1,283.876 / 1,283.876 |
| Trading-month aggregation | 87.866 / 132.916 | 160.744 / 162.368 | 1,172.014 / 1,172.014 |
| Session SMA | 27.761 / 31.189 | 122.635 / 140.192 | 1,240.239 / 1,240.239 |
| Previous-session levels | 28.302 / 31.651 | 127.439 / 134.020 | 1,243.375 / 1,243.375 |
| Incremental append/read | 0.490 / 0.757 | 1.764 / 1.873 | 79.607 / 79.607 |
| Historical correction/read | 0.540 / 0.881 | 2.135 / 2.265 | 80.041 / 80.041 |
| As-of backward/forward seek | 0.377 / 0.510 | 2.271 / 2.291 | 85.820 / 85.820 |
| Calendar replacement/read | 39.369 / 45.021 | 199.810 / 203.484 | 2,050.928 / 2,050.928 |
| Setup plus disposal | 15.556 / 23.892 | 101.006 / 103.359 | 1,303.407 / 1,303.407 |

The `append/read`, correction, seek, and replacement cases now reuse the
indexed store. The setup-plus-disposal row intentionally includes construction
and source indexing because the benchmark creates the aggregator inside the
measured action; it is not a bare `dispose()` call. These are local Node
calculation measurements, not Canvas2D/FPS or universal device claims.

## Chart-owned browser benchmark

Command:

```bash
npm run benchmark:session-analytics
```

This scenario uses the actual public `Chart` API with 100,000 deterministic
one-minute candles, a New York split-session calendar, a session SMA, and a
previous-session reference. On the same managed Cloud host it selected the
available system Chromium `HeadlessChrome/154.0.0.0` (the official Firefox,
WebKit, and mobile engines remain unavailable). The result at the same run
was:

| Chart operation | Median | p95 | Samples |
| --- | ---: | ---: | ---: |
| `Chart.update` forming-bar path | 1.700 ms | 4.300 ms | 50 |
| `Chart.update` plus indicator/reference `getResult()` | 21.700 ms | 23.800 ms | 5 |
| One pending update plus full snapshot | 18.800 ms | not distributional | 1 |

Chart setup was 96.600 ms for the 100k dataset. The scenario produced 304
session observations, one currently materialized indicator output, and 304
reference points, and destroyed its chart with one pre-existing example-page
canvas remaining (`remainingCanvasCount: 1`). Browser heap was 158,072,590
bytes before destroy and 19,268,895 bytes after destroy/GC in this run.
Browser heap and timings are environment-specific; they are not release
thresholds.
