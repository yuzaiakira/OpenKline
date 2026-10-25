# Watchlist system

The Studio watchlist model is framework-independent and vendor-neutral. A
watchlist has a stable ID and ordered symbol records; a display name is not the
identity. Symbol records may carry exchange, asset category, and quote currency
metadata, plus a favorite flag.

`WatchlistModel` provides create, rename, delete, select, add/remove, reorder,
favorite, subscription, and validated document export operations. Duplicate
symbol IDs within a list are rejected. The model never contacts a server and
does not own credentials.

Quotes are behind the `QuoteProvider` interface. The current Studio uses the
deterministic demo provider and labels those values as demo data. It publishes
last price, absolute change, percentage change, timestamp, status, and an
explicit `demo` flag. A future provider can share one subscription for all
visible symbol IDs; the UI must not open one connection per row.

Provider cleanup is the caller's responsibility through the unsubscribe
function. Loading, stale, and error states are part of the quote contract so a
future external adapter does not need to invent UI semantics. No exchange API
key or live market-data claim belongs in the Studio bundle.
