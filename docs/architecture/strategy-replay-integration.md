# Strategy and replay integration

Backtests are computed independently of the browser Replay scheduler. A
completed `BacktestResult` can be converted to `StrategyMarker[]` with
`createStrategyMarkers(result, candles)` and attached to an existing Chart via
`setStrategyMarkers()`.

Markers are presentation state only. They are not drawings, are not included
in workspace serialization, do not mutate source candles, and can be cleared
without changing a strategy result. Entry/exit signal markers use the signal
bar close; entry/exit fill markers use the actual simulated execution price
and fill timestamp.

Chart renders markers through the existing plugin overlay command path. They
therefore use the existing time and primary price transforms and remain
correct when the chart is panned, zoomed, resized, or switched between price
scale modes. The chart does not create a second renderer.

During chart replay, `getStrategyMarkers()` and the renderer filter markers to
timestamps at or before the inclusive replay cursor. Future signals and fills
are not visible through the marker API. Exiting replay restores the ordinary
marker visibility projection; it does not change the backtest result. Replay
does not run the backtest or reveal future trade outcomes through its own
status.

Strategy signals, alert events, drawings, simulated orders, and fills remain
separate domain objects. Alerts never create orders automatically. The current
integration does not provide interactive trade editing, broker actions,
protective stop/target markers, or live trading.
