# Unified market replay tape

Phase 15 adds an additive, provider-neutral event-tape contract. It complements
the existing candle-only `ReplayEngine`; it does not replace
`Chart.createReplay()`.

```ts
import {
  MarketReplayController,
  createMarketReplayTape,
  parseMarketReplayTape,
  serializeMarketReplayTape,
} from "openkline";

const tape = createMarketReplayTape({
  id: "research-fixture-2026-01",
  events: [
    {
      id: "btc-candle-open-1",
      kind: "candle-open",
      instrumentId: "BTC-USD",
      time: 1_700_000_000_000,
      revision: 0,
      source: { id: "offline-fixture", version: "1" },
      candle: { time: 1_700_000_000_000, open: 100, high: 105, low: 95, close: 103, volume: 10 },
      finality: "opening",
    },
  ],
});

const replay = new MarketReplayController({ tape, clockPolicy: "event-time" });
replay.start();
replay.stepNextEvent();
console.log(replay.getSnapshot().formingCandles);

const portable = serializeMarketReplayTape(tape);
const restored = parseMarketReplayTape(portable);
```

## Events and ordering

The version-1 tape accepts candle opening/forming and completion events,
trades, order-book snapshots and deltas, corporate-action effective/payment
events, session boundaries, and source-status metadata. Every event carries a
stable id, instrument, source/version, exchange timestamp, revision, and an
optional genuine receive timestamp.

The canonical ordering is timestamp-first with stable instrument/source/kind
tie-breakers. Sequenced order-book records in the same instrument/venue/source
stream retain source sequence order even when their timestamps are delayed or
duplicated. A sequence gap is represented in replay integrity; it is never
filled by interpolation.

`event-time` uses exchange/event timestamps. `receive-time` uses only records
with a recorded receive timestamp. Missing receive timestamps are excluded
from that projection and reported as unknown coverage; the library never
invents receipt times. Clock policy and tape fingerprint are part of replay
state and checkpoint identity.

## Validation and provenance

Tape creation rejects duplicate event identities, duplicate revisions for a
stable trade/action record, unsafe timestamps, invalid prices/quantities,
contradictory OHLC, invalid L2 sequence ranges, unsupported source versions,
and invalid corporate-action records. Imported JSON is treated as untrusted
data and is validated before it is returned.

The fingerprint identifies the canonical records processed by OpenKline. It
does not authenticate a provider, exchange, or the real-world correctness of
the source bytes.

Serialization is deterministic JSON for bounded fixtures. Large applications
should store chunked/JSONL transport outside ordinary workspace documents and
pass validated chunks into a bounded tape builder.
