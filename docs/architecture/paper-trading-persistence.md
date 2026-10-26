# Paper Trading Persistence

`PaperTradingDocument` is a versioned JSON state boundary. It contains the
account execution policy, immutable account snapshot, order audit, completed
trade audit, journal, and the set of market-event application ids already
processed. Functions, clocks, sockets, listeners, timers, and credentials are
never serialized.

`serializePaperTradingDocument()` validates before JSON encoding.
`parsePaperTradingDocument()` validates the version, account identity,
finite numeric fields, order/fill/trade structure, unique identifiers, and
JSON-safe shape before a host passes the result to a restored account.

Restoration is fail-closed: the caller must provide matching account identity
and execution configuration, and a pending order retains its serialized cash
reserve. Restoring does not emit a fill from the last event. A subsequent
fresh event must pass the normal ordering and eligibility checks. Hosts should
save atomically and retain the previous document until the new document has
been parsed successfully.

