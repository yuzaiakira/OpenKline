# Volume analytics architecture

OpenKline's volume analytics are layered on the existing chart model rather
than implemented as a second charting subsystem.

## Calculation boundary

`calculateAnchoredVwap` and `calculateEstimatedVolumeProfile` are pure,
framework-independent functions. They normalize duplicate timestamps with the
last observation winning, preserve chronological order, ignore non-positive
volume for weighting, and return explicit empty results when no positive
volume is eligible. The profile is an OHLCV estimate: it is not exchange
reported volume-at-price, tick volume, delta, or order-flow data.

`Chart.addAnchoredVwap` uses the built-in `ANCHORED_VWAP` indicator lifecycle.
`Chart.addVolumeProfile` owns only validated options, a calculation cache, and
an overlay identity. Both read the chart model's replay-visible raw candles;
neither mutates the source series or stores derived pixel coordinates.

## Render and lifecycle flow

```text
raw candles -> ChartModel replay mask -> pure calculation
           -> cached result -> Canvas2D plugin overlay -> chart frame
```

Volume Profile bars, POC, VAH, and VAL are converted to the main pane's
current price scale at render time. Pan, zoom, resize, data correction, replay
cursor changes, and profile option changes invalidate the result or frame as
appropriate. Rendering is clipped to the main pane and uses the existing
Canvas2D command path, so no additional canvas, worker, or render loop is
created. `Chart.destroy()` clears profile state and the normal chart cleanup
releases the canvas and listeners.

Visible mode uses the current visible UTC interval. Fixed mode uses the
canonical inclusive/exclusive `[from, to)` UTC range. Because both modes use
`ChartModel.allCandles`, replay masks future candles before calculation. This
also means backward seeks remove future volume contributions and forward seeks
reveal only newly eligible candles.

## Studio boundary

The private Next.js Studio keeps controls and persistence outside the core. It
stores profile options and Anchored VWAP indicator parameters in the public
workspace document, while temporary placement state and calculation caches are
omitted. Each `ChartPanel` owns its chart and therefore its anchors and
profiles. Comparison mode hides raw-price analytics while normalized series are
displayed and restores the recorded visibility state on exit.

Studio fixtures and browser tests are deterministic. They demonstrate the
integration in Chromium only; they do not certify Firefox, WebKit, mobile
Safari, physical devices, or exchange-provided volume-at-price data.
