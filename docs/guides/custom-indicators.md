# Custom Indicators

Custom indicators use the same registry and lifecycle contract as built-ins.
They are ordinary TypeScript definitions and should remain pure and
framework-independent.

```ts
import {
  createDefaultIndicatorRegistry,
  IndicatorValidationError,
  type IndicatorDefinition,
} from "openkline";

const doubleClose: IndicatorDefinition<{ multiplier: number }> = {
  metadata: {
    id: "DOUBLE_CLOSE",
    name: "Double Close",
    version: 1,
    description: "Multiplies each close by a configured factor.",
    parameters: [{ name: "multiplier", type: "number", required: true }],
    outputs: [{ id: "value", title: "Double Close", kind: "line" }],
  },
  validateParameters(parameters) {
    if (typeof parameters !== "object" || parameters === null
      || typeof (parameters as { multiplier?: unknown }).multiplier !== "number") {
      throw new IndicatorValidationError("multiplier is required");
    }
    return { multiplier: (parameters as { multiplier: number }).multiplier };
  },
  calculate(input, parameters) {
    return {
      indicatorId: "DOUBLE_CLOSE",
      parameters,
      outputs: [{
        id: "value",
        title: "Double Close",
        kind: "line",
        points: input.map((candle) => ({
          time: candle.time,
          value: candle.close * parameters.multiplier,
        })),
      }],
    };
  },
};

const registry = createDefaultIndicatorRegistry();
registry.register(doubleClose);
const instance = registry.create("DOUBLE_CLOSE", { multiplier: 2 });
instance.setInput(candles);
```

Definitions should return aligned points, use `null` for unavailable values,
validate every parameter, and avoid mutable module-level state. Implement
`calculateIncremental` only when append-only correctness is proven; corrections
automatically use the full calculation path. Unregister definitions when a
short-lived registry owns them, and dispose instances when their chart or
analysis object is removed.

The registry is a calculation extension point, not a plugin sandbox. Do not
load untrusted code into the process and do not use `eval` or `new Function`.
