import type { OptimizationCandidateResult, OptimizationResult } from "./types.js";
import type { WalkForwardResult } from "./walk-forward.js";

export const OPENKLINE_OPTIMIZATION_EXPORT_VERSION = 1 as const;

export interface OptimizationExportMetadata {
  readonly analysisCompletedAt: string;
  readonly engineVersion?: string;
}

export function serializeOptimizationReportJson(report: OptimizationResult, metadata: OptimizationExportMetadata): string {
  return JSON.stringify({ schemaVersion: OPENKLINE_OPTIMIZATION_EXPORT_VERSION, analysisType: "optimization", metadata: { ...metadata }, report: sanitizeOptimizationReport(report) });
}

export function serializeOptimizationLeaderboardCsv(report: OptimizationResult): string {
  const columns = ["candidateId", "strategyId", "strategyVersion", "parameters", "objective", "direction", "score", "available", "netProfit", "totalReturn", "maxDrawdown", "profitFactor", "winRate", "tradeCount", "observationCount", "inputFingerprint", "status", "diagnostic"];
  const rows = report.rankedCandidates.map((candidate) => [candidate.candidate.candidateId, candidate.candidate.strategyId, candidate.candidate.strategyVersion, JSON.stringify(candidate.candidate.parameters), candidate.objective.objective, candidate.objective.direction, candidate.objective.value, candidate.objective.available, candidate.metrics?.netProfit ?? null, candidate.metrics?.totalReturn ?? null, candidate.metrics?.maxDrawdown ?? null, candidate.metrics?.profitFactor ?? null, candidate.metrics?.winRate ?? null, candidate.tradeCount, candidate.observationCount, candidate.inputFingerprint, candidate.status, candidate.objective.unavailableReason ?? candidate.error ?? ""].map(csvCell).join(","));
  return [columns.join(","), ...rows].join("\n");
}

export function serializeWalkForwardReportJson(report: WalkForwardResult, metadata: OptimizationExportMetadata): string {
  return JSON.stringify({ schemaVersion: OPENKLINE_OPTIMIZATION_EXPORT_VERSION, analysisType: "walk-forward", metadata: { ...metadata }, report: sanitizeWalkForwardReport(report) });
}

export function serializeWalkForwardFoldCsv(report: WalkForwardResult): string {
  const columns = ["foldId", "trainingStartIndex", "trainingEndIndex", "testStartIndex", "testEndIndex", "selectedParameters", "trainingScore", "trainingReturn", "outOfSampleReturn", "trainingDrawdown", "outOfSampleDrawdown", "trainingTradeCount", "outOfSampleTradeCount", "trainingFingerprint", "testFingerprint", "diagnostics"];
  const rows = report.folds.map((fold) => [fold.definition.foldId, fold.definition.trainingStartIndex, fold.definition.trainingEndIndex, fold.definition.testStartIndex, fold.definition.testEndIndex, JSON.stringify(fold.selectedCandidate?.parameters ?? null), fold.trainingScore?.value ?? null, fold.trainingMetrics?.totalReturn ?? null, fold.outOfSampleMetrics?.totalReturn ?? null, fold.trainingMetrics?.maxDrawdown ?? null, fold.outOfSampleMetrics?.maxDrawdown ?? null, fold.trainingMetrics?.closedTradeCount ?? null, fold.outOfSampleMetrics?.closedTradeCount ?? null, fold.trainingDatasetFingerprint, fold.outOfSampleDatasetFingerprint, fold.diagnostics.join(" | ")].map(csvCell).join(","));
  return [columns.join(","), ...rows].join("\n");
}

function sanitizeOptimizationReport(report: OptimizationResult): Record<string, unknown> {
  return { ...report, candidates: report.candidates.map(sanitizeCandidate), rankedCandidates: report.rankedCandidates.map(sanitizeCandidate) };
}

function sanitizeCandidate(candidate: OptimizationCandidateResult): Record<string, unknown> {
  const { backtestResult: _backtestResult, ...summary } = candidate;
  return summary;
}

function sanitizeWalkForwardReport(report: WalkForwardResult): Record<string, unknown> {
  return { ...report, folds: report.folds.map((fold) => { const { outOfSampleResult: _outOfSampleResult, ...summary } = fold; return summary; }) };
}

function csvCell(value: unknown): string { const text = value === null || value === undefined ? "" : String(value); return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }
