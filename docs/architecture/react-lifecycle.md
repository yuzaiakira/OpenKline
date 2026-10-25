# React lifecycle and declarative reconciliation

`@openkline/react` owns one public `Chart` instance for each mounted
`FinancialChart`. It does not import private model, renderer, drawing, or
indicator classes. The imperative ref exposes that chart for host-owned
realtime datafeeds and commands.

## Precedence and omitted props

On mount and whenever a new workspace is supplied, the adapter applies state in
this order:

1. create the chart and apply runtime chart options;
2. reconcile trusted declarative plugins, so their public registrations are
   available to workspace validation;
3. restore the versioned workspace, if one was explicitly supplied;
4. apply explicitly supplied `candles`, `indicators`, `scriptIndicators`, and
   `drawings` props.

Thus an explicit prop is the declarative source of truth for its category. An
omitted prop is intentionally different from an empty prop:

| Prop state | Meaning |
| --- | --- |
| Omitted | Preserve current, imperative, or restored state for that category. In particular, omitted `candles` never becomes `setData([])`. |
| Explicit empty array | Clear the adapter-managed category. During a workspace restore it overrides restored items of that category. |
| Supplied values | Reconcile to the supplied stable identities after workspace restoration. |

`plugins={[]}` disposes plugins installed by the adapter. It never tries to
invent or load plugin code from a workspace document; workspace documents carry
only public state and version requirements.

## Stable identities

Use the `id` prop for indicators and script indicators, and `options.id` for
drawings. When no ID is supplied the adapter provides a positional fallback;
that fallback is appropriate only for a stable, non-reordered list. A new array
with equivalent IDs and configuration does not recreate indicators, drawings,
or plugins. User-edited drawings therefore remain intact while their
declarative identity and configuration remain unchanged.

If host code imperatively removes a declarative resource, the next React
commit re-establishes its declared configuration. This makes the declarative
contract authoritative without overwriting an extant user-edited drawing on an
otherwise equivalent rerender.

An actual indicator/script configuration change recreates that declared item
because pane assignment and indicator definitions can change. An actual drawing
configuration change replaces that declared drawing. Hosts that want to retain
interactive edits should keep the declarative drawing configuration stable and
persist changes through the public drawing/workspace APIs.

For market data, the adapter intentionally uses the candle-array reference as
the update signal. It does not deeply compare potentially 100,000-bar arrays on
every React render. Pass a new immutable array only when historical data has
changed; use the imperative chart API or a host-owned `Datafeed` for streaming
updates.

## Runtime options and cleanup

Theme, locale, timezone, price precision, direction, dimensions, and
interaction options call `chart.setOptions` without recreating the canvas.
`onCrosshairMove` and `onChartReady` are held in current refs, avoiding stale
callbacks after a parent rerender. Teardown removes adapter-managed indicators,
drawings, and plugins, unsubscribes the crosshair listener, and destroys the
chart. This supports React Strict Mode's development setup/cleanup probe and
rapid mount/unmount without retaining a canvas or event handler.

The browser regression route at `/lifecycle-verification` in the private Next
example exercises this contract using only public package APIs.
