import {
  BacktestCancellationError,
  compileKlineScript,
  createBacktest,
  createPaperTradingAccount,
  ReplayEngine,
  StrategyRegistry,
} from "../../dist/src/index.js";

function candles(count, start = Date.UTC(2026, 0, 1)) {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + Math.sin(index / 11) * 3 + index / 50;
    return {
      time: start + index * 60_000,
      open: close - 0.4,
      high: close + 1,
      low: close - 1,
      close,
      volume: 100 + index,
    };
  });
}

const stressStrategy = {
  metadata: {
    id: "STRESS_LONG_EXIT",
    name: "Stress Long Exit",
    version: 1,
    description: "Deterministic stress fixture.",
    parameters: [],
    requiredInputs: ["ohlcv"],
  },
  validateParameters: () => ({}),
  createEvaluator: () => ({
    evaluateBar: ({ index }) => {
      if (index === 0) return [{ action: "enter-long", reason: "stress entry" }];
      if (index === 8) return [{ action: "exit-long", reason: "stress exit" }];
      return [];
    },
  }),
};

/**
 * Sustained public-API exercise for KlineScript, replay, backtest cancellation,
 * and paper trading. Failures must stay isolated to the subsystem under test.
 */
export function runAdvancedModuleStress(rng, rounds) {
  const observations = [];
  let klineScriptOk = 0;
  let replayOk = 0;
  let backtestCancelOk = 0;
  let paperOk = 0;

  for (let round = 0; round < rounds; round += 1) {
    const size = 64 + rng.int(192);
    const history = candles(size, Date.UTC(2026, 2, 1) + round * 60_000);

    {
      const compiled = compileKlineScript([
        'indicator("Stress EMA", overlay=True)',
        'period = input.int("Period", default=8, min=1, max=50)',
        "value = ta.ema(close, period)",
        'plot(value, title="EMA")',
      ].join("\n"));
      if (!compiled.success) {
        throw new Error(`KlineScript compile failed under stress: ${JSON.stringify(compiled.diagnostics)}`);
      }
      klineScriptOk += 1;
    }

    {
      class ImmediateScheduler {
        setTimeout(callback) {
          callback();
          return 1;
        }
        clearTimeout() {}
      }
      const replay = new ReplayEngine({
        source: history,
        speed: 4,
        scheduler: new ImmediateScheduler(),
      });
      replay.start();
      replay.play();
      replay.pause();
      const mid = history[Math.floor(history.length / 2)]?.time;
      if (mid !== undefined) replay.seekToTimestamp(mid);
      replay.jumpToStart();
      replay.dispose();
      replay.dispose();
      replayOk += 1;
    }

    {
      const registry = new StrategyRegistry();
      registry.register(stressStrategy);
      let session;
      session = createBacktest({
        strategy: "STRESS_LONG_EXIT",
        parameters: {},
        candles: history,
        initialCapital: 10_000,
        positionSizing: { type: "fixed-quantity", quantity: 1 },
        commission: { type: "percent", value: 0 },
        slippage: { type: "percent", value: 0 },
        strategyRegistry: registry,
        onProgress: (progress) => {
          if (progress.phase === "signals" && progress.processedBars >= Math.min(16, history.length)) {
            session.cancel();
          }
        },
      });
      try {
        session.run();
        // Completed before cancel threshold on tiny histories is acceptable.
        if (session.getStatus().state !== "completed") {
          throw new Error(`expected cancelled or completed, got ${session.getStatus().state}`);
        }
      } catch (error) {
        if (!(error instanceof BacktestCancellationError)) throw error;
        if (session.getStatus().state !== "cancelled") {
          throw new Error(`backtest not cancelled after throw: ${session.getStatus().state}`);
        }
      }
      session.dispose();
      backtestCancelOk += 1;
    }

    {
      let now = history[0].time;
      const account = createPaperTradingAccount({
        id: `stress-${round}`,
        displayName: "stress",
        symbol: "BTCUSD",
        currency: "USD",
        initialBalance: 5_000,
        execution: {
          commission: { type: "percent", value: 0 },
          slippage: { type: "percent", value: 0 },
          maxQuoteAgeMs: 60_000,
          allowFractionalQuantity: true,
        },
        clock: { now: () => now },
      });
      let sequence = 0;
      for (const bar of history.slice(0, 12)) {
        now = bar.time;
        sequence += 1;
        account.processMarketEvent({
          id: `e-${round}-${sequence}`,
          symbol: "BTCUSD",
          time: bar.time,
          price: bar.close,
          source: "stress",
          quoteStatus: "fresh",
          mode: "simulated",
          sourceSequence: sequence,
        });
      }
      account.submitOrder({
        idempotencyKey: `buy-${round}`,
        side: "buy",
        type: "market",
        quantity: 0.1,
      });
      const last = history[Math.min(20, history.length - 1)];
      now = last.time + 1_000;
      sequence += 1;
      account.processMarketEvent({
        id: `e-${round}-${sequence}`,
        symbol: "BTCUSD",
        time: last.time + 1_000,
        price: last.close,
        source: "stress",
        quoteStatus: "fresh",
        mode: "simulated",
        sourceSequence: sequence,
      });
      account.processMarketEvent({
        id: `e-${round}-${sequence}`,
        symbol: "BTCUSD",
        time: last.time + 1_000,
        price: last.close,
        source: "stress",
        quoteStatus: "fresh",
        mode: "simulated",
        sourceSequence: sequence,
      });
      paperOk += 1;
    }

    if (round % Math.max(1, Math.floor(rounds / 8)) === 0) {
      observations.push({ round, klineScriptOk, replayOk, backtestCancelOk, paperOk });
    }
  }

  return { rounds, klineScriptOk, replayOk, backtestCancelOk, paperOk, observations };
}
