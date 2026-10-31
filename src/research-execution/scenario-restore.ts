import {
  validateMarketReplayTape,
  type MarketReplayTape,
} from "../replay/market-event-tape.js";
import {
  createResearchExecutionSession,
  ResearchExecutionSessionImpl,
} from "./engine.js";
import {
  createResearchScenarioResultEvidence,
  parseResearchScenarioArtifact,
} from "./scenario-artifact.js";
import type {
  ResearchExecutionOptions,
  ResearchScenarioArtifact,
  ResearchScenarioReconstructionResult,
  ResearchScenarioRestoreOptions,
  ResearchScenarioResultEvidence,
} from "./types.js";

export type ResearchScenarioRestoreErrorCode =
  | "INVALID_TAPE"
  | "TAPE_MISMATCH"
  | "SOURCE_GENERATION_MISMATCH"
  | "ORDERING_MISMATCH"
  | "INSTRUMENT_MISMATCH"
  | "VENUE_MISMATCH"
  | "RECEIVE_TIME_UNAVAILABLE"
  | "INCOMPLETE_DECISION_HISTORY"
  | "FRONTIER_MISMATCH";

export class ResearchScenarioRestoreError extends Error {
  public constructor(public readonly code: ResearchScenarioRestoreErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "ResearchScenarioRestoreError";
  }
}

export function restoreResearchScenario(options: ResearchScenarioRestoreOptions): ResearchScenarioReconstructionResult {
  const artifact = parseResearchScenarioArtifact(options.artifact, options.validation);
  validateCompatibleTape(artifact, options.tape);
  if (!artifact.decisionHistory.complete) throw new ResearchScenarioRestoreError("INCOMPLETE_DECISION_HISTORY", "decision history is incomplete and cannot be reconstructed safely");

  const assumptions = artifact.assumptions;
  const sessionOptions: ResearchExecutionOptions = {
    scenarioId: artifact.scenarioId,
    tape: options.tape,
    instrumentId: assumptions.instrumentId,
    initialCapital: assumptions.initialCapital,
    currency: assumptions.currency,
    clockPolicy: assumptions.clockPolicy,
    knowledgePolicy: assumptions.knowledgePolicy,
    latency: assumptions.latency,
    execution: assumptions.execution,
    precision: assumptions.precision,
    commission: assumptions.commission,
    slippage: assumptions.slippage,
    maxQuoteAgeMs: assumptions.maxQuoteAgeMs,
    risk: assumptions.risk,
    maxJournalEntries: assumptions.maxJournalEntries,
    maxDepth: assumptions.maxDepth,
    ...(assumptions.venueId === null ? {} : { venueId: assumptions.venueId }),
    ...(assumptions.priceImpact === null ? {} : { priceImpact: assumptions.priceImpact }),
    ...(assumptions.corporateActionSource === null ? {} : { corporateActionSource: assumptions.corporateActionSource }),
  };
  const session = createResearchExecutionSession(sessionOptions);
  const implementation = session as ResearchExecutionSessionImpl;
  try {
    implementation.loadScenarioDecisions(artifact.decisions);
    restoreFrontier(implementation, artifact);
  } catch (error) {
    implementation.dispose();
    throw error;
  }

  const actualSnapshot = implementation.getSnapshot();
  const frontier = artifact.replay.frontier;
  if (actualSnapshot.state !== frontier.state
    || actualSnapshot.cursor.eventIndex !== frontier.eventIndex
    || actualSnapshot.cursor.eventId !== frontier.eventId
    || actualSnapshot.cursor.time !== frontier.time
    || actualSnapshot.cursor.clockTime !== frontier.clockTime) {
    implementation.dispose();
    throw new ResearchScenarioRestoreError("FRONTIER_MISMATCH", "reconstructed session did not reach the recorded causal frontier");
  }

  const actual = implementation.exportScenario();
  const actualResult = createResearchScenarioResultEvidence(actual, frontier);
  const expectedResult = artifact.expectedResult === undefined ? null : cloneEvidence(artifact.expectedResult);
  const status = expectedResult === null
    ? "no-expected-result"
    : expectedResult.fingerprint === actualResult.fingerprint
      && expectedResult.state === actualResult.state
      && sameCursor(expectedResult.cursor, actualResult.cursor)
      ? "verified"
      : "mismatch";
  return { status, artifact, session: implementation, actual, actualResult, expectedResult };
}

function validateCompatibleTape(artifact: ResearchScenarioArtifact, tape: MarketReplayTape): void {
  try {
    validateMarketReplayTape(tape);
  } catch (error) {
    throw new ResearchScenarioRestoreError("INVALID_TAPE", error instanceof Error ? error.message : String(error));
  }
  if (artifact.tape.fingerprint !== tape.fingerprint || artifact.tape.id !== tape.id) {
    throw new ResearchScenarioRestoreError("TAPE_MISMATCH", "scenario is bound to a different tape fingerprint or tape id");
  }
  if (artifact.tape.version !== tape.version || artifact.replay.tapeVersion !== tape.version) {
    throw new ResearchScenarioRestoreError("TAPE_MISMATCH", "scenario tape version does not match the supplied tape");
  }
  if (artifact.tape.orderingVersion !== tape.ordering.version || artifact.replay.orderingVersion !== tape.ordering.version) {
    throw new ResearchScenarioRestoreError("ORDERING_MISMATCH", "scenario replay ordering version does not match the supplied tape");
  }
  if (!sameStringArray(artifact.tape.instrumentIds, tape.instrumentIds)) {
    throw new ResearchScenarioRestoreError("TAPE_MISMATCH", "scenario instrument set does not match the supplied tape");
  }
  if (!sameSources(artifact.tape.sources, tape.sources)) {
    throw new ResearchScenarioRestoreError("SOURCE_GENERATION_MISMATCH", "scenario source identities or generations do not match the supplied tape");
  }
  if (!tape.instrumentIds.includes(artifact.assumptions.instrumentId)) {
    throw new ResearchScenarioRestoreError("INSTRUMENT_MISMATCH", `instrument ${artifact.assumptions.instrumentId} is absent from the supplied tape`);
  }
  if (artifact.assumptions.venueId !== null
    && !tape.events.some((event) => event.instrumentId === artifact.assumptions.instrumentId && event.venueId === artifact.assumptions.venueId)) {
    throw new ResearchScenarioRestoreError("VENUE_MISMATCH", `venue ${artifact.assumptions.venueId} is absent from the supplied tape for ${artifact.assumptions.instrumentId}`);
  }
  if (artifact.replay.clockPolicy === "receive-time" && tape.events.some((event) => event.receiveTime === undefined)) {
    throw new ResearchScenarioRestoreError("RECEIVE_TIME_UNAVAILABLE", "receive-time restoration requires receive timestamps for every tape event");
  }
  if (artifact.replay.clockPolicy !== artifact.assumptions.clockPolicy || artifact.replay.knowledgePolicy !== artifact.assumptions.knowledgePolicy) {
    throw new ResearchScenarioRestoreError("ORDERING_MISMATCH", "replay metadata and assumptions disagree");
  }
}

function restoreFrontier(session: ResearchExecutionSessionImpl, artifact: ResearchScenarioArtifact): void {
  const frontier = artifact.replay.frontier;
  if (frontier.eventIndex === null) {
    if (frontier.state === "ready") session.start();
    return;
  }
  session.start();
  for (let index = 0; index <= frontier.eventIndex; index += 1) session.step();
}

function sameCursor(left: ResearchScenarioResultEvidence["cursor"], right: ResearchScenarioResultEvidence["cursor"]): boolean {
  return left.eventIndex === right.eventIndex
    && left.eventId === right.eventId
    && left.time === right.time
    && left.clockTime === right.clockTime;
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameSources(left: readonly { readonly id: string; readonly version: string; readonly kind?: string }[], right: readonly { readonly id: string; readonly version: string; readonly kind?: string }[]): boolean {
  return left.length === right.length && left.every((source, index) => {
    const other = right[index];
    return other !== undefined && source.id === other.id && source.version === other.version && source.kind === other.kind;
  });
}

function cloneEvidence(value: ResearchScenarioResultEvidence): ResearchScenarioResultEvidence {
  return { algorithm: value.algorithm, fingerprint: value.fingerprint, state: value.state, cursor: { ...value.cursor } };
}
