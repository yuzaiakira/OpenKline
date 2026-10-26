# Screener API (Phase 8.3)

The public screener API is exported from `openkline` and is framework-independent.

## Rule set

`ScreenerRuleSet` is version `1` and contains a stable `id`, display `name`, and typed `root` node. Use `validateScreenerRuleSet(ruleSet)` before persistence or a scan. Use `evaluateScreenerRuleSet(ruleSet, candles, { index, latestFinality })` for deterministic reference evaluation.

Evaluation returns `matched`, `not-matched`, or `unavailable`, plus nullable current/previous values and diagnostics. `unavailable` includes insufficient warm-up, missing volume, invalid candles, and ineligible developing bars. The return value is descriptive and does not create alerts, orders, or trading actions.

Indicator references contain `indicatorId`, JSON parameters, and a metadata-defined output ID. Validation uses the supplied `IndicatorRegistry` when provided, otherwise the built-in registry. The same registry outputs are used for RSI, SMA/EMA, MACD, ADX, Donchian, Bollinger, and the other documented indicators.

## Data boundary

Use `ScreenerInstrument` and `ScreenerUniverse` to identify instruments without symbol collisions. `ScreenerMarketDataProvider.getHistory` returns paginated `ScreenerBar` values. Each bar must declare `confirmed` or `developing` finality, source, revision, and receive time. The provider remains responsible for vendor normalization and corrections; the screener does not guess finality.

`DeterministicScreenerMarketDataProvider` is for local tests and examples only. It uses no credentials and is not a market-data feed.

## Snapshot scans

`runScreenerSnapshot` validates the universe and rule set, resolves every instrument, follows bounded history pagination, filters to confirmed bars, evaluates the rule set, and returns ordered per-instrument results and counts. `maxConcurrency`, `maxBarsPerInstrument`, `maxPagesPerInstrument`, and `maxPageSize` are explicit limits. Set `strict` only when one unavailable symbol should fail the whole job; the default isolates provider failures.


