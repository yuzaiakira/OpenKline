import type { MarketReplayCompletedCandle, MarketReplayController, MarketReplaySnapshot, MarketReplayState } from "./market-replay-controller.js";
import type { MarketTrade } from "../market-trades.js";

export interface MarketReplayPanelRegistration {
  readonly id: string;
  readonly instrumentId: string;
}

export interface MarketReplayPanelSnapshot {
  readonly panel: MarketReplayPanelRegistration;
  readonly replay: MarketReplaySnapshot;
  readonly completedCandles: readonly MarketReplayCompletedCandle[];
  readonly formingCandles: readonly MarketReplaySnapshot["formingCandles"][number][];
  readonly trades: readonly MarketTrade[];
  readonly orderBooks: readonly MarketReplaySnapshot["orderBooks"][number][];
}

export type MarketReplayPanelListener = (snapshot: MarketReplayPanelSnapshot) => void;

/**
 * Routes one deterministic replay cursor to independent chart panels. Panel
 * registration is deliberately explicit: removing a panel only removes its
 * listener and never disposes the shared controller or another panel.
 */
export class MarketReplayCoordinator {
  private readonly panels = new Map<string, { registration: MarketReplayPanelRegistration; listeners: Set<MarketReplayPanelListener> }>();
  private readonly unsubscribeController: () => void;
  private disposed = false;

  public constructor(private readonly controller: MarketReplayController) {
    this.unsubscribeController = controller.subscribe((state) => this.handleState(state));
  }

  public registerPanel(registration: MarketReplayPanelRegistration, listener?: MarketReplayPanelListener): () => void {
    this.assertAlive();
    if (registration.id.trim().length === 0 || registration.instrumentId.trim().length === 0) throw new Error("Replay panel id and instrumentId are required");
    if (this.panels.has(registration.id)) throw new Error(`Replay panel ${registration.id} is already registered`);
    const listeners = new Set<MarketReplayPanelListener>();
    if (listener !== undefined) listeners.add(listener);
    this.panels.set(registration.id, { registration: { id: registration.id, instrumentId: registration.instrumentId }, listeners });
    const current = this.getPanelSnapshot(registration.id);
    for (const callback of listeners) callback(current);
    return () => this.removePanel(registration.id);
  }

  public removePanel(panelId: string): void {
    this.assertAlive();
    this.panels.delete(panelId);
  }

  public setPanelInstrument(panelId: string, instrumentId: string): void {
    this.assertAlive();
    const panel = this.panels.get(panelId);
    if (panel === undefined) throw new Error(`Replay panel ${panelId} is not registered`);
    if (instrumentId.trim().length === 0) throw new Error("Replay panel instrumentId is required");
    panel.registration = { ...panel.registration, instrumentId };
    this.emitPanel(panel);
  }

  public subscribePanel(panelId: string, listener: MarketReplayPanelListener): () => void {
    this.assertAlive();
    const panel = this.panels.get(panelId);
    if (panel === undefined) throw new Error(`Replay panel ${panelId} is not registered`);
    panel.listeners.add(listener);
    listener(this.getPanelSnapshot(panelId));
    return () => panel.listeners.delete(listener);
  }

  public getPanelSnapshot(panelId: string): MarketReplayPanelSnapshot {
    this.assertAlive();
    const panel = this.panels.get(panelId);
    if (panel === undefined) throw new Error(`Replay panel ${panelId} is not registered`);
    const replay = this.controller.getSnapshot({ instrumentId: panel.registration.instrumentId });
    return filterPanelSnapshot(panel.registration, replay);
  }

  public getRegisteredPanels(): readonly MarketReplayPanelRegistration[] {
    this.assertAlive();
    return [...this.panels.values()].map(({ registration }) => ({ ...registration }));
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeController();
    this.panels.clear();
  }

  private handleState(_state: MarketReplayState): void {
    if (this.disposed) return;
    for (const panel of this.panels.values()) this.emitPanel(panel);
  }

  private emitPanel(panel: { registration: MarketReplayPanelRegistration; listeners: Set<MarketReplayPanelListener> }): void {
    const snapshot = filterPanelSnapshot(panel.registration, this.controller.getSnapshot({ instrumentId: panel.registration.instrumentId }));
    for (const listener of [...panel.listeners]) listener(snapshot);
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error("Market replay coordinator has been disposed");
  }
}

function filterPanelSnapshot(panel: MarketReplayPanelRegistration, replay: MarketReplaySnapshot): MarketReplayPanelSnapshot {
  return {
    panel: { ...panel },
    replay,
    completedCandles: replay.completedCandles.filter((candle) => candle.instrumentId === panel.instrumentId).map((candle) => ({ ...candle })),
    formingCandles: replay.formingCandles.filter((candle) => candle.instrumentId === panel.instrumentId).map((candle) => ({ ...candle })),
    trades: replay.trades.filter((trade) => trade.instrumentId === panel.instrumentId).map((trade) => ({ ...trade, source: { ...trade.source } })),
    orderBooks: replay.orderBooks.filter((book) => book.state.instrumentId === panel.instrumentId).map((book) => ({ key: book.key, state: { ...book.state, source: book.state.source === null ? null : { ...book.state.source }, bids: book.state.bids.map((level) => ({ ...level })), asks: book.state.asks.map((level) => ({ ...level })) } })),
  };
}
