# Architecture Overview

The first implementation keeps the repository small while preserving the
boundaries needed for later packages.

```text
CandleStore / PointStore -> SeriesCollection -> ChartModel -> CanvasRenderer
          |                     |                 |              |
       validation          series lifecycle     shared viewport  Canvas2D
          |                     |                 |              |
 REST / WebSocket / InMemory Datafeed             Chart browser adapter
                                                               |
                                                     React / Next.js adapters

Validated Candle[] -> IndicatorRegistry -> independent IndicatorInstance(s)
                                               |
                                        aligned output series

Chart pointer events -> DrawingEngine -> versioned snapshots / pure geometry
                                             |
                                       Canvas2D renderer

Chart -> PluginRegistry -> typed indicators/drawings/events/commands/state
                       -> controlled overlay commands -> Canvas2D renderer

Raw asset observations -> ComparisonEngine -> derived percentage/indexed lines
                                      -> host-owned chart series and legend
```

`CandleStore` and `PointStore` own validated, ordered series data. The
`SeriesCollection` gives every series the same lifecycle and produces a union
of timestamps for one shared viewport. `ChartModel` owns visible-range state,
pan, and zoom without knowing about the DOM. The Canvas2D renderer maps all
visible series through one time scale and shared price scale, with a dedicated
volume pane. `Chart` is the browser adapter that owns the canvas, pointer and
wheel listeners, resize observation, datafeed subscription, and teardown. REST
and WebSocket adapters implement only the vendor-neutral `Datafeed` contract.
The React adapter only owns component lifecycle; the Next.js example keeps
chart construction in a Client Component.

The indicator registry is a separate pure calculation boundary. It consumes
validated candles and emits aligned, multi-output results that are mapped into
independent panes. The drawing engine is another browser-neutral boundary: it
owns analysis-object state and extension contracts while the chart adapter
supplies coordinates and the Canvas renderer consumes pure geometry.
The plugin registry composes those boundaries without exposing the chart DOM,
Canvas2D context, or private model. Workspace documents capture public state
without capturing executable plugin code.

`ComparisonEngine` is another browser- and framework-independent boundary. It
keeps raw asset observations separate from normalized display lines, selects
an explicit at-or-before baseline with bounded freshness, and handles
corrections and disposal without changing the chart's raw price scale. The
private Studio reference host owns the comparison controls, persistence, and
derived line-series lifecycle.

The package/release boundary is also explicit: the root package has no runtime
dependencies, the private Next.js example owns its separate dependency tree,
and lockfile license/provenance metadata is generated and validated outside the
chart runtime. The current project license is pending owner/legal approval;
the release tooling therefore treats the proposed text and stable publication
as separate gates.

Strictly newer series updates use an append path through the stores and extend
the shared timestamp cache without rebuilding the union. Equal-timestamp
replacements and historical insertions retain the correction-safe ordered path;
historical indicator corrections intentionally use full recalculation. The
Canvas2D benchmark and profiler record these paths separately in
`docs/reports/phase-2-performance-and-compatibility.md`.

## Initial decisions

- TypeScript strict mode is required.
- Canvas2D is the first renderer; WebGL/WebGPU requires measured evidence.
- Timestamps are UTC Unix milliseconds.
- OHLC values use JavaScript numbers; financial rounding policy is explicit in
  future datafeed/indicator APIs rather than implied by the renderer.
- There are no React or Next.js dependencies in the core model.
- Series are identified by stable public IDs and can be extended by adding a
  new `SeriesType`/store/renderer branch without changing viewport or input
  lifecycle code.
- REST and WebSocket adapters accept injected fetch/socket functions so tests
  are deterministic and vendor protocol mapping stays outside the core.
- Indicator calculations and drawing tools are registered through typed,
  independent contracts; neither boundary depends on React or vendor APIs.
- GitHub Actions are intentionally not used; validation is local and scripted.
