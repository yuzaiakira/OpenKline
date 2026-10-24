"use client";

import { FinancialChart } from "@openkline/react";

const candles = Array.from({ length: 80 }, (_, index) => {
  const close = 100 + Math.sin(index / 7) * 8 + index * 0.08;
  const open = close - Math.cos(index) * 1.8;
  return {
    time: Date.UTC(2026, 0, 1) + index * 60 * 60 * 1000,
    open,
    high: Math.max(open, close) + 2.2,
    low: Math.min(open, close) - 2.2,
    close,
  };
});

export default function ChartClient() {
  return (
    <FinancialChart
      candles={candles}
      theme="dark"
      autoSize
      style={{ height: 520 }}
      indicators={[
        { indicatorId: "RSI", options: { period: 14, pane: "new" } },
        { indicatorId: "MACD", options: { fastPeriod: 5, slowPeriod: 12, signalPeriod: 4, pane: "new" } },
      ]}
      drawings={[{
        type: "trend-line",
        options: {
          id: "next-example-trend",
          points: [
            { time: candles[12]!.time, price: candles[12]!.low },
            { time: candles[42]!.time, price: candles[42]!.high },
          ],
          style: { color: "#f59e0b", lineWidth: 2 },
        },
      }]}
    />
  );
}
