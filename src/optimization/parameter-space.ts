import { createDefaultStrategyRegistry } from "../strategies/index.js";
import { OptimizationResourceLimitError, OptimizationValidationError, type InvalidOptimizationCandidate, type OptimizationParameterDefinition, type OptimizationParameterValue, type OptimizationParameterCandidate, type ParameterGenerationResult } from "./types.js";

const MAX_RANGE_VALUES = 10_000_000;

export function generateOptimizationCandidates(strategy: string, searchSpace: readonly OptimizationParameterDefinition[], maxCandidates: number, registry = createDefaultStrategyRegistry()): ParameterGenerationResult {
  validateMaxCandidates(maxCandidates);
  const metadata = registry.getMetadata(strategy);
  const definitions = validateSearchSpace(searchSpace, metadata.parameters.map((parameter) => parameter.name));
  const valuesByName = definitions.map((definition) => ({ name: definition.name, values: valuesFor(definition) }));
  const product = valuesByName.reduce((total, item) => {
    if (item.values.length === 0) return 0;
    if (total > Math.floor(maxCandidates / item.values.length)) throw new OptimizationResourceLimitError(`Parameter search space exceeds maxCandidates (${maxCandidates})`);
    return total * item.values.length;
  }, 1);
  if (product > maxCandidates) throw new OptimizationResourceLimitError(`Parameter search space contains ${product} combinations, above maxCandidates (${maxCandidates})`);

  const candidates: OptimizationParameterCandidate[] = [];
  const invalidCandidates: InvalidOptimizationCandidate[] = [];
  const seen = new Set<string>();
  let duplicateCount = 0;
  const visit = (index: number, parameters: Record<string, OptimizationParameterValue>): void => {
    if (index === valuesByName.length) {
      const parameterKey = canonicalParameterSerialization(parameters);
      if (seen.has(parameterKey)) { duplicateCount += 1; return; }
      seen.add(parameterKey);
      try {
        const instance = registry.create(strategy, parameters);
        const validatedParameters = instance.parameters as Record<string, OptimizationParameterValue>;
        instance.dispose();
        const validatedKey = canonicalParameterSerialization(validatedParameters);
        if (seen.has(validatedKey) && validatedKey !== parameterKey) { duplicateCount += 1; return; }
        seen.add(validatedKey);
        candidates.push({ candidateId: `candidate-${stableHash(`${metadata.id}@${metadata.version}|${validatedKey}`)}`, strategyId: metadata.id, strategyVersion: metadata.version, parameters: Object.freeze({ ...validatedParameters }), parameterKey: validatedKey });
      } catch (error) {
        invalidCandidates.push({ parameters: Object.freeze({ ...parameters }), parameterKey, reason: error instanceof Error ? error.message : String(error) });
      }
      return;
    }
    const definition = valuesByName[index];
    if (definition === undefined) return;
    for (const value of definition.values) visit(index + 1, { ...parameters, [definition.name]: value });
  };
  visit(0, {});
  return { candidates, invalidCandidates, duplicateCount, generatedCount: product };
}

export function canonicalParameterSerialization(parameters: Readonly<Record<string, unknown>>): string {
  return `{${Object.keys(parameters).sort().map((key) => `${JSON.stringify(key)}:${stableValue(parameters[key])}`).join(",")}}`;
}

function validateMaxCandidates(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new OptimizationValidationError("maxCandidates must be a positive safe integer");
}

function validateSearchSpace(searchSpace: readonly OptimizationParameterDefinition[], knownNames: readonly string[]): OptimizationParameterDefinition[] {
  if (searchSpace.length !== knownNames.length) throw new OptimizationValidationError(`Search space must define exactly these strategy parameters: ${knownNames.join(", ")}`);
  const known = new Set(knownNames);
  const seen = new Set<string>();
  for (const definition of searchSpace) {
    if (!known.has(definition.name)) throw new OptimizationValidationError(`Unknown strategy parameter in search space: ${definition.name}`);
    if (seen.has(definition.name)) throw new OptimizationValidationError(`Duplicate strategy parameter in search space: ${definition.name}`);
    seen.add(definition.name);
    if (!/^[A-Za-z][A-Za-z0-9_]*$/u.test(definition.name)) throw new OptimizationValidationError(`Invalid parameter name: ${definition.name}`);
  }
  return [...searchSpace].sort((left, right) => left.name.localeCompare(right.name));
}

function valuesFor(definition: OptimizationParameterDefinition): OptimizationParameterValue[] {
  if (definition.type === "fixed") return [definition.value];
  if (definition.type === "values") {
    if (definition.values.length === 0) throw new OptimizationValidationError(`Parameter ${definition.name} must provide at least one candidate value`);
    const values = definition.values.map((value) => {
      if (typeof value === "number" && !Number.isFinite(value)) throw new OptimizationValidationError(`Parameter ${definition.name} contains a non-finite value`);
      return value;
    });
    if (values.length > MAX_RANGE_VALUES) throw new OptimizationResourceLimitError(`Parameter ${definition.name} contains too many values`);
    return values;
  }
  if (!Number.isFinite(definition.start) || !Number.isFinite(definition.end) || !Number.isFinite(definition.step) || definition.step <= 0 || definition.start > definition.end) throw new OptimizationValidationError(`Invalid range for parameter ${definition.name}`);
  if (definition.type === "integer-range" && (!Number.isSafeInteger(definition.start) || !Number.isSafeInteger(definition.end) || !Number.isSafeInteger(definition.step))) throw new OptimizationValidationError(`Integer range ${definition.name} must use safe integer bounds and step`);
  const count = Math.floor((definition.end - definition.start) / definition.step + 1e-10) + 1;
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_RANGE_VALUES) throw new OptimizationResourceLimitError(`Range ${definition.name} contains too many values`);
  return Array.from({ length: count }, (_, index) => definition.type === "integer-range" ? definition.start + index * definition.step : roundRangeValue(definition.start + index * definition.step));
}

function roundRangeValue(value: number): number { return Number(value.toPrecision(15)); }

function stableValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (typeof value === "object" && value !== null) return canonicalParameterSerialization(value as Record<string, unknown>);
  return JSON.stringify(String(value));
}

function stableHash(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16_777_619); }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
