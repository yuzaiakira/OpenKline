# Strategy API

The initial Strategy API is a trusted TypeScript extension boundary. It is
framework-independent and does not execute arbitrary source strings.

```ts
import { StrategyRegistry } from "openkline";

const registry = new StrategyRegistry();
registry.register(myStrategyDefinition);

const strategy = registry.create("MY_STRATEGY", { period: 14 });
const result = strategy.evaluate(candles, {
  onProgress: ({ processedBars, totalBars }) => console.log(processedBars, totalBars),
});

console.log(result.signals);
strategy.dispose();
```

## Strategy definition

A definition supplies versioned metadata, validated parameters, and an
evaluator factory. The evaluator receives one completed-bar context at a time.
Its `history` is the defensive prefix through the current bar; future bars are
not provided. A strategy signal records intent only:

```ts
const definition: StrategyDefinition<{ period: number }> = {
  metadata: {
    id: "MY_STRATEGY",
    name: "My Strategy",
    version: 1,
    description: "Example trusted TypeScript strategy.",
    parameters: [{ name: "period", type: "integer", required: true, min: 1 }],
    requiredInputs: ["ohlcv"],
  },
  validateParameters: (value) => {
    if (typeof value !== "object" || value === null || typeof (value as { period?: unknown }).period !== "number") {
      throw new Error("period is required");
    }
    return { period: (value as { period: number }).period };
  },
  createEvaluator: () => ({
    evaluateBar: ({ candle, previousCandle }) => previousCandle !== null && candle.close > previousCandle.close
      ? [{ action: "enter-long", reason: "close crossed above the previous close" }]
      : [],
  }),
};
```

Supported actions are `enter-long`, `exit-long`, `enter-short`, and
`exit-short`. The signal time is the completed candle time. It is not an order,
fill, or guarantee of execution. The backtest layer will keep signal and fill
timestamps separate and will use next-bar-open execution.

## Safety and limitations

The current API is for trusted application-owned TypeScript definitions. Do
not pass untrusted JavaScript or serialized functions to it. KlineScript
strategy syntax is not implemented by this API and remains a separate
language-design and security milestone. No live trading or broker execution is
provided.
