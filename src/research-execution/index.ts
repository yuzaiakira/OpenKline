/** Internal Phase 16.0 research boundary; intentionally absent from src/index.ts. */
export { createResearchExecutionSession, ResearchExecutionLifecycleError, ResearchExecutionOrderError, ResearchExecutionSessionImpl, ResearchExecutionValidationError } from "./engine.js";
export { ReferenceExecutionLedger, referenceCosts } from "./reference.js";
export {
  ResearchScenarioArtifactValidationError,
  createResearchScenarioArtifact,
  createResearchScenarioArtifactVariant,
  createResearchScenarioResultEvidence,
  fingerprintResearchScenarioResult,
  parseResearchScenarioArtifact,
  serializeResearchScenarioArtifact,
  validateResearchScenarioArtifact,
} from "./scenario-artifact.js";
export { ResearchScenarioRestoreError, restoreResearchScenario } from "./scenario-restore.js";
export {
  ResearchScenarioComparisonError,
  compareResearchScenarios,
} from "./scenario-comparison.js";
export type { ReferenceLedgerFill, ReferenceLedgerSnapshot } from "./reference.js";
export type {
  ResearchScenarioAssumptionPatch,
  ResearchScenarioComparisonBaselineInput,
  ResearchScenarioComparisonCandidateInput,
  ResearchScenarioComparisonCandidateResult,
  ResearchScenarioComparisonCompatibility,
  ResearchScenarioComparisonDifferences,
  ResearchScenarioComparisonErrorCode,
  ResearchScenarioComparisonFillSummary,
  ResearchScenarioComparisonLimits,
  ResearchScenarioComparisonMetrics,
  ResearchScenarioComparisonMonetaryUnits,
  ResearchScenarioComparisonOptions,
  ResearchScenarioComparisonOrderSummary,
  ResearchScenarioComparisonProgress,
  ResearchScenarioComparisonProvenance,
  ResearchScenarioComparisonResult,
  ResearchScenarioComparisonScenarioResult,
  ResearchScenarioComparisonStatus,
  ResearchScenarioComparisonCandidateStatus,
  ResearchScenarioMetricDelta,
} from "./scenario-comparison.js";
export * from "./types.js";
