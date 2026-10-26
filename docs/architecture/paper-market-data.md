# Paper Market Data and Deterministic Stream

The `PaperMarketEvent` contract is the only market-data boundary consumed by
the paper account. It contains a normalized positive price, UTC millisecond
time, symbol, source, application id, source sequence, quote status, and
runtime mode. Adapters may translate REST, WebSocket, or test data into this
contract, but vendor credentials and transport types do not enter the core.

`createDeterministicPaperMarketStream()` is the reference credential-free
source. A seed, initial price, start time, step, symbol, and source determine
the same event sequence on every run. The stream supports manual steps,
timer-driven playback, pause/resume, speed, disconnect/reconnect, listener
cleanup, and disposal. Disconnect advances no sequence and emits no synthetic
quotes. Reconnect continues with the next sequence number.

The stream is suitable for unit tests, examples, and local Studio demos. It
is not a market-data simulator with statistical guarantees and must not be
used as evidence of trading performance.

## Reference transport adapters

`PaperRestMarketAdapter` loads pages of normalized quote events through an
injected `fetch`-compatible function. It bounds pages, rejects pagination
loops and untrusted origins, normalizes seconds/ISO timestamps to UTC
milliseconds, last-writes duplicate event ids, filters the requested range,
and returns a deterministic time/sequence order. A new load supersedes and
aborts the prior load; a transport that ignores abort still cannot publish a
stale response.

`PaperWebSocketMarketAdapter` accepts an injected WebSocket-like transport.
It validates messages, filters symbols, drops identical duplicate events,
forwards corrected event payloads for the account's duplicate policy, and
reconnects with bounded exponential backoff. `stop()` detaches all handlers,
cancels the reconnect timer, closes the socket, and prevents late callbacks.
Neither adapter embeds a vendor schema or credential policy.

