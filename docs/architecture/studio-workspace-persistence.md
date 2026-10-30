# Studio workspace persistence

Chart persistence and Studio persistence remain separate layers:

```text
StudioWorkspaceDocument v1
  layout + stable panel records + sync flags + watchlists
  charts[].workspace -> existing WorkspaceDocument v1
```

`parseStudioWorkspace` validates the complete nested document before the host
applies it. A failed parse leaves the current charts and storage untouched.
The parser enforces the number of chart panels required by the selected layout,
unique panel IDs, valid symbol/timeframe strings, nested chart validation,
watchlist integrity, and a selected-list reference that exists.

The current legacy key is `openkline-studio-workspace-v1`. Legacy chart
documents are detected and migrated to a single-panel Studio document. The
legacy value is retained until the migrated document has been validated and
successfully written to the named-workspace store. Migration is deterministic
and does not create duplicate workspaces on repeated startup.

Storage is browser-local only in this phase. There is no server upload, cloud
synchronization, authentication, or publication behavior. The host must treat
quota failures, unavailable storage, corrupted JSON, and concurrent-tab races
as recoverable UI errors. Manual save is the initial source of truth; debounced
autosave is a later host feature and must use a monotonic revision to prevent
older asynchronous writes from winning.

The Phase 12 portfolio tester is nested as optional configuration in the
Studio envelope. Its bounded document is validated before application; market
data is reacquired by the consumer and results remain runtime/export state.
This keeps shared-capital simulations from silently becoming part of chart
workspace accounting or from persisting sensitive provider material.
