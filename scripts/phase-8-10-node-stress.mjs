#!/usr/bin/env node
/**
 * Phase 8.10 node stress: realtime market integrity + advanced module stability.
 * Profiles: ci | local | soak (OPENKLINE_STRESS_PROFILE).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { CandleStore, InMemoryDatafeed, RestDatafeed, WebSocketDatafeed } from "../dist/src/index.js";
import { runAdvancedModuleStress } from "./phase-8-10/advanced-modules.mjs";
import { assertSeriesEqual } from "./phase-8-10/expected-state.mjs";
import { createMarketScenario } from "./phase-8-10/market-events.mjs";
import { resolveProfile } from "./phase-8-10/profiles.mjs";
import { createRng } from "./phase-8-10/rng.mjs";

const profile = resolveProfile();
const rng = createRng(profile.seed);
const startedAt = performance.now();
const samples = [];
const latencyMs = [];

class FakeSocket {
  constructor() {
    this.readyState = 0;
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
  }
  send() {}
  close() {
    this.onclose?.();
  }
  open() {
    this.onopen?.();
  }
  emit(data) {
    this.onmessage?.({ data });
  }
  fail() {
    this.onerror?.(new Error("disconnect"));
    this.close();
  }
}

function recordSample(label, extra = {}) {
  const mem = process.memoryUsage();
  samples.push({
    atMs: Number((performance.now() - startedAt).toFixed(1)),
    label,
    rss: mem.rss,
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    external: mem.external,
    ...extra,
  });
}

async function runRealtimeIntegrity() {
  const scenario = createMarketScenario(rng, { seedCount: 48 });
  const store = new CandleStore();
  store.setData(scenario.seed);

  const feedA = new InMemoryDatafeed({ symbol: "BTCUSD", timezone: "UTC", pricePrecision: 2 }, scenario.seed);
  const feedB = new InMemoryDatafeed({ symbol: "BTCUSD", timezone: "UTC", pricePrecision: 2 }, scenario.seed);
  const receivedA = [];
  const receivedB = [];
  const stopA = feedA.subscribeBars({ symbol: "BTCUSD", timeframe: "1m", onBar: (bar) => receivedA.push({ ...bar }) });
  const stopB = feedB.subscribeBars({ symbol: "BTCUSD", timeframe: "1m", onBar: (bar) => receivedB.push({ ...bar }) });

  const sockets = [];
  const ws = new WebSocketDatafeed({
    url: "ws://stress.example.test/stream",
    symbols: { BTCUSD: { symbol: "BTCUSD", timezone: "UTC", pricePrecision: 2 } },
    historical: new InMemoryDatafeed({ symbol: "BTCUSD", timezone: "UTC", pricePrecision: 2 }, scenario.seed),
    initialBackoffMs: 1,
    maxBackoffMs: 1,
    maxReconnectAttempts: 8,
    createSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      queueMicrotask(() => socket.open());
      return socket;
    },
  });
  const wsBars = [];
  const stopWs = ws.subscribeBars({
    symbol: "BTCUSD",
    timeframe: "1m",
    onBar: (bar) => wsBars.push({ ...bar }),
  });
  await new Promise((resolve) => setTimeout(resolve, 5));

  let processed = 0;
  let rejected = 0;
  let activeGeneration = 0;
  const deadline = startedAt + profile.maxDurationMs;

  while (processed < profile.eventCount && performance.now() < deadline) {
    const eventStart = performance.now();
    const event = scenario.nextEvent();
    activeGeneration = event.generation;

    if (event.kind === "symbol_switch" || event.kind === "timeframe_switch") {
      // Stale cross-symbol/timeframe deliveries must not mutate the oracle BTCUSD store.
      scenario.markStaleCrossSymbolBlocked();
    } else if (event.kind === "reconnect") {
      const socket = sockets[sockets.length - 1];
      socket?.fail();
      await new Promise((resolve) => setTimeout(resolve, 2));
    } else if (event.kind === "delayed_rest") {
      let page = 0;
      const rest = new RestDatafeed({
        baseUrl: "https://stress.example.test",
        symbols: { [event.symbol]: { symbol: event.symbol, timezone: "UTC", pricePrecision: 2 } },
        fetcher: async () => {
          await new Promise((resolve) => setTimeout(resolve, event.delayMs));
          page += 1;
          return new Response(JSON.stringify({ bars: event.bars, next: null }), { status: 200 });
        },
      });
      const bars = await rest.getBars({
        symbol: event.symbol,
        timeframe: event.timeframe,
        from: event.bars[0]?.time ?? 0,
        to: (event.bars.at(-1)?.time ?? 0) + 1,
      });
      if (bars.length !== event.bars.length) {
        throw new Error(`delayed REST length mismatch ${bars.length} vs ${event.bars.length}`);
      }
    } else if (event.kind === "aborted_rest") {
      const controller = new AbortController();
      controller.abort();
      const rest = new RestDatafeed({
        baseUrl: "https://stress.example.test",
        symbols: { BTCUSD: { symbol: "BTCUSD", timezone: "UTC", pricePrecision: 2 } },
        fetcher: async () => new Response(JSON.stringify({ bars: [] }), { status: 200 }),
      });
      await assertRejectsAborted(rest.getBars({
        symbol: "BTCUSD",
        timeframe: "1m",
        from: 0,
        to: 1,
        signal: controller.signal,
      }));
    } else if (event.candle !== undefined) {
      try {
        store.update(event.candle);
        if (event.symbol === "BTCUSD") {
          feedA.pushBar(event.candle);
          feedB.pushBar(event.candle);
          const live = sockets[sockets.length - 1];
          live?.emit(JSON.stringify({ symbol: "BTCUSD", timeframe: "1m", candle: event.candle }));
        } else {
          scenario.markStaleCrossSymbolBlocked();
        }
      } catch {
        rejected += 1;
      }
    }

    processed += 1;
    // Reservoir-style latency capture avoids multi-million arrays on soak.
    if (latencyMs.length < 20_000 || processed % 64 === 0) {
      if (latencyMs.length >= 20_000) latencyMs[processed % 20_000] = performance.now() - eventStart;
      else latencyMs.push(performance.now() - eventStart);
    }

    if (processed % profile.sampleEveryEvents === 0) {
      scenario.expected.assertChronological();
      assertSeriesEqual(store.getAll(), scenario.expected.snapshot(), `store@${processed}`);
      const times = store.getAll().map((c) => c.time);
      for (let i = 1; i < times.length; i += 1) {
        if (!(times[i] > times[i - 1])) throw new Error("store lost chronological order");
      }
      recordSample("realtime", {
        processed,
        rejected,
        storeSize: store.length,
        expectedStats: { ...scenario.expected.stats },
        meta: { ...scenario.meta },
        activeGeneration,
      });
    }
  }

  stopA();
  stopB();
  stopWs();
  scenario.expected.assertChronological();
  assertSeriesEqual(store.getAll(), scenario.expected.snapshot(), "final-store");

  // Multi-subscriber isolation: both feeds saw the same BTCUSD pushes.
  if (receivedA.length !== receivedB.length) {
    throw new Error(`subscriber divergence ${receivedA.length} vs ${receivedB.length}`);
  }

  return {
    processed,
    rejected,
    storeSize: store.length,
    expectedStats: scenario.expected.stats,
    meta: scenario.meta,
    subscriberEvents: receivedA.length,
    wsEvents: wsBars.length,
    reconnectSockets: sockets.length,
    timedOut: performance.now() >= deadline,
  };
}

async function assertRejectsAborted(promise) {
  try {
    await promise;
    throw new Error("expected aborted REST request to reject");
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "AbortError") {
      // RestDatafeed may wrap abort differently; accept message match.
      const message = error instanceof Error ? error.message : String(error);
      if (!/abort/i.test(message)) throw error;
    }
  }
}

function percentile(values, ratio) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(ratio * sorted.length) - 1));
  return sorted[index];
}

function maxValue(values) {
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (value > max) max = value;
  }
  return values.length === 0 ? 0 : max;
}

async function main() {
  mkdirSync("artifacts/phase-8-10", { recursive: true });
  recordSample("start");
  console.log(JSON.stringify({ phase: "8.10-node-stress", profile }, null, 2));

  const realtime = await runRealtimeIntegrity();
  recordSample("after-realtime", {
    processed: realtime.processed,
    storeSize: realtime.storeSize,
    rejected: realtime.rejected,
  });

  const advanced = runAdvancedModuleStress(rng, profile.advancedModuleRounds);
  recordSample("after-advanced", {
    rounds: advanced.rounds,
    klineScriptOk: advanced.klineScriptOk,
    replayOk: advanced.replayOk,
    backtestCancelOk: advanced.backtestCancelOk,
    paperOk: advanced.paperOk,
  });

  const elapsedMs = performance.now() - startedAt;
  const report = {
    phase: "8.10-node-stress",
    profile,
    elapsedMs: Number(elapsedMs.toFixed(1)),
    realtime,
    advanced: {
      rounds: advanced.rounds,
      klineScriptOk: advanced.klineScriptOk,
      replayOk: advanced.replayOk,
      backtestCancelOk: advanced.backtestCancelOk,
      paperOk: advanced.paperOk,
      observations: advanced.observations,
    },
    latency: {
      count: latencyMs.length,
      medianMs: Number(percentile(latencyMs, 0.5).toFixed(4)),
      p95Ms: Number(percentile(latencyMs, 0.95).toFixed(4)),
      maxMs: Number(maxValue(latencyMs).toFixed(4)),
    },
    samples,
    status: "pass",
  };

  const out = join("artifacts/phase-8-10", `node-stress-${profile.name}.json`);
  const payload = `${JSON.stringify(report, null, 2)}\n`;
  writeFileSync(out, payload);
  console.log(JSON.stringify({
    phase: report.phase,
    profile: report.profile.name,
    elapsedMs: report.elapsedMs,
    realtime: report.realtime,
    advanced: {
      rounds: report.advanced.rounds,
      klineScriptOk: report.advanced.klineScriptOk,
      replayOk: report.advanced.replayOk,
      backtestCancelOk: report.advanced.backtestCancelOk,
      paperOk: report.advanced.paperOk,
    },
    latency: report.latency,
    sampleCount: samples.length,
    status: report.status,
  }, null, 2));
  console.log(`wrote ${out}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
