import type { Candle } from "../types.js";
import { calculateAnchoredVwap, type AnchoredVwapPriceSource } from "../volume-analytics.js";
import { IndicatorValidationError, type IndicatorDefinition } from "./types.js";

export interface AnchoredVwapParameters extends Record<string, unknown> {
  anchorTime: number;
  priceSource: AnchoredVwapPriceSource;
}

/** Built-in causal Anchored VWAP indicator backed by the public calculator. */
export const anchoredVwapDefinition: IndicatorDefinition<AnchoredVwapParameters> = {
  metadata: {
    id: "ANCHORED_VWAP",
    name: "Anchored VWAP",
    version: 1,
    description: "Causal volume-weighted average price from an inclusive UTC anchor.",
    category: "volume",
    overlay: true,
    parameters: [
      { name: "anchorTime", type: "integer", required: true, min: 0 },
      { name: "priceSource", type: "enum", required: true, values: ["typical", "close"] },
    ],
    outputs: [{ id: "value", title: "Anchored VWAP", kind: "line" }],
  },
  validateParameters: (parameters) => {
    if (typeof parameters !== "object" || parameters === null) {
      throw new IndicatorValidationError("ANCHORED_VWAP requires anchorTime and priceSource");
    }
    const record = parameters as Record<string, unknown>;
    if (!Number.isSafeInteger(record.anchorTime) || (record.anchorTime as number) < 0) {
      throw new IndicatorValidationError("ANCHORED_VWAP anchorTime must be a non-negative safe integer timestamp");
    }
    const priceSource = record.priceSource ?? "typical";
    if (priceSource !== "typical" && priceSource !== "close") {
      throw new IndicatorValidationError("ANCHORED_VWAP priceSource must be 'typical' or 'close'");
    }
    return { anchorTime: record.anchorTime as number, priceSource };
  },
  calculate: (input: readonly Candle[], parameters: AnchoredVwapParameters) => {
    const result = calculateAnchoredVwap(input, parameters);
    return {
      indicatorId: "ANCHORED_VWAP",
      parameters: { ...parameters },
      outputs: [{
        id: "value",
        title: "Anchored VWAP",
        kind: "line" as const,
        points: result.points.map((point) => ({ time: point.time, value: point.value })),
      }],
    };
  },
};
