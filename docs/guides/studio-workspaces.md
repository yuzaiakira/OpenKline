# Named Studio workspaces

`New`, `Save`, `Save As`, `Duplicate`, `Load`, `Export`, and `Import` manage
named browser-local Studio documents. A saved document contains the layout,
stable panel IDs, each nested chart workspace, synchronization switches, and
watchlists.

The storage key is `openkline-studio-workspaces-v1`. The previous
`openkline-studio-workspace-v1` chart-only key is retained and migrated into a
single-panel Studio document after validation. Storage is not synchronized to
a server and is not an authentication or backup system. Hosts must handle
quota errors, corrupted JSON, and concurrent-tab races as recoverable errors.

Import is schema-validated. Invalid version, panel cardinality, duplicate IDs,
chart workspace, synchronization, or watchlist data leaves the current live
workspace unchanged.
