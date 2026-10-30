# Corporate actions and adjustment architecture

Corporate actions are an additive data boundary. Raw candles remain the
canonical executable observations; adjustment is a validated, deterministic
projection selected by the caller.

```text
CorporateActionDatafeed / Store
              |
     validated versioned events
              |
     adjustment context + mode
        /          |          \
      raw   split-adjusted   total-return index
        |          |          |
   execution   Chart/indicators  comparison analytics
```

The source contract distinguishes stable event identity (`id`), correction
revision, effective/ex-dividend boundary, optional announcement and knowledge
timestamps, and source identity/version. Duplicate IDs with contradictory
terms are rejected. A later revision replaces an earlier one only through a
store/datafeed boundary; consumers never mutate historical action records in
place.

Historical adjustment has two explicit contexts:

- Retrospective mode may apply selected known actions to normalize historical
  prices for present-day chart display.
- Causal-as-of mode filters by the effective frontier and knowledge-time
  frontier, so replay and historical research do not use a future action or a
  later correction. Unknown knowledge coverage is surfaced as metadata rather
  than fabricated into a historical timestamp.

For a split, pre-effective OHLC prices are multiplied by `oldShares/newShares`.
Equivalent-share volume uses the reciprocal factor; missing volume stays
missing. OHLC ordering is validated after every transformation. Cash dividends
do not alter executable OHLC. The total-return calculation is a separate index
whose documented convention reinvests cash at the ex-dividend boundary.

Chart state stores raw candles separately from displayed candles. Indicators,
multi-timeframe calculations, session analytics, and worker indicators are
refreshed from the displayed domain after an adjusted-data correction. Replay
rebuilds a split-adjusted source using causal eligibility at each cursor and
never edits the canonical action dataset. Workspace documents persist only
source references and presentation policy; an unavailable source is retained as
an unresolved reference with a warning.

Portfolio accounting consumes the same raw action contract inside the existing
merged timeline. Effective split events adjust held quantity and per-share
cost basis while keeping aggregate cost basis; pending orders crossing a split
are cancelled by the documented policy. Ex-dividend events create receivables
without changing available cash, and payment events settle them once. No FX,
cash-in-lieu, vendor-specific rules, or silent price adjustment is introduced.
