# Performance and memory reliability

OpenKline reports reproducible local observations, not universal FPS, latency,
capacity, or memory guarantees. The primary Canvas2D command is:

```bash
npm run benchmark:browser
```

It measures 1,000, 10,000, and 100,000 candle workloads with indicators,
drawings, viewport navigation, append updates, historical corrections,
crosshair events, requestAnimationFrame work, heap observations, and canvas
cleanup. `npm run profile:browser` instruments the 100,000-candle append path.
The lifecycle regression test is
`tests/browser/release-hardening.spec.ts` and covers repeated creation,
subscriptions, updates, drawing/indicator setup, destruction, and host removal.

## Phase 8.5 local observation

Environment: Node.js v24.19.0, Playwright 1.64.1, system Chromium
154.0.8037.57 at `/usr/bin/chromium`, Linux x64, headless Canvas2D. The latest
readiness-run benchmark is recorded below; values are local observations and
should be rerun on a clean authorized machine before release.

| Candles | Load (ms) | Update-frame (ms) | Five corrections (ms) | Frame-work p95 (ms) | rAF FPS |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 33.3 | 2.017 | 51.1 | 5.7 | 64.25 |
| 10,000 | 116.4 | 1.130 | 438.9 | 5.2 | 56.94 |
| 100,000 | 1,586.2 | 1.091 | 5,359.4 | 1.6 | 63.40 |

The 100,000-candle run observed 585,331,738 bytes before destroy and 2,794,311
bytes after the explicit cleanup/GC opportunity, with zero remaining canvases.
This is not proof of zero heap leakage. The historical correction workload is
intentionally separate from the newer-timestamp append path and remains
materially more expensive.

The profiler reported the following aggregate inclusive timing for its bounded
append sample: visible data 3.6ms, renderer 39.5ms, series updates 4.4ms,
collection updates 3.2ms, store updates 2.7ms, indicator updates 5.5ms. These
measurements did not identify a new regression in the append path. The observed
frame-work p95 variation was not sufficient evidence for an unapproved runtime
optimization, so no chart subsystem was rewritten in Phase 8.5.4.

## Interpretation and follow-up

- The existing O(1)-style append paths are preserved; no claim is made for
  arbitrary historical correction or KlineScript seek complexity.
- Heap values are workload and engine dependent. Compare repeated runs with
  the same browser, viewport, flags, data fixture, and GC opportunity.
- A future optimization must first reproduce a regression, record a profile,
  preserve financial correctness, and add a targeted regression test.
- Managed Firefox/WebKit and physical-device performance remain unverified.
