# Studio trading sessions

OpenKline Studio includes an offline, illustrative trading-calendar workflow
for reviewing session-aware chart behavior. The fixture is intentionally not
an authoritative exchange calendar and does not fetch holiday data.

## Modes

The **Market mode** control selects either:

- **24/7 UTC** — no exchange-session assumptions. Session overlays and
  session-derived studies are unavailable.
- **Calendar-backed market** — attaches the deterministic
  `openkline-studio-demo-market@2026.1` calendar in `America/New_York`.

The calendar fixture contains weekday 09:30–16:00 sessions, an explicit
intraday break, and a documented early-close example. Its coverage is shown in
the status text. Hosts that need production exchange behavior must provide a
versioned `TradingCalendarEngine` definition from a verified source.

## Session analysis

Choose **Trading session**, **Trading week**, or **Trading month** and add the
causal session SMA or previous-period OHLC levels. The chart uses the same
indicator registry, pane model, replay frontier, and disposal lifecycle as
ordinary chart studies. A study is not available in 24/7 UTC mode.

The **Session boundaries and labels** control toggles the existing chart
overlay. Calendar ID, version, display options, analysis period, indicator
settings, and reference settings are serialized in the workspace; executable
calendar objects and derived values are not. Studio restores the fixture only
when its ID and version match. An unavailable calendar remains unresolved
rather than being silently substituted.

## Limitations

The Studio fixture is for deterministic development and browser tests. It does
not claim current exchange holidays, live coverage, or production market-data
authority. Browser/device accessibility, visual review, and non-Chromium
certification remain separate verification gates.
