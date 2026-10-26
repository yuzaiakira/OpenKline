import { validateCandle } from "../core/candle-store.js";
import { canonicalInstrumentIdentity } from "./identity.js";
import { evaluateScreenerRuleSet, validateScreenerRuleSet } from "./rules.js";
import type { ScreenerSymbolSnapshot } from "./snapshot.js";
import { isScreenerWorkerRequest, OPENKLINE_SCREENER_WORKER_PROTOCOL_VERSION, type ScreenerWorkerResponse, type ScreenerWorkerResult, type ScreenerWorkerRunRequest } from "./worker-protocol.js";

export function createScreenerWorkerHandler(send: (response: ScreenerWorkerResponse) => void): (message: unknown) => void {
  const cancelled = new Set<string>();
  let disposed = false;
  return (message: unknown): void => {
    if (!isScreenerWorkerRequest(message)) {
      sendError(send, "invalid", 0, 0, "PROTOCOL", "Malformed screener Worker request");
      return;
    }
    if (disposed && message.type !== "dispose") { sendError(send, message.requestId, message.generation, message.generation, "WORKER_DISPOSED", "Screener Worker is disposed"); return; }
    if (message.type === "cancel") {
      cancelled.add(message.targetRequestId);
      send({ protocol: OPENKLINE_SCREENER_WORKER_PROTOCOL_VERSION, type: "ack", requestId: message.requestId, generation: message.generation, operation: "cancel" });
      return;
    }
    if (message.type === "dispose") {
      disposed = true;
      send({ protocol: OPENKLINE_SCREENER_WORKER_PROTOCOL_VERSION, type: "ack", requestId: message.requestId, generation: message.generation, operation: "dispose" });
      return;
    }
    execute(message, cancelled, send);
  };
}

function execute(request: ScreenerWorkerRunRequest, cancelled: Set<string>, send: (response: ScreenerWorkerResponse) => void): void {
  try {
    const ruleSet = validateScreenerRuleSet(request.options.ruleSet);
    const results: ScreenerSymbolSnapshot[] = [];
    request.options.tasks.forEach((task, index) => {
      if (cancelled.has(request.requestId)) throw new WorkerExecutionError("CANCELLED", "Screener Worker execution was cancelled");
      const bars = task.bars.filter((bar) => bar.finality === "confirmed").sort((left, right) => left.candle.time - right.candle.time);
      bars.forEach((bar) => validateCandle(bar.candle));
      const evaluation = evaluateScreenerRuleSet(ruleSet, bars.map((bar) => bar.candle));
      const match = evaluation.state === "matched" ? "matched" : evaluation.state === "not-matched" ? "unmatched" : "unavailable";
      const latest = bars[bars.length - 1];
      results.push({ resultId: JSON.stringify({ instrument: canonicalInstrumentIdentity(task.instrument), ruleSet: ruleSet.id, timeframe: request.options.timeframe, sourceBarTime: latest?.candle.time ?? null, sourceBarRevision: latest?.revision ?? null, generation: request.generation, match, dataStatus: evaluation.state === "unavailable" ? "partial" : "complete", value: evaluation.value, previousValue: evaluation.previousValue, diagnostics: evaluation.diagnostics }), instrument: { ...task.instrument }, instrumentIdentity: canonicalInstrumentIdentity(task.instrument), ruleSetId: ruleSet.id, timeframe: request.options.timeframe, generation: request.generation, match, dataStatus: latest === undefined ? "invalid" : evaluation.state === "unavailable" ? "partial" : "complete", evaluated: evaluation.state !== "unavailable", sourceBarTime: latest?.candle.time ?? null, sourceBarRevision: latest?.revision ?? null, barsEvaluated: bars.length, evaluation: latest === undefined ? null : evaluation, diagnostics: latest === undefined ? ["No confirmed bars"] : evaluation.diagnostics.map((diagnostic) => diagnostic.message) });
      send({ protocol: OPENKLINE_SCREENER_WORKER_PROTOCOL_VERSION, type: "progress", requestId: request.requestId, generation: request.generation, progress: { completed: index + 1, total: request.options.tasks.length } });
    });
    const result: ScreenerWorkerResult = { results, counts: { evaluated: results.filter((item) => item.evaluated).length, matched: results.filter((item) => item.match === "matched").length, unmatched: results.filter((item) => item.match === "unmatched").length, unavailable: results.filter((item) => item.match === "unavailable").length } };
    send({ protocol: OPENKLINE_SCREENER_WORKER_PROTOCOL_VERSION, type: "complete", requestId: request.requestId, generation: request.generation, result });
  } catch (error) {
    const normalized = error instanceof WorkerExecutionError ? error : new WorkerExecutionError("EXECUTION_FAILED", error instanceof Error ? error.message : String(error));
    sendError(send, request.requestId, request.generation, request.generation, normalized.code, normalized.message);
  }
}

class WorkerExecutionError extends Error {
  public constructor(public readonly code: "CANCELLED" | "EXECUTION_FAILED", message: string) { super(message); this.name = "WorkerExecutionError"; }
}

function sendError(send: (response: ScreenerWorkerResponse) => void, requestId: string, generation: number, _responseGeneration: number, code: string, message: string): void { send({ protocol: OPENKLINE_SCREENER_WORKER_PROTOCOL_VERSION, type: "error", requestId, generation, error: { code, message } }); }

