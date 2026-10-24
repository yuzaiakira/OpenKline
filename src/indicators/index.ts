import { IndicatorRegistry } from "./engine.js";
import { builtInIndicatorDefinitions } from "./builtins.js";

export { IndicatorRegistry } from "./engine.js";
export {
  atrDefinition,
  bollingerBandsDefinition,
  builtInIndicatorDefinitions,
  emaDefinition,
  macdDefinition,
  rsiDefinition,
  smaDefinition,
  stochasticDefinition,
  vwapDefinition,
} from "./builtins.js";
export {
  IndicatorLifecycleError,
  IndicatorValidationError,
} from "./types.js";
export type {
  IndicatorDefinition,
  IndicatorIncrementalContext,
  IndicatorInstance,
  IndicatorMetadata,
  IndicatorOutputDefinition,
  IndicatorOutputKind,
  IndicatorOutputSeries,
  IndicatorParameterDefinition,
  IndicatorParameterType,
  IndicatorPoint,
  IndicatorResult,
  IndicatorValue,
} from "./types.js";
export type {
  BollingerParameters,
  MacdParameters,
  PeriodParameters,
  StochasticParameters,
  VwapParameters,
  VwapSession,
} from "./builtins.js";

export function createDefaultIndicatorRegistry(): IndicatorRegistry {
  const registry = new IndicatorRegistry();
  for (const definition of builtInIndicatorDefinitions) registry.register(definition);
  return registry;
}
