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

The private Studio document (`StudioWorkspaceDocument`) is a separate
version-1 envelope around chart workspaces. Its optional `comparison` member
stores active state, normalization mode, UTC baseline, maximum baseline age,
and ordered asset IDs. Older documents omit this member and remain valid;
unknown or duplicate asset IDs are rejected by `parseStudioWorkspace`.
