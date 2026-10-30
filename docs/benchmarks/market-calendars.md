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
