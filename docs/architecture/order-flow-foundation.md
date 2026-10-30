# Order-flow foundation

Phase 14 adds market microstructure as an optional source alongside the
existing candle store. The first foundation milestone provides versioned trade
contracts, source identity, explicit aggressor uncertainty, correction-aware
deduplication, bounded retention, defensive reads, and a provider-neutral
historical/live adapter boundary.

The core deliberately has no exchange endpoint, broker credential, WebSocket
message format, or inferred buy/sell volume. A host may provide a classified
trade stream, but the input must preserve whether classification was observed
or estimated. A candle-only application cannot claim authoritative CVD or
Footprint delta.
