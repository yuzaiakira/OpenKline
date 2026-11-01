"use client";

/**
 * Internal Next.js client-only Widget bridge.
 *
 * PROPOSAL — NOT A PUBLISHED API. Imports the internal Widget module path via
 * the local openkline workspace mapping used by this example app. React remains
 * optional; Core/Widget do not depend on Next.js.
 */
import { StrictMode, useEffect, useRef, useState } from "react";
import type { Candle } from "openkline";

type InternalWidget = {
  getState(): { status: string; layout: string; symbol: string | null };
  getDiagnostics(): { destroyed: boolean; canvasCount: number; pendingDataRequest: boolean };
  setLayout(layout: "single" | "two-horizontal"): void;
  addIndicator(id: string, options?: object): string;
  subscribe(listener: (event: { type: string }) => void): () => void;
  destroy(): void;
};

type CreateWidget = (options: {
  container: HTMLElement;
  data: readonly Candle[];
  dataIdentity: { symbol: string; timeframe: string };
  chartOptions?: { autoSize?: boolean; theme?: "light" | "dark" };
  layout?: "single" | "two-horizontal";
}) => InternalWidget;

const candles: Candle[] = Array.from({ length: 40 }, (_, index) => {
  const close = 120 + Math.sin(index / 5) * 3 + index * 0.2;
  return {
    time: Date.UTC(2026, 0, 1) + index * 60_000,
    open: close - 0.4,
    high: close + 1,
    low: close - 1,
    close,
    volume: 800 + index * 9,
  };
});

function useInternalWidgetFactory(): CreateWidget | null {
  const [factory, setFactory] = useState<CreateWidget | null>(null);
  useEffect(() => {
    let cancelled = false;
    // Relative path to built internal Widget entry (not a published package export).
    void import("../../../../dist/src/widget/index.js").then((module) => {
      if (!cancelled) setFactory(() => module.createOpenKlineWidget as CreateWidget);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return factory;
}

function WidgetHost({ remountKey }: { remountKey: number }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<InternalWidget | null>(null);
  const createWidget = useInternalWidgetFactory();
  const [events, setEvents] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (createWidget === null || hostRef.current === null) return;
    const host = hostRef.current;
    // Guard against Strict Mode double-invoke creating two live Widgets.
    widgetRef.current?.destroy();
    const widget = createWidget({
      container: host,
      data: candles,
      dataIdentity: { symbol: "NXT-USD", timeframe: "1m" },
      chartOptions: { autoSize: true, theme: "dark" },
      layout: "single",
    });
    widgetRef.current = widget;
    const unsubscribe = widget.subscribe((event) => {
      setEvents((previous) => [...previous.slice(-12), event.type]);
      if (event.type === "ready") setReady(true);
    });
    widget.addIndicator("SMA", { pane: "main", period: 5 });
    widget.setLayout("two-horizontal");
    return () => {
      unsubscribe();
      widget.destroy();
      if (widgetRef.current === widget) widgetRef.current = null;
      setReady(false);
    };
  }, [createWidget, remountKey]);

  return (
    <section>
      <div
        ref={hostRef}
        data-openkline-widget-host=""
        style={{ width: "100%", height: 520, border: "1px solid #334155", borderRadius: 8 }}
      />
      <pre data-openkline-widget-events="">{events.join(",")}</pre>
      <p data-openkline-widget-ready="">{ready ? "ready" : "pending"}</p>
      <p data-openkline-widget-remount="{remountKey}">remount={remountKey}</p>
    </section>
  );
}

export default function WidgetIntegrationClient() {
  const [remountKey, setRemountKey] = useState(0);
  const [mounted, setMounted] = useState(true);

  return (
    <main style={{ maxWidth: 960, margin: "1.5rem auto", padding: "0 1rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>Internal Widget — Next.js client integration</h1>
      <p>
        Client-only DOM initialization. No server Datafeed, authentication, or OpenKline backend.
        Import path is the internal Widget module — <strong>not a published package API</strong>.
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button type="button" onClick={() => setRemountKey((value) => value + 1)}>Remount</button>
        <button type="button" onClick={() => setMounted((value) => !value)}>{mounted ? "Unmount" : "Mount"}</button>
      </div>
      <StrictMode>
        {mounted ? <WidgetHost remountKey={remountKey} /> : <p data-openkline-widget-unmounted="">Widget unmounted</p>}
      </StrictMode>
    </main>
  );
}
