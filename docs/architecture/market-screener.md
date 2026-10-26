# Market Screener Architecture (Phase 8.3 baseline)

The screener is a framework-independent analysis layer. It does not import React, Next.js, Canvas, broker APIs, or browser storage. Studio consumes its public contracts but does not own screening state.

## Stable instrument identity

An instrument is identified by the tuple `provider`, `exchange`, `assetClass`, `quoteCurrency`, `symbol`, and `instrumentId`. Identity fields are trimmed, Unicode-normalized, and upper-cased before canonical encoding. A symbol by itself is never enough to combine markets from different providers or venues. The canonical identity is suitable for duplicate detection and result keys.

Watchlist symbols are converted to history identities with an explicit provider. Watchlist quote values are not used as OHLCV history. Missing watchlist metadata is represented as `UNKNOWN` and remains visible in the identity.

## Universe and market-data boundary

`ScreenerUniverse` is versioned, source-labelled (`explicit`, `watchlist`, or `demo`), validated, and bounded before any scan begins. The `ScreenerMarketDataProvider` contract exposes symbol resolution, paginated historical pages, and an optional explicit bar subscription. Each bar carries provider-declared `confirmed` or `developing` finality, revision, source, and receive time. The core never infers completion from the wall clock.

The deterministic demo provider is credential-free and repeatable. It uses generated OHLCV data only for tests and local examples; it is not an exchange feed. Production adapters must preserve provider finality, revisions, timestamps, cancellation, and error status rather than silently guessing.

## Phase boundary

This milestone establishes the contracts, identity, universe validation, and deterministic acquisition fixture. Rule AST validation/evaluation, snapshots, incremental watching, worker scheduling, Studio UI, and final verification are separate milestones and are not marked complete by this document.

