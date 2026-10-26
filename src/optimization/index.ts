export { runOptimization } from "./engine.js";
export { canonicalParameterSerialization, generateOptimizationCandidates } from "./parameter-space.js";
export { compareOptimizationScores, getOptimizationObjective, listOptimizationObjectives, scoreBacktestResult } from "./objectives.js";
export type {
  FixedParameter,
  IntegerRangeParameter,
  InvalidOptimizationCandidate,
  NumberRangeParameter,
  OptimizationCandidateResult,
  OptimizationCounts,
  OptimizationExecutionSettings,
  OptimizationObjectiveDirection,
  OptimizationObjectiveName,
  OptimizationOptions,
  OptimizationParameterDefinition,
  OptimizationParameterValue,
  OptimizationParameterCandidate,
  OptimizationProgress,
  OptimizationResourceLimits,
  OptimizationResult,
  OptimizationScore,
  ParameterGenerationResult,
  ValuesParameter,
} from "./types.js";
export type { ObjectiveDefinition } from "./objectives.js";
export { OptimizationCancellationError, OptimizationResourceLimitError, OptimizationTimeoutError, OptimizationValidationError } from "./types.js";
