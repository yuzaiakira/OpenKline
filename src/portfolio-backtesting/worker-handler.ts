import { createDefaultStrategyRegistry } from "../strategies/index.js";
import { createPortfolioBacktest } from "./engine.js";
import { PortfolioBacktestCancellationError, PortfolioBacktestValidationError } from "./types.js";
import { isPortfolioBacktestWorkerRequest, OPENKLINE_PORTFOLIO_BACKTEST_WORKER_PROTOCOL_VERSION, type PortfolioBacktestWorkerErrorCode, type PortfolioBacktestWorkerRequest, type PortfolioBacktestWorkerResponse } from "./worker-protocol.js";

const PROGRESS_INTERVAL = 128;

export function createPortfolioBacktestWorkerHandler(send: (response: PortfolioBacktestWorkerResponse) => void): (message: unknown) => void {
  let activeController: AbortController | null = null;
  let activeRequestId: string | null = null;
  let disposed = false;
  const fail = (request: Pick<PortfolioBacktestWorkerRequest, "requestId" | "generation">, code: PortfolioBacktestWorkerErrorCode, message: string): void => send({ protocol: OPENKLINE_PORTFOLIO_BACKTEST_WORKER_PROTOCOL_VERSION, type: "error", requestId: request.requestId, generation: request.generation, error: { code, message } });
  const acknowledge = (request: PortfolioBacktestWorkerRequest, operation: PortfolioBacktestWorkerRequest["type"]): void => send({ protocol: OPENKLINE_PORTFOLIO_BACKTEST_WORKER_PROTOCOL_VERSION, type: "ack", requestId: request.requestId, generation: request.generation, operation });
  return (message: unknown): void => {
    if (!isPortfolioBacktestWorkerRequest(message)) { if (isRequestIdentity(message)) fail(message, "PROTOCOL", "Malformed portfolio backtest Worker request"); return; }
    if (disposed && message.type !== "dispose") { fail(message, "WORKER_DISPOSED", "Portfolio backtest Worker has been disposed"); return; }
    if (message.type === "dispose") { activeController?.abort(); activeController = null; activeRequestId = null; disposed = true; acknowledge(message, "dispose"); return; }
    if (message.type === "cancel") { if (message.targetRequestId === activeRequestId) activeController?.abort(); acknowledge(message, "cancel"); return; }
    if (activeController !== null) { fail(message, "EXECUTION_FAILED", "A portfolio backtest is already running"); return; }
    const controller = new AbortController();
    activeController = controller;
    activeRequestId = message.requestId;
    let lastProgress = 0;
    try {
      const session = createPortfolioBacktest({ ...message.options, strategyRegistry: createDefaultStrategyRegistry(), signal: controller.signal, onProgress: (progress) => { const final = progress.processed >= progress.total; if (!final && progress.processed - lastProgress < PROGRESS_INTERVAL) return; lastProgress = progress.processed; send({ protocol: OPENKLINE_PORTFOLIO_BACKTEST_WORKER_PROTOCOL_VERSION, type: "progress", requestId: message.requestId, generation: message.generation, progress }); } });
      try {
        const result = session.run();
        send({ protocol: OPENKLINE_PORTFOLIO_BACKTEST_WORKER_PROTOCOL_VERSION, type: "complete", requestId: message.requestId, generation: message.generation, result });
      } finally { session.dispose(); }
    } catch (error) {
      if (error instanceof PortfolioBacktestCancellationError || controller.signal.aborted) fail(message, "CANCELLED", "Portfolio backtest Worker execution was cancelled");
      else if (error instanceof PortfolioBacktestValidationError) fail(message, "INVALID_INPUT", error.message);
      else fail(message, "EXECUTION_FAILED", error instanceof Error ? error.message : String(error));
    } finally { activeController = null; activeRequestId = null; }
  };
}

function isRequestIdentity(value: unknown): value is Pick<PortfolioBacktestWorkerRequest, "requestId" | "generation"> { if (typeof value !== "object" || value === null || Array.isArray(value)) return false; const candidate = value as { readonly requestId?: unknown; readonly generation?: unknown }; return typeof candidate.requestId === "string" && candidate.requestId.length > 0 && typeof candidate.generation === "number" && Number.isInteger(candidate.generation) && candidate.generation >= 0; }
