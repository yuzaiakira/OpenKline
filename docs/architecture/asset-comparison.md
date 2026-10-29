# Asset comparison architecture

Asset comparison is a derived-data boundary between data acquisition and chart
presentation:

```text
raw asset observations -> ComparisonEngine -> normalized line points
          |                    |                    |
       validation          baseline policy       Chart line series
          |                    |                    |
     corrections        percentage/indexed     legend/crosshair UI
```

`ComparisonEngine` owns validated, ordered observations per asset, explicit
baseline and freshness policy, deterministic normalization, change
notifications, and disposal. It does not depend on DOM, React, Canvas2D,
Datafeed vendors, or Chart instances. `Chart` remains responsible for its raw
price scale and viewport; a host may render the engine's normalized output as
ordinary line series on a separate display state.

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
fixture data by the chart replay cutoff; the core chart replay model still owns
the final visibility boundary. Removed panels dispose their Chart instances and
the host comparison engine remains a single managed resource.
