import type { PaperOrder } from "./types.js";

export type PaperTradingMarkerKind = "entry-fill" | "exit-fill";

export interface PaperTradingMarker {
  readonly id: string;
  readonly kind: PaperTradingMarkerKind;
  readonly direction: "long";
  readonly time: number;
  readonly price: number;
  readonly label: string;
  readonly color?: string;
}

/** Convert filled simulated orders into non-persistent chart markers. */
export function createPaperTradingMarkers(orders: readonly PaperOrder[]): PaperTradingMarker[] {
  return orders.flatMap((order) => {
    if (order.status !== "filled" || order.fill === undefined) return [];
    const entry = order.side === "buy";
    return [{ id: `paper-${order.id}`, kind: entry ? "entry-fill" : "exit-fill", direction: "long", time: order.fill.time, price: order.fill.executionPrice, label: `${entry ? "Paper buy" : "Paper sell"} ${order.quantity}`, color: entry ? "#34d399" : "#fb7185" }];
  });
}

export function validatePaperTradingMarkers(markers: readonly PaperTradingMarker[]): PaperTradingMarker[] {
  const ids = new Set<string>();
  return markers.map((marker) => {
    if (typeof marker.id !== "string" || marker.id.length === 0 || ids.has(marker.id) || (marker.kind !== "entry-fill" && marker.kind !== "exit-fill") || marker.direction !== "long" || !Number.isInteger(marker.time) || marker.time < 0 || !Number.isFinite(marker.price) || marker.price <= 0 || typeof marker.label !== "string") throw new Error(`Invalid paper trading marker: ${marker.id}`);
    ids.add(marker.id);
    return { ...marker };
  });
}
