# Phase 8.14.4 — Studio Datafeed Experience

Date: 2026-10-30

## Implemented behavior

The private Next.js Studio now uses the public
`ComparisonDatafeedController` for both comparison sources:

- `Demo fixtures · offline` is the default deterministic source;
- `Binance public · optional` is selected explicitly and is clearly labeled
  as an external source whose freshness is not guaranteed;
- asset selection, normalization mode, timeframe, and baseline controls remain
  available without replacing raw candlestick data;
- each asset reports history state, realtime lifecycle state, coverage
  completeness, recovery state, latest eligible visible observation, and
  provider errors;
- `Recover missing history` calls bounded controller recovery;
- deterministic demo controls exercise a realtime correction and a missing
  observation followed by recovery;
- replay masks comparison values and status timestamps at the replay cutoff;
- comparison source selection is persisted as a safe serializable identifier;
- legacy workspaces without the optional source field remain valid.

The `RecoverableStudioDatafeed` is a local reference fixture wrapper. It exists
only to make the browser recovery workflow deterministic; it does not alter the
public core datafeed contract or manufacture market data in normal operation.

## Browser workflow

The React/Studio comparison regression opens demo mode, loads multiple assets,
checks the normalized legend, applies a deterministic realtime correction,
removes one historical observation through the fixture, verifies incomplete
coverage, repairs it through `backfill()`, enters replay, checks that the
visible latest time does not exceed the replay cutoff, seeks in both directions,
saves while comparison is active, and exits comparison to verify the canonical
presentation state. The test also asserts that no page errors were emitted.

The workflow runs against the public controller and existing chart/replay APIs;
comparison math is not duplicated in the test or Studio.

## Verification boundary

Chromium is the available managed browser in this cloud environment. The
offline workflow and provider fixtures are deterministic. Firefox, WebKit,
mobile Safari, physical devices, and live external-provider connectivity remain
open gates and are not claimed here.
