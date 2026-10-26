# Developing a strategy

Start with a pure, trusted `StrategyDefinition`. Validate every parameter,
declare `requiredInputs`, and create independent indicator instances inside
the evaluator factory. Use only the current completed candle and its supplied
historical prefix. Never read a future bar or close over a complete source
array.

```ts
const definition: StrategyDefinition<{ period: number }> = {
  metadata: {
    id: "CLOSE_CROSS",
    name: "Close Cross",
    version: 1,
    description: "Example strategy boundary.",
    parameters: [{ name: "period", type: "integer", required: true, min: 1 }],
    requiredInputs: ["ohlcv"],
  },
  validateParameters: (value) => ({ period: readPositiveInteger(value) }),
  createEvaluator: () => ({
    evaluateBar: ({ candle, previousCandle }) => previousCandle !== null && candle.close > previousCandle.close
      ? [{ action: "enter-long", reason: "completed close crossed higher" }]
      : [],
  }),
};
```

Test a strategy on a historical prefix and then on the same prefix with future
bars appended. Decisions and signals before the appended boundary must match.
Use independent expected values for the backtest layer: signal time is not fill
time, and fills occur at the next bar open.

Strategies are trusted TypeScript extensions. Do not deserialize functions or
evaluate user-provided JavaScript. If a future Studio feature accepts source,
it must use the restricted KlineScript compiler/runtime and a separately
reviewed signal adapter. A strategy cannot place real orders.
