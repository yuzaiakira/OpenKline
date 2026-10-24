# Workspace Serialization

`Chart.serializeWorkspace()` returns a versioned, persistence-neutral JSON
document containing:

- chart theme, locale, time zone, precision, and direction;
- ordered pane configuration;
- user series data, styles, bands, and stable IDs;
- indicator IDs, panes, parameters, and output styles;
- versioned drawings;
- shared viewport range;
- installed plugin IDs, exact versions, and JSON state.

`parseWorkspace()` validates the document before a chart mutates. It rejects
unknown versions, invalid OHLC relationships, duplicate IDs, missing pane
references, non-ascending series data, invalid drawing documents, and
non-JSON plugin/indicator state. `restoreWorkspace()` then restores the
validated document using already-installed plugins and indicator definitions.
Missing plugins or indicators can be reported as skipped (the default) or
made fatal with `missingPlugins: "error"` / `missingIndicators: "error"`.
Installed plugin versions must match the saved version exactly.

The document is plain data and does not prescribe localStorage, IndexedDB,
HTTP, filesystem, or cloud persistence. Applications should add their own
versioned storage, authentication, encryption, retention, and migration policy.
Do not deserialize executable functions or treat a workspace as a plugin
package.
