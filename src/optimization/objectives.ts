import type { BacktestResult } from "../backtesting/types.js";
import type { OptimizationObjectiveDirection, OptimizationObjectiveName, OptimizationScore } from "./types.js";

export interface ObjectiveDefinition {
  readonly name: OptimizationObjectiveName;
  readonly direction: OptimizationObjectiveDirection;
  readonly label: string;
  readonly description: string;
}

const OBJECTIVES: readonly ObjectiveDefinition[] = [
  { name: "net-profit", direction: "maximize", label: "Net profit", description: "Final equity minus initial capital; unavailable when no closed trades exist." },
  { name: "total-return", direction: "maximize", label: "Total return", description: "Net profit divided by initial capital; unavailable when no closed trades exist." },
  { name: "max-drawdown", direction: "minimize", label: "Maximum drawdown", description: "Absolute peak-to-trough equity loss; lower is better and zero-trade candidates are unavailable." },
  { name: "win-rate", direction: "maximize", label: "Win rate", description: "Winning closed trades divided by closed trades, subject to minimum trade count." },
  { name: "profit-factor", direction: "maximize", label: "Profit factor", description: "Gross profit divided by gross loss; unavailable for zero-loss or zero-trade histories." },
];

export function listOptimizationObjectives(): readonly ObjectiveDefinition[] { return OBJECTIVES; }

export function getOptimizationObjective(name: OptimizationObjectiveName): ObjectiveDefinition {
  const definition = OBJECTIVES.find((candidate) => candidate.name === name);
  if (definition === undefined) throw new Error(`Unsupported optimization objective: ${name}`);
  return definition;
}

export function scoreBacktestResult(result: BacktestResult, objective: OptimizationObjectiveName, minimumTradeCount = 1, minimumObservationCount = 1): OptimizationScore {
  const definition = getOptimizationObjective(objective);
  if (!Number.isSafeInteger(minimumTradeCount) || minimumTradeCount < 0) throw new Error("minimumTradeCount must be a non-negative safe integer");
  if (!Number.isSafeInteger(minimumObservationCount) || minimumObservationCount < 1) throw new Error("minimumObservationCount must be a positive safe integer");
  const tradeCount = result.metrics.closedTradeCount;
  if (tradeCount === 0) return unavailable(definition, "No closed trades; zero-trade candidates are never ranked as profitable");
  if (tradeCount < minimumTradeCount) return unavailable(definition, `Closed trade count ${tradeCount} is below minimumTradeCount ${minimumTradeCount}`);
  if (result.equityCurve.length < minimumObservationCount) return unavailable(definition, `Observation count ${result.equityCurve.length} is below minimumObservationCount ${minimumObservationCount}`);
  const value = objective === "net-profit" ? result.metrics.netProfit : objective === "total-return" ? result.metrics.totalReturn : objective === "max-drawdown" ? result.metrics.maxDrawdown : objective === "win-rate" ? result.metrics.winRate : result.metrics.profitFactor;
  if (value === null || !Number.isFinite(value)) return unavailable(definition, `Metric ${objective} is unavailable for this result`);
  return { objective, direction: definition.direction, value, available: true, unavailableReason: null };
}

export function compareOptimizationScores(left: OptimizationScore, right: OptimizationScore): number {
  if (left.available !== right.available) return left.available ? -1 : 1;
  if (!left.available || !right.available || left.value === null || right.value === null) return 0;
  const direction = left.direction === "maximize" ? -1 : 1;
  return (left.value - right.value) * direction;
}

function unavailable(definition: ObjectiveDefinition, reason: string): OptimizationScore { return { objective: definition.name, direction: definition.direction, value: null, available: false, unavailableReason: reason }; }
