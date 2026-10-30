"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FinancialChart } from "@openkline/react";
import {
  MarketReplayController,
  createMarketReplayTape,
} from "openkline";
import type {
  Candle,
  MarketReplayClockPolicy,
  MarketReplayEvent,
  MarketReplaySnapshot,
  MarketReplayState,
} from "openkline";
import styles from "./studio.module.css";

const REPLAY_SOURCE = { id: "studio-market-replay-fixture", version: "1" } as const;
const REPLAY_INSTRUMENT = "BTC-USD";

function createOfflineReplayTape() {
  const start = Date.UTC(2026, 0, 2, 14, 30);
  const events: MarketReplayEvent[] = [];
  let sequence = 1;
  for (let index = 0; index < 24; index += 1) {
    const time = start + index * 60_000;
    const close = 100 + Math.sin(index / 3) * 3 + index * 0.18;
    const candle: Candle = { time, open: close - 0.5, high: close + 1.2, low: close - 1.4, close, volume: 100 + index * 4 };
    events.push({ id: `open-${index}`, kind: "candle-open", instrumentId: REPLAY_INSTRUMENT, time, receiveTime: time + 2, revision: 0, source: REPLAY_SOURCE, candle, finality: "opening", intervalMs: 60_000 });
    events.push({
      id: `trade-buy-${index}`,
      kind: "trade",
      instrumentId: REPLAY_INSTRUMENT,
      time: time + 10_000,
      receiveTime: time + 12_000,
      revision: 0,
      source: REPLAY_SOURCE,
      trade: { id: `trade-buy-${index}`, instrumentId: REPLAY_INSTRUMENT, time: time + 10_000, receiveTime: time + 12_000, price: close, quantity: 1 + index * 0.05, aggressorSide: index % 5 === 0 ? "unknown" : "buy", sideQuality: index % 5 === 0 ? "unknown" : "observed", revision: 0, source: REPLAY_SOURCE },
    });
    events.push({ id: `complete-${index}`, kind: "candle-complete", instrumentId: REPLAY_INSTRUMENT, time: time + 60_000, receiveTime: time + 61_000, revision: 0, source: REPLAY_SOURCE, candle, finality: "completed", intervalMs: 60_000 });
    if (index === 0) {
      events.push({ id: "book-snapshot", kind: "order-book-snapshot", instrumentId: REPLAY_INSTRUMENT, time, receiveTime: time + 3, sequence, revision: 0, source: REPLAY_SOURCE, snapshot: { version: 1, instrumentId: REPLAY_INSTRUMENT, time, receiveTime: time + 3, sequence, bids: [{ price: close - 0.1, quantity: 10 }], asks: [{ price: close + 0.1, quantity: 12 }], tickSize: 0.1, source: REPLAY_SOURCE } });
    } else {
      sequence += 1;
      events.push({ id: `book-delta-${index}`, kind: "order-book-delta", instrumentId: REPLAY_INSTRUMENT, time, receiveTime: time + 3, sequence, revision: 0, source: REPLAY_SOURCE, delta: { version: 1, id: `book-delta-${index}`, instrumentId: REPLAY_INSTRUMENT, time, receiveTime: time + 3, sequence, previousSequence: sequence - 1, quantityMode: "absolute", bids: [{ price: close - 0.1, quantity: 10 + index }], asks: [{ price: close + 0.1, quantity: 12 + index }], source: REPLAY_SOURCE } });
    }
  }
  return createMarketReplayTape({ id: "studio-offline-market-replay", events });
}

function displayCandles(snapshot: MarketReplaySnapshot): Candle[] {
  return snapshot.completedCandles.filter((candle) => candle.instrumentId === REPLAY_INSTRUMENT).map(({ instrumentId: _instrumentId, ...candle }) => candle);
}

export function MarketReplayLab() {
  const tape = useMemo(() => createOfflineReplayTape(), []);
  const [clockPolicy, setClockPolicy] = useState<MarketReplayClockPolicy>("event-time");
  const controller = useMemo(() => new MarketReplayController({ tape, clockPolicy, checkpointInterval: 8, maxMaterializedTrades: 100 }), [clockPolicy, tape]);
  const [state, setState] = useState<MarketReplayState>(() => controller.getState());
  const [snapshot, setSnapshot] = useState<MarketReplaySnapshot>(() => controller.getSnapshot());
  const pendingDispose = useRef<{ controller: MarketReplayController; timer: number } | null>(null);

  useEffect(() => {
    const pending = pendingDispose.current;
    if (pending !== null) {
      window.clearTimeout(pending.timer);
      pendingDispose.current = null;
      if (pending.controller !== controller) pending.controller.dispose();
    }
    const unsubscribe = controller.subscribe((nextState) => {
      setState(nextState);
      setSnapshot(controller.getSnapshot());
    });
    controller.start();
    return () => {
      unsubscribe();
      const timer = window.setTimeout(() => {
        controller.dispose();
        if (pendingDispose.current?.controller === controller) pendingDispose.current = null;
      }, 0);
      pendingDispose.current = { controller, timer };
    };
  }, [controller]);

  const run = (operation: () => void): void => {
    try {
      operation();
    } catch {
      // The controller exposes the structured error state; the Lab remains
      // usable for reset/exit without presenting fabricated success.
    }
  };
  const candles = displayCandles(snapshot);
  const max = Math.max(0, state.eligibleEvents - 1);
  const currentIndex = state.eventIndex ?? -1;
  const currentBook = snapshot.orderBooks.find((book) => book.state.instrumentId === REPLAY_INSTRUMENT)?.state;

  return <section className={styles.comparisonPanel} aria-label="Market Replay Lab" data-testid="market-replay-lab">
    <div className={styles.panelHeading}><div><h2>Market Replay Lab</h2><small>Unified offline candle, trade, CVD, Footprint, and Level-2 research timeline.</small></div><span data-replay-state={state.state}>{state.processedEvents}/{state.eligibleEvents}</span></div>
    <p className={styles.orderFlowDisclaimer}>Deterministic fixture only. Displayed liquidity is historical observation, not executable fill evidence.</p>
    <div className={styles.comparisonControls}>
      <label>Dataset<select aria-label="Replay dataset"><option>Offline BTC fixture · 24 bars</option></select></label>
      <label>Instrument<select aria-label="Replay instrument"><option>{REPLAY_INSTRUMENT}</option></select></label>
      <label>Clock<select aria-label="Replay clock policy" value={clockPolicy} onChange={(event) => setClockPolicy(event.target.value as MarketReplayClockPolicy)}><option value="event-time">Event time</option><option value="receive-time">Recorded receive time</option></select></label>
      <label>Speed<select aria-label="Replay speed" value={state.speed} onChange={(event) => run(() => controller.setSpeed(Number(event.target.value)))}>{[0.5, 1, 2, 5, 10].map((speed) => <option key={speed} value={speed}>{speed}×</option>)}</select></label>
    </div>
    <div className={styles.replayControls}>
      <button type="button" onClick={() => run(() => controller.reset())}>Reset</button>
      <button type="button" onClick={() => run(() => controller.stepPreviousEvent())} disabled={currentIndex < 0}>Previous event</button>
      <button type="button" onClick={() => run(() => controller.stepNextEvent())}>Next event</button>
      <button type="button" onClick={() => run(() => controller.stepNextCompletedCandle())}>Next completed candle</button>
      <button type="button" onClick={() => run(() => state.state === "playing" ? controller.pause() : controller.play())}>{state.state === "playing" ? "Pause" : "Play"}</button>
      <button type="button" onClick={() => run(() => controller.exit())}>Exit</button>
    </div>
    <label>Seek timeline<input aria-label="Replay event position" type="range" min="-1" max={max} value={currentIndex} onChange={(event) => { const target = controller.getEligibleEvent(Number(event.target.value)); if (target !== null) run(() => controller.seekToEvent(target.id)); }} /></label>
    <div className={styles.orderFlowSummary} aria-live="polite"><span>Clock <strong>{state.clockPolicy}</strong></span><span>Cursor <strong>{state.eventId ?? "—"}</strong></span><span>Coverage <strong>{snapshot.integrity.complete ? "complete" : "uncertain"}</strong></span><span>CVD <strong>{snapshot.cvd[0]?.value.toFixed(2) ?? "0.00"}</strong></span><span>Trades <strong>{snapshot.trades.length}</strong></span><span>Book <strong>{currentBook?.status ?? "unavailable"}</strong></span></div>
    <FinancialChart candles={candles} theme="dark" timeZone="UTC" style={{ height: 260, width: "100%" }} />
    <div className={styles.comparisonControls}>
      <details open><summary>Time &amp; Sales ({snapshot.trades.length})</summary><ul className={styles.timeAndSalesList}>{snapshot.trades.slice(-8).reverse().map((trade) => <li key={`${trade.id}:${trade.revision}`}><time>{new Date(trade.time).toISOString().slice(11, 19)}</time><span>{trade.price.toFixed(2)}</span><span>{trade.quantity.toFixed(2)}</span><strong>{trade.aggressorSide}</strong></li>)}</ul></details>
      <details open><summary>CVD and Footprint</summary><p>CVD {snapshot.cvd[0]?.value.toFixed(2) ?? "0.00"} · unknown volume {snapshot.cvd[0]?.unknownVolume.toFixed(2) ?? "0.00"}</p><ul className={styles.timeAndSalesList}>{snapshot.footprint.slice(-8).reverse().map((cell) => <li key={`${cell.time}:${cell.price}`}><time>{new Date(cell.time).toISOString().slice(11, 19)}</time><span>{cell.price.toFixed(2)}</span><strong>Buy {cell.buyVolume.toFixed(2)}</strong><span>Sell {cell.sellVolume.toFixed(2)}</span><span>Unknown {cell.unknownVolume.toFixed(2)}</span></li>)}</ul></details>
      <details open><summary>Current depth</summary><small>{currentBook?.reason ?? currentBook?.status ?? "No eligible Level-2 state"}</small>{currentBook === undefined ? null : <ul className={styles.timeAndSalesList}>{[...currentBook.bids.slice(0, 3), ...currentBook.asks.slice(0, 3)].map((level, index) => <li key={`${level.price}:${index}`}><span>{level.price.toFixed(2)}</span><strong>{level.quantity.toFixed(2)}</strong></li>)}</ul>}</details>
      <details><summary>Event inspector</summary><pre>{state.currentEvent === null ? "No event selected" : JSON.stringify(state.currentEvent, null, 2)}</pre></details>
    </div>
    <small>Source {tape.sources[0]?.id}@{tape.sources[0]?.version} · fingerprint {tape.fingerprint} · {state.integrity.notes.join(" ") || "No integrity warnings"}</small>
  </section>;
}
