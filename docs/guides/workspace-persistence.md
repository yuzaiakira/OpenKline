# Workspace Persistence

```ts
const saved = chart.serializeWorkspace({ symbol, timeframe });
await storage.put("workspace", JSON.stringify(saved));

const candidate = JSON.parse(await storage.get("workspace"));
const document = parseWorkspace(candidate);
chart.restoreWorkspace(document, { missingPlugins: "skip" });
```

The storage layer is intentionally outside OpenKline. Validate untrusted data,
limit document size, authenticate remote users, and add application migrations
when the workspace version changes. Install trusted plugins before restoration;
their definitions and drawing tools must be available for saved content to be
recreated. A skipped plugin's state is reported and is not executed.
