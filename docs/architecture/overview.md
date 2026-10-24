# Architecture Overview

The first implementation keeps the repository small while preserving the
boundaries needed for later packages.

```text
CandleStore -> ChartModel -> CanvasRenderer
     |             |              |
 validation     viewport      Canvas2D adapter
     |             |              |
 Datafeed   data lifecycle   browser events
                                   |
                         React / Next.js adapters
```

`CandleStore` owns ordered OHLCV data and rejects malformed input. `ChartModel`
owns visible-range state, pan, and zoom without knowing about the DOM. The
Canvas2D renderer maps visible data through time and price scales and owns no
data mutation. `Chart` is the browser adapter that owns the canvas, pointer and
wheel listeners, resize observation, datafeed subscription, and teardown. The
React adapter only owns component lifecycle; the Next.js example keeps chart
construction in a Client Component.

## Initial decisions

- TypeScript strict mode is required.
- Canvas2D is the first renderer; WebGL/WebGPU requires measured evidence.
- Timestamps are UTC Unix milliseconds.
- OHLC values use JavaScript numbers; financial rounding policy is explicit in
  future datafeed/indicator APIs rather than implied by the renderer.
- There are no React or Next.js dependencies in the core model.
- GitHub Actions are intentionally not used; validation is local and scripted.
