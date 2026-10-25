# Studio watchlists

The Studio starts with a deterministic Favorites list. Use `Add sample symbol`,
the search box, and the symbol rows to select a market. The management controls
toggle favorites and move symbols up or down. Quote values are explicitly
labelled demo values and do not require vendor credentials.

The framework-neutral `WatchlistModel` supports create, rename, delete, select,
add/remove, reorder, favorite, subscription, and validated export operations.
Hosts provide a `QuoteProvider` and must call the returned unsubscribe function
when the list or panel is disposed. Loading, ready, stale, and error statuses
are part of the provider contract.

Watchlist documents are embedded in named Studio workspace documents. Import
and restore paths validate the whole document before applying it, so malformed
storage does not replace the active workspace.
