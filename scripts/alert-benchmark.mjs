import { performance } from "node:perf_hooks";
import { AlertEngine } from "../dist/src/alerts/index.js";

const sizes = [1_000, 10_000, 100_000];

function candle(time, close) {
  return { time, open: close - 0.25, high: close + 0.75, low: close - 0.75, close, volume: 1_000 + time };
}

function definitions() {
  return [
    { id: "price", name: "Price", condition: { type: "price-above", value: 100 }, frequency: "once-per-bar" },
    { id: "cross", name: "Cross", condition: { type: "price-cross-above", value: 100 }, frequency: "every-event" },
    { id: "indicator", name: "Indicator", condition: { type: "indicator-above", indicatorId: "sma", outputId: "value", value: 100 }, frequency: "once-per-bar" },
    { id: "script", name: "Script", condition: { type: "script-cross-above", scriptId: "script-1", outputId: "signal", value: 100 }, frequency: "every-event" },
  ];
}

function run(size) {
  const engine = new AlertEngine({ maxHistory: 1_000 });
  for (const definition of definitions()) engine.add(definition);
  const started = performance.now();
  let liveEvents = 0;
  for (let index = 0; index < size; index += 1) {
    const close = 99 + (index % 7) * 0.5 + (index > size / 2 ? 2 : 0);
    liveEvents += engine.evaluate({
      candle: candle(index + 1, close),
      outputs: [
        { sourceId: "sma", outputId: "value", value: close, time: index + 1 },
        { sourceId: "script-1", outputId: "signal", value: close, time: index + 1 },
      ],
      mode: "live",
      sourceEvent: index === 0 ? "seed" : "append",
      isFinal: true,
    }).length;
  }
  const liveMs = performance.now() - started;
  const correctionStarted = performance.now();
  engine.evaluate({ candle: candle(size, 98), mode: "live", sourceEvent: "correction" });
  const correctionMs = performance.now() - correctionStarted;

  const replayStarted = performance.now();
  engine.reset("replay", true);
  let replayEvents = 0;
  for (let index = 0; index < size; index += 1) {
    const close = 99 + (index % 7) * 0.5 + (index > size / 2 ? 2 : 0);
    replayEvents += engine.evaluate({
      candle: candle(index + 1, close),
      outputs: [{ sourceId: "sma", outputId: "value", value: close, time: index + 1 }],
      mode: "replay",
      sourceEvent: index === 0 ? "seed" : "append",
      isFinal: true,
    }).length;
  }
  const replayMs = performance.now() - replayStarted;
  const historyLength = engine.historyFor().length;
  const disposeStarted = performance.now();
  engine.dispose();
  const disposeMs = performance.now() - disposeStarted;
  return { size, liveMs, correctionMs, replayMs, disposeMs, liveEvents, replayEvents, historyLength };
}

console.log(JSON.stringify({
  environment: { node: process.version, date: new Date().toISOString() },
  scenarios: sizes.map(run),
  notes: [
    "Node engine measurements only; this is not a Canvas2D or FPS benchmark.",
    "History is capped at 1,000 events and replay state is isolated from live state.",
    "Timing is workload evidence, not a universal performance guarantee.",
  ],
}, null, 2));
