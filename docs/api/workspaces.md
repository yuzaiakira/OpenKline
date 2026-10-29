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

The private Studio document (`StudioWorkspaceDocument`) is a separate
version-1 envelope around chart workspaces. Its optional `comparison` member
stores active state, normalization mode, UTC baseline, maximum baseline age,
and ordered asset IDs. Older documents omit this member and remain valid;
unknown or duplicate asset IDs are rejected by `parseStudioWorkspace`.
