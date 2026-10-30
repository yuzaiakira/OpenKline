# Asset comparison architecture

Asset comparison is a derived-data boundary between data acquisition and chart
presentation:

```text
Datafeeds -> ComparisonDatafeedController -> ComparisonEngine -> normalized line points
          |                    |                    |
       validation          baseline policy       Chart line series
          |                    |                    |
     corrections        percentage/indexed     legend/crosshair UI
```

The coordinator separates acquisition from presentation. A baseline freshness
window may request candles before `window.from`; those raw candles remain
available for causal baseline selection, while normalized output is restricted
to the visible `[window.from, window.to)` range. Optional provider-neutral
coverage policies describe continuous slots or session-aware expected slots.
Without a policy, the state is `uncertain` rather than treating weekends,
holidays, or sparse observations as missing data.

The historical request window and live display policy are deliberately
separate. Fixed mode is the compatibility default. Follow mode allows the
display to advance beyond the initial exclusive upper bound as realtime or
recovered observations arrive, while preserving the original acquisition
range for diagnostics and avoiding a full reload per tick. Each asset owns a
monotonic recovery frontier; same-time corrections update data without making
an older event the new frontier.

Confirmed missing intervals can be passed through bounded `backfill()`
recovery. The coordinator limits ranges, attempts, and concurrency, merges
equal timestamps deterministically, and gives a realtime candle received while
recovery is pending precedence over an older historical response. A
`WebSocketDatafeed` lifecycle signal can trigger this recovery after a
reconnect; providers without lifecycle visibility retain an explicit manual
recovery path.

Follow-mode reconnect recovery uses the last authoritative frontier and an
injected/current target clock. The target interval is finite and bounded;
longer outages remain visible as incomplete recovery rather than being
silently treated as complete. Recovery data cannot overwrite live corrections,
and replay masking is applied only to the derived display output.

`ComparisonEngine` owns validated, ordered observations per asset, explicit
baseline and freshness policy, deterministic normalization, change
notifications, and disposal. It does not depend on DOM, React, Canvas2D,
Datafeed vendors, or Chart instances. `Chart` remains responsible for its raw
price scale and viewport; a host may render the engine's normalized output as
ordinary line series on a separate display state.

`addCorporateActionAsset()` is the explicit bridge for action-aware
comparison. It applies the caller-selected raw, split-adjusted, or
total-return basis before storing derived price points and exposes that basis
in snapshots and normalized output. It never changes the source candle array;
total-return remains an index rather than fake OHLC.

The baseline is selected independently for every asset as the latest point at
or before the requested UTC timestamp. A maximum age is checked explicitly.
This handles different trading calendars, missing intervals, and asynchronous
updates without look-ahead. Output points are restricted to timestamps at or
after the requested baseline. Equal-timestamp updates replace a correction;
out-of-order updates insert into the ordered store. Cached normalized output is
invalidated for every relevant change.

The Next.js Studio adapter keeps comparison state optional in its version-1
workspace document. It captures ordinary series styles and price-scale options
when entering comparison mode, renders only derived lines while active, and
restores the captured chart state when leaving. The adapter filters deterministic
fixture data through the public `ComparisonDatafeedController` by applying the
chart replay cutoff; the core chart replay model still owns the final visibility
boundary. The controller retains raw OHLCV separately, resolves each asset's
symbol, loads the shared exclusive UTC window, isolates provider failures, and
owns independent realtime subscriptions. Its serializable source selector
distinguishes deterministic demo data from an explicitly selected optional
public provider; credentials and transport objects are never persisted.
Removed panels dispose their Chart instances and the host controller remains a
single managed resource.
