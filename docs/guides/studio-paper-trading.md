# Studio Paper Trading Guide

The Next.js Studio includes an explicitly simulated paper-trading panel for
the active chart. The header is intentionally prominent: `SIMULATED · NO REAL
MONEY`. The panel uses a deterministic local quote stream and no credentials.

1. Confirm the active chart and symbol in the Studio header.
2. Review the equity, cash, P&L, position, and drawdown cards.
3. Choose Buy or Sell, enter a quantity, and optionally add an audit reason.
4. Submit the simulated market order. It remains `pending`.
5. Advance the simulated quote. The account fills only on this later fresh
   event, applying the configured commission and adverse slippage.
6. Review the order history and position audit. Filled orders appear as
   non-persistent paper markers on the active chart.

The panel enforces virtual risk limits and exposes a risk halt control. A
halt blocks new orders but does not stop quote processing or mark-to-market
updates. Switching chart panels changes the active paper-account scope; replay
and Strategy Tester state are not used as paper-market events. Paper state is
not part of the current chart workspace export in this milestone, so hosts
must use the framework-neutral `exportState()`/persistence API when they need
to save a simulated account.

This feature is for deterministic development and UX verification. It is not
a broker connector, exchange simulator with statistical guarantees, financial
advice, or evidence that a strategy will perform in a live market.

