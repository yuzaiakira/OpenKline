"use client";

import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import { FinancialChart } from "@openkline/react";
import type { FinancialChartHandle } from "@openkline/react";
import type { OpenKlinePlugin, WorkspaceDocument } from "openkline";

const baseCandles = Array.from({ length: 16 }, (_, index) => {
  const close = 100 + index;
  return {
    time: Date.UTC(2026, 0, 1) + index * 60 * 60 * 1000,
    open: close - 0.5,
    high: close + 1,
    low: close - 1,
    close,
  };
});

const lifecyclePlugin: OpenKlinePlugin = {
  metadata: {
    id: "example.react-lifecycle",
    name: "React lifecycle verification",
    version: "1.0.0",
    apiVersion: 1,
  },
  setup() {
    const state = globalThis as typeof globalThis & { __openKlineReactLifecycle?: { setup: number; cleanup: number } };
    state.__openKlineReactLifecycle ??= { setup: 0, cleanup: 0 };
    state.__openKlineReactLifecycle.setup += 1;
    return () => {
      state.__openKlineReactLifecycle!.cleanup += 1;
    };
  },
};

interface Snapshot {
  candles: number;
  indicators: string[];
  drawings: Array<{ id: string; pointTime: number }>;
  plugins: number;
  theme: string;
  setup: number;
  cleanup: number;
}

export default function LifecycleVerificationPage() {
  const handleRef = useRef<FinancialChartHandle>(null);
  const [revision, setRevision] = useState(0);
  const [mounted, setMounted] = useState(true);
  const [workspace, setWorkspace] = useState<WorkspaceDocument>();
  const [omitDeclarativeProps, setOmitDeclarativeProps] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  const publishSnapshot = useCallback(() => {
    const chart = handleRef.current?.getChart();
    if (chart === null || chart === undefined) {
      setSnapshot(null);
      return;
    }
    const lifecycle = (globalThis as typeof globalThis & { __openKlineReactLifecycle?: { setup: number; cleanup: number } }).__openKlineReactLifecycle ?? { setup: 0, cleanup: 0 };
    const document = chart.serializeWorkspace();
    setSnapshot({
      candles: chart.getData().length,
      indicators: document.indicators.map((indicator) => indicator.id).sort(),
      drawings: chart.getDrawings().map((drawing) => ({ id: drawing.id, pointTime: drawing.points[0]?.time ?? -1 })),
      plugins: chart.getPlugins().length,
      theme: document.chart.theme.background,
      setup: lifecycle.setup,
      cleanup: lifecycle.cleanup,
    });
  }, []);

  useEffect(() => {
    const id = window.setTimeout(publishSnapshot, 0);
    return () => window.clearTimeout(id);
  }, [mounted, omitDeclarativeProps, publishSnapshot, revision, theme, workspace]);

  const restoreWithoutDataProps = (): void => {
    const chart = handleRef.current?.getChart();
    if (chart === null || chart === undefined) return;
    setWorkspace(chart.serializeWorkspace());
    setOmitDeclarativeProps(true);
  };

  const mutateDrawing = (): void => {
    const chart = handleRef.current?.getChart();
    if (chart === null || chart === undefined) return;
    const document = chart.serializeDrawings();
    chart.restoreDrawings({
      version: 1,
      drawings: document.drawings.map((drawing) => drawing.id === "lifecycle-trend"
        ? { ...drawing, points: drawing.points.map((point, index) => index === 0 ? { ...point, time: point.time + 60_000 } : point) }
        : drawing),
    });
    publishSnapshot();
  };

  const removeDrawingImperatively = (): void => {
    handleRef.current?.getChart()?.removeDrawing("lifecycle-trend");
    publishSnapshot();
  };

  const candles = baseCandles.map((candle) => ({ ...candle }));

  return (
    <main style={{ maxWidth: 960, margin: "2rem auto", padding: "0 1rem" }}>
      <h1>React lifecycle verification</h1>
      <p>This private test route uses only the public OpenKline React and chart APIs.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <button type="button" onClick={() => setRevision((value) => value + 1)}>Rerender equivalent props</button>
        <button type="button" onClick={mutateDrawing}>Move declarative drawing</button>
        <button type="button" onClick={removeDrawingImperatively}>Remove declarative drawing imperatively</button>
        <button type="button" onClick={restoreWithoutDataProps}>Restore workspace without data props</button>
        <button type="button" onClick={() => setTheme((value) => value === "dark" ? "light" : "dark")}>Toggle theme</button>
        <button type="button" onClick={() => setMounted((value) => !value)}>{mounted ? "Unmount" : "Remount"}</button>
      </div>
      <output data-testid="lifecycle-snapshot" aria-live="polite">{JSON.stringify(snapshot)}</output>
      {mounted ? (
        <StrictMode>
          <FinancialChart
            ref={handleRef}
            workspace={workspace}
            theme={theme}
            autoSize
            style={{ height: 460, marginTop: 16 }}
            plugins={[lifecyclePlugin]}
            {...(omitDeclarativeProps ? {} : {
              candles,
              indicators: [{ id: "lifecycle-rsi", indicatorId: "RSI", options: { period: 5, pane: "new" } }],
              drawings: [{
                type: "trend-line",
                options: {
                  id: "lifecycle-trend",
                  points: [
                    { time: candles[2]!.time, price: candles[2]!.low },
                    { time: candles[12]!.time, price: candles[12]!.high },
                  ],
                  style: { color: "#f59e0b", lineWidth: 2 },
                },
              }],
            })}
          />
        </StrictMode>
      ) : null}
    </main>
  );
}
