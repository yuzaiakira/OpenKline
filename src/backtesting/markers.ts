import type { Candle } from "../types.js";
import type { BacktestResult } from "./types.js";

export type StrategyMarkerKind = "entry-signal" | "entry-fill" | "exit-signal" | "exit-fill";
export type StrategyMarkerDirection = "long" | "short";

export interface StrategyMarker {
  readonly id: string;
  readonly kind: StrategyMarkerKind;
  readonly direction: StrategyMarkerDirection;
  readonly time: number;
  readonly price: number;
  readonly label: string;
  readonly color?: string;
}

/** Converts a completed backtest to chart anchors without mutating chart data. */
export function createStrategyMarkers(result: BacktestResult, candles: readonly Candle[]): StrategyMarker[] {
  const byTime = new Map(candles.map((candle) => [candle.time, candle]));
  const markers: StrategyMarker[] = [];
  for (const signal of result.signals) {
    const candle = byTime.get(signal.time);
    if (candle === undefined) continue;
    const entry = signal.action === "enter-long" || signal.action === "enter-short";
    const direction: StrategyMarkerDirection = signal.action.endsWith("short") ? "short" : "long";
    const kind: StrategyMarkerKind = entry ? "entry-signal" : "exit-signal";
    markers.push({
      id: `${signal.id}-${kind}`,
      kind,
      direction,
      time: signal.time,
      price: candle.close,
      label: entry ? "Signal entry" : "Signal exit",
      color: direction === "long" ? "#22c55e" : "#ef4444",
    });
  }
  for (const order of result.orders) {
    if (order.status !== "filled" || order.executionPrice === undefined || order.fillTime === undefined) continue;
    const entry = order.action === "enter-long" || order.action === "enter-short";
    const direction: StrategyMarkerDirection = order.action.endsWith("short") ? "short" : "long";
    const kind: StrategyMarkerKind = entry ? "entry-fill" : "exit-fill";
    markers.push({
      id: `${order.id}-${kind}`,
      kind,
      direction,
      time: order.fillTime,
      price: order.executionPrice,
      label: entry ? "Entry fill" : "Exit fill",
      color: direction === "long" ? "#16a34a" : "#dc2626",
    });
  }
  return markers;
}
