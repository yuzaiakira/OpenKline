import type { DrawingSnapshot } from "../drawings/types.js";
import type { Candle } from "../types.js";

export const OPENKLINE_ALERTS_VERSION = 1 as const;

export type AlertEvaluationMode = "live" | "replay";
export type AlertSourceEvent = "seed" | "append" | "correction";
export type AlertFrequency = "once" | "every-event" | "once-per-bar" | "once-per-confirmed-bar";
export type AlertValue = number | boolean | null;
export type AlertPriceField = "open" | "high" | "low" | "close";

export type AlertCondition =
  | { readonly type: "price-above" | "price-below" | "price-cross-above" | "price-cross-below"; readonly value: number; readonly field?: AlertPriceField }
  | { readonly type: "indicator-above" | "indicator-below" | "indicator-cross-above" | "indicator-cross-below"; readonly indicatorId: string; readonly outputId: string; readonly value: number }
  | { readonly type: "indicator-output-cross-above" | "indicator-output-cross-below"; readonly left: AlertOutputReference; readonly right: AlertOutputReference }
  | { readonly type: "script-above" | "script-below" | "script-cross-above" | "script-cross-below"; readonly scriptId: string; readonly outputId: string; readonly value: number }
  | { readonly type: "script-true"; readonly scriptId: string; readonly outputId: string }
  | { readonly type: "drawing-horizontal-cross-above" | "drawing-horizontal-cross-below"; readonly drawingId: string; readonly field?: AlertPriceField };

export interface AlertOutputReference {
  readonly indicatorId: string;
  readonly outputId: string;
}

export interface AlertDefinition {
  readonly id: string;
  readonly name: string;
  readonly condition: AlertCondition;
  readonly frequency?: AlertFrequency;
  readonly enabled?: boolean;
  /** Minimum UTC bar-time distance between emitted events. */
  readonly cooldownMs?: number;
  readonly symbol?: string;
  readonly timeframe?: string;
}

export interface AlertDefinitionPatch {
  readonly name?: string;
  readonly condition?: AlertCondition;
  readonly frequency?: AlertFrequency;
  readonly enabled?: boolean;
  readonly cooldownMs?: number;
  readonly symbol?: string;
  readonly timeframe?: string;
}

export interface AlertDefinitionDocument {
  readonly version: typeof OPENKLINE_ALERTS_VERSION;
  readonly alerts: readonly AlertDefinition[];
}

export interface AlertEngineOptions {
  readonly maxHistory?: number;
}

export interface AlertOutputSnapshot {
  readonly sourceId: string;
  readonly outputId: string;
  readonly value: AlertValue;
  /** If present, this must equal the evaluation candle timestamp. */
  readonly time?: number;
}

export interface AlertEvaluationInput {
  readonly candle: Candle;
  readonly outputs?: readonly AlertOutputSnapshot[];
  readonly drawings?: readonly DrawingSnapshot[];
  readonly symbol?: string;
  readonly timeframe?: string;
  readonly mode?: AlertEvaluationMode;
  readonly sourceEvent?: AlertSourceEvent;
  /** Required by once-per-confirmed-bar; OpenKline never infers finality. */
  readonly isFinal?: boolean;
}

export interface AlertEvent {
  readonly eventId: string;
  readonly alertId: string;
  readonly alertName: string;
  readonly conditionType: AlertCondition["type"];
  readonly evaluationMode: AlertEvaluationMode;
  readonly simulated: boolean;
  readonly barTimestamp: number;
  readonly observedValue: AlertValue;
  readonly previousValue: AlertValue;
  readonly threshold?: number;
  readonly comparisonValue?: AlertValue;
  readonly symbol?: string;
  readonly timeframe?: string;
}

export interface AlertStatus {
  readonly definition: AlertDefinition;
  readonly evaluationMode: AlertEvaluationMode;
  readonly triggeredCount: number;
  readonly lastEventId: string | null;
  readonly lastTriggeredBarTimestamp: number | null;
  readonly lastError: string | null;
}

export interface AlertDiagnostic {
  readonly alertId: string;
  readonly evaluationMode: AlertEvaluationMode;
  readonly message: string;
  readonly cause?: unknown;
}

export type AlertEventListener = (event: AlertEvent) => void;
export type AlertDiagnosticListener = (diagnostic: AlertDiagnostic) => void;

export interface AlertApi {
  readonly id: string;
  getDefinition(): AlertDefinition;
  getStatus(mode?: AlertEvaluationMode): AlertStatus;
  update(patch: AlertDefinitionPatch): AlertDefinition;
  setEnabled(enabled: boolean): AlertDefinition;
  reset(mode?: AlertEvaluationMode): void;
  remove(): void;
}

export class AlertValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "AlertValidationError";
  }
}

export class AlertEvaluationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "AlertEvaluationError";
  }
}

export class AlertLifecycleError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "AlertLifecycleError";
  }
}
