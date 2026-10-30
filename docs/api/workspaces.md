# Workspace API

```ts
const document = chart.serializeWorkspace({ symbol: "BTC-USD", timeframe: "1h" });
const result = chart.restoreWorkspace(document, {
  missingPlugins: "skip",
  missingIndicators: "error",
});
console.log(result.skippedPlugins, result.skippedIndicators);
```

The public `WorkspaceDocument` is version `1`. Use `parseWorkspace` at an
application boundary before storing or transporting unknown input. The
document stores plugin state and exact plugin versions, never plugin code.
Persistence is intentionally adapter-neutral; serialize it through the
application's approved storage or API layer.

When present, the optional `volumeAnalytics` member stores chart-owned
Estimated Volume Profile configuration: profile IDs, fixed or visible mode,
the canonical UTC `[from, to)` range, allocation method, bin count, value-area
percentage, and display settings. Derived bins, POC/VAH/VAL pixel geometry,
canvas caches, and temporary pointer placement state are not persisted.
Anchored VWAP is represented by the ordinary `ANCHORED_VWAP` indicator entry;
its UTC anchor, price source, and output style therefore use the same version-1
indicator persistence path. Older version-1 documents that omit
`volumeAnalytics` remain valid.

The optional Phase 10 `multiTimeframe` member stores only indicator and
previous-level configuration: source/target fixed durations, registry
indicator parameters, coverage/finality/volume policies, pane IDs, styles,
visibility, selected OHLC reference levels, and labels. Aggregated candles,
derived points, caches, and application calendar callbacks are runtime state
and are not serialized. The version remains `1`; legacy documents omit this
member safely.

The private Studio document (`StudioWorkspaceDocument`) is a separate
version-1 envelope around chart workspaces. Its optional `comparison` member
stores active state, normalization mode, UTC baseline, maximum baseline age,
and ordered asset IDs. Older documents omit this member and remain valid;
unknown or duplicate asset IDs are rejected by `parseStudioWorkspace`.

## Trading calendars and session analysis

The optional Phase 11 `tradingCalendar` member stores the stable calendar ID,
version, and display controls for boundaries, breaks, labels, colors, opacity,
and visible-session bounds. It never stores executable calendar definitions,
timezone conversion caches, or market data. The optional `sessionAnalysis`
member stores session/week/month indicator and previous-level configuration,
including its calendar ID/version, source timeframe, policies, pane, styles,
and visibility. Derived observations and series points are intentionally
recomputed.

Restore runtime calendars explicitly:

```ts
chart.restoreWorkspace(document, {
  tradingCalendarResolver: (id, version) => calendarRegistry.get(id, version),
});
```

If a persisted calendar is not available, the chart restores the rest of the
workspace and leaves calendar overlays/session analyses detached. This is a
safe compatibility outcome: no unverified schedule is substituted and no
future market data is synthesized.

## Compatibility and validation

The `volumeAnalytics` property is optional so a version-1 document written
before Phase 9 remains valid without migration. A consumer that does not
recognize the property may preserve or omit it according to its storage
policy; it must not treat its absence as an error. `parseWorkspace` validates
profile IDs, ranges, modes, allocation, display values, and duplicate IDs.
An empty profile list is valid, while duplicate IDs and malformed profile
options are rejected.

`serializeWorkspace()` emits canonical profile options in insertion order and
never stores calculated bins, pixel geometry, caches, or temporary placement
state. Repeated parse/serialize cycles therefore preserve the user-owned
configuration without persisting runtime objects. The version remains `1`;
this additive optional field does not authorize changing required fields or
the meaning of existing fields.
