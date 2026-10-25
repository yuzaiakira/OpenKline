import { performance } from "node:perf_hooks";
import { compileKlineScript, createDefaultIndicatorRegistry } from "../dist/src/index.js";

const source = [
  'indicator("Benchmark EMA")',
  'period = input.int("Period", default=21, min=1, max=500)',
  "value = ta.ema(close, period)",
  "plot(value)",
].join("\n");

const compileStart = performance.now();
const compiled = compileKlineScript(source);
const compileMs = performance.now() - compileStart;
if (!compiled.success) {
  console.error(compiled.diagnostics);
  process.exitCode = 1;
} else {
  const rows = [1_000, 10_000, 100_000].map((size) => {
    const input = candles(size);
    const samples = [];
    let result;
    for (let iteration = 0; iteration < 3; iteration += 1) {
      const start = performance.now();
      result = compiled.program.execute(input);
      samples.push(performance.now() - start);
    }
    return {
      candles: size,
      medianMs: percentile(samples, 0.5),
      p95Ms: percentile(samples, 0.95),
      operations: result?.operations ?? 0,
      outputPoints: result?.outputs.reduce((sum, output) => sum + output.points.length, 0) ?? 0,
    };
  });

  const registry = createDefaultIndicatorRegistry();
  registry.register(compiled.program.createIndicatorDefinition());
  const instance = registry.create(compiled.program.id, {});
  const initial = candles(1_000);
  instance.setInput(initial);
  const appendStart = performance.now();
  for (let index = 0; index < 10; index += 1) instance.update(candles(1, initial.at(-1)?.time + (index + 1) * 60_000)[0]);
  const appendMs = performance.now() - appendStart;
  instance.dispose();

  const concurrentStart = performance.now();
  const concurrent = Array.from({ length: 4 }, () => compiled.program.execute(candles(10_000)));
  const concurrentMs = performance.now() - concurrentStart;
  const controller = new AbortController();
  controller.abort();
  let cancellation = "not-observed";
  try {
    compiled.program.execute(candles(10), {}, { signal: controller.signal });
  } catch (error) {
    cancellation = error instanceof Error ? error.name : "unknown";
  }
  console.log(JSON.stringify({
    environment: { node: process.version, platform: process.platform, arch: process.arch },
    compileMs,
    historical: rows,
    appendTenUpdatesMs: appendMs,
    concurrentFourBy10000Ms: concurrentMs,
    concurrentOperations: concurrent.reduce((sum, item) => sum + item.operations, 0),
    cancellation,
    disposed: true,
  }, null, 2));
}

function candles(count, firstTime = Date.UTC(2026, 0, 1)) {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + Math.sin(index / 17) * 5 + index * 0.01;
    const open = close - 0.4;
    return { time: firstTime + index * 60_000, open, high: close + 1, low: open - 1, close, volume: 1000 + index };
  });
}

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))] ?? 0;
}
