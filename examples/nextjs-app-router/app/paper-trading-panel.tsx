"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import {
  createDeterministicPaperMarketStream,
  createPaperTradingAccount,
  createPaperTradingMarkers,
  type Chart,
  type PaperAccountSnapshot,
  type PaperMarketStreamApi,
  type PaperOrder,
  type PaperTradingApi,
} from "openkline";
import styles from "./studio.module.css";

interface PaperTradingPanelProps {
  readonly panelId: string;
  readonly symbol: string;
  readonly timeframe: string;
  readonly chart: Chart | null;
  readonly onNotice: (message: string) => void;
}

interface PaperSession {
  readonly account: PaperTradingApi;
  readonly stream: PaperMarketStreamApi;
}

function createSession(panelId: string, symbol: string): PaperSession {
  const account = createPaperTradingAccount({
    id: `studio-paper-${panelId}`,
    displayName: `${symbol} simulated account`,
    symbol,
    currency: "USD",
    initialBalance: 100_000,
    execution: { commission: { type: "percent", value: 0.001 }, slippage: { type: "percent", value: 0.0005 }, maxQuoteAgeMs: 60 * 60_000, allowFractionalQuantity: true },
    risk: { maxOrderNotional: 25_000, maxPositionExposure: 50_000, maxPendingOrders: 3, maxSessionLoss: 10_000 },
  });
  const stream = createDeterministicPaperMarketStream({ symbol, initialPrice: symbol === "BTC-USD" ? 64_000 : symbol === "ETH-USD" ? 3_200 : 190, seed: panelId.length + symbol.length, stepMs: 60_000, intervalMs: 60_000 });
  return { account, stream };
}

function money(value: number): string { return value.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 }); }
function quantity(value: number): string { return value.toLocaleString(undefined, { maximumFractionDigits: 6 }); }

export function PaperTradingPanel({ panelId, symbol, timeframe, chart, onNotice }: PaperTradingPanelProps): ReactElement {
  const session = useMemo(() => createSession(panelId, symbol), [panelId, symbol]);
  const disposeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [snapshot, setSnapshot] = useState<PaperAccountSnapshot>(() => session.account.getSnapshot());
  const [orders, setOrders] = useState<readonly PaperOrder[]>([]);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [orderQuantity, setOrderQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("Advance the simulated quote to fill pending market orders.");

  useEffect(() => {
    if (disposeTimerRef.current !== null) {
      clearTimeout(disposeTimerRef.current);
      disposeTimerRef.current = null;
    }
    const publish = (): void => {
      setSnapshot(session.account.getSnapshot());
      setOrders(session.account.getOrders());
    };
    const unsubscribeAccount = session.account.subscribe(publish);
    const unsubscribeStream = session.stream.subscribe((event) => session.account.processMarketEvent(event));
    session.stream.step();
    publish();
    return () => {
      unsubscribeAccount();
      unsubscribeStream();
      // React Strict Mode performs an effect cleanup/setup probe. Delay final
      // disposal so that probe does not dispose the session reused by setup.
      disposeTimerRef.current = setTimeout(() => {
        session.stream.dispose();
        session.account.dispose();
        disposeTimerRef.current = null;
      }, 0);
    };
  }, [session]);

  useEffect(() => {
    if (chart === null) return undefined;
    chart.setPaperTradingMarkers(createPaperTradingMarkers(orders));
    return () => chart.clearPaperTradingMarkers();
  }, [chart, orders]);

  const submit = (): void => {
    const parsed = Number(orderQuantity);
    try {
      const order = session.account.submitOrder({ idempotencyKey: `${panelId}-${side}-${Date.now()}`, side, type: "market", quantity: parsed, ...(reason.trim() === "" ? {} : { reason: reason.trim() }) });
      setNotice(`${order.side.toUpperCase()} order ${order.id} is pending; fill requires the next fresh simulated quote.`);
      onNotice(`${panelId}: simulated ${order.side} order submitted.`);
      setReason("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const advance = (): void => {
    try {
      session.stream.step();
      setNotice("Advanced one deterministic simulated quote.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const toggleHalt = (): void => {
    session.account.setRiskHalt(!snapshot.tradingHalted, "Studio operator risk halt");
    setNotice(snapshot.tradingHalted ? "Simulated order entry resumed." : "Simulated order entry halted.");
  };

  return <section className={styles.paperTradingPanel} aria-label={`Paper trading for ${symbol}`}>
    <div className={styles.paperTradingHeader}>
      <div><h2>Paper Trading</h2><p>{panelId} · {symbol} · {timeframe}</p></div>
      <div className={styles.simulatedBadge} role="status" aria-label="Simulated trading only">SIMULATED · NO REAL MONEY</div>
    </div>
    <p className={styles.paperTradingWarning}>This is a virtual single-symbol spot account. No broker, exchange, or live order is connected.</p>
    <div className={styles.paperTradingDashboard} aria-label="Paper trading dashboard">
      <div><small>Equity</small><strong>{money(snapshot.equity)} {snapshot.currency}</strong></div>
      <div><small>Available cash</small><strong>{money(snapshot.availableCash)}</strong></div>
      <div><small>Realized P&amp;L</small><strong>{money(snapshot.realizedPnl)}</strong></div>
      <div><small>Unrealized P&amp;L</small><strong>{money(snapshot.unrealizedPnl)}</strong></div>
      <div><small>Position</small><strong>{quantity(snapshot.position?.quantity ?? 0)}</strong></div>
      <div><small>Drawdown</small><strong>{snapshot.drawdownPercent === null ? "—" : `${(snapshot.drawdownPercent * 100).toFixed(2)}%`}</strong></div>
    </div>
    <div className={styles.paperTradingBody}>
      <form className={styles.paperTradingTicket} onSubmit={(event) => { event.preventDefault(); submit(); }} aria-label="Simulated market order ticket">
        <h3>Market order ticket</h3>
        <label>Side<select aria-label="Paper order side" value={side} onChange={(event) => setSide(event.target.value as "buy" | "sell")}><option value="buy">Buy</option><option value="sell">Sell</option></select></label>
        <label>Quantity<input aria-label="Paper order quantity" type="number" min="0.000001" step="any" value={orderQuantity} onChange={(event) => setOrderQuantity(event.target.value)} /></label>
        <label>Reason<input aria-label="Paper order reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Optional audit note" /></label>
        <button type="submit" disabled={snapshot.tradingHalted}>{snapshot.tradingHalted ? "Order entry halted" : `Submit simulated ${side}`}</button>
        <button type="button" onClick={advance}>Advance simulated quote</button>
        <button type="button" onClick={toggleHalt}>{snapshot.tradingHalted ? "Resume order entry" : "Risk halt"}</button>
        <small aria-live="polite">{notice}</small>
      </form>
      <div className={styles.paperTradingHistory}>
        <h3>Order history</h3>
        <div className={styles.paperTradingTableWrap}><table><caption>Simulated order audit</caption><thead><tr><th>Side</th><th>Qty</th><th>Status</th><th>Fill</th></tr></thead><tbody>{orders.length === 0 ? <tr><td colSpan={4}>No simulated orders</td></tr> : orders.slice().reverse().map((order) => <tr key={order.id}><td>{order.side}</td><td>{quantity(order.quantity)}</td><td>{order.status}</td><td>{order.fill === undefined ? "—" : money(order.fill.executionPrice)}</td></tr>)}</tbody></table></div>
        <h3>Position audit</h3>
        <p>{snapshot.position === null ? "Flat" : `${quantity(snapshot.position.quantity)} ${snapshot.symbol} @ ${money(snapshot.position.averageEntryPrice)}`}</p>
        <p className={styles.paperTradingNotice} aria-live="polite">{snapshot.lastDiagnostic ?? "All account events are simulated and isolated from replay/backtesting."}</p>
      </div>
    </div>
  </section>;
}
