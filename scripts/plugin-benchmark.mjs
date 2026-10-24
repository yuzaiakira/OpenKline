import { performance } from "node:perf_hooks";
import { PluginRegistry, createDefaultIndicatorRegistry } from "../dist/src/index.js";

const iterations = 200;
const candles = Array.from({ length: 100_000 }, (_, index) => {
  const close = 100 + Math.sin(index / 31) * 4 + index * 0.001;
  return { time: index + 1, open: close - 0.5, high: close + 1, low: close - 1, close };
});

const host = {
  registerIndicator: () => () => undefined,
  registerDrawingTool: () => () => undefined,
  registerOverlay: () => () => undefined,
  subscribe: () => () => undefined,
};

function sample(operation) {
  const values = [];
  for (let index = 0; index < iterations; index += 1) {
    const start = performance.now();
    operation(index);
    values.push(performance.now() - start);
  }
  values.sort((left, right) => left - right);
  return {
    medianMs: Number((values[Math.floor(values.length / 2)] ?? 0).toFixed(4)),
    p95Ms: Number((values[Math.floor(values.length * 0.95)] ?? 0).toFixed(4)),
  };
}

const lifecycle = sample((index) => {
  const registry = new PluginRegistry(host);
  const handle = registry.install({
    metadata: { id: `benchmark.plugin.${index}`, name: "Benchmark", version: "1.0.0", apiVersion: 1 },
    setup(context) {
      context.state.set("iteration", index);
      context.commands.register({ id: `benchmark.plugin.${index}.run`, title: "Run", execute: () => index });
    },
  });
  registry.executeCommand(`benchmark.plugin.${index}.run`);
  handle.dispose();
  registry.dispose();
});

const indicatorRegistry = createDefaultIndicatorRegistry();
const indicator = indicatorRegistry.create("SMA", { period: 20 });
const indicatorInit = sample(() => {
  indicator.setInput(candles);
});
indicator.dispose();

const workspace = JSON.stringify({ version: 1, candles, pluginState: { enabled: true } });
const workspaceRoundTrip = sample(() => {
  JSON.parse(workspace);
});

console.log(JSON.stringify({
  node: process.version,
  iterations,
  dataset: candles.length,
  lifecycle,
  indicatorInit,
  workspaceRoundTrip,
  note: "Registry/engine microbenchmark; not a Canvas2D or cross-device performance claim.",
}, null, 2));
