import { CandleStore } from "../core/candle-store.js";
import type { Candle } from "../types.js";
import { createDefaultStrategyRegistry } from "../strategies/index.js";
import {
  isBacktestWorkerRequest,
  OPENKLINE_BACKTEST_WORKER_PROTOCOL_VERSION,
  type BacktestWorkerErrorCode,
  type BacktestWorkerRequest,
  type BacktestWorkerResponse,
} from "./worker-protocol.js";
import { createBacktest } from "./engine.js";
import { BacktestCancellationError, BacktestValidationError } from "./types.js";

const PROGRESS_INTERVAL = 128;

/**
 * Worker-side state is intentionally limited to validated candles and the
 * built-in strategy registry. No function, registry, or user source crosses
 * the structured-clone boundary.
 */
export function createBacktestWorkerHandler(send: (response: BacktestWorkerResponse) => void): (message: unknown) => void {
  let candles: readonly Candle[] | null = null;
  let datasetId: string | null = null;
  let activeController: AbortController | null = null;
  let activeRequestId: string | null = null;
  let disposed = false;

  const fail = (request: Pick<BacktestWorkerRequest, "requestId" | "generation">, code: BacktestWorkerErrorCode, message: string): void => {
    send({ protocol: OPENKLINE_BACKTEST_WORKER_PROTOCOL_VERSION, type: "error", requestId: request.requestId, generation: request.generation, error: { code, message } });
  };

  const acknowledge = (request: BacktestWorkerRequest, operation: BacktestWorkerRequest["type"]): void => {
    send({ protocol: OPENKLINE_BACKTEST_WORKER_PROTOCOL_VERSION, type: "ack", requestId: request.requestId, generation: request.generation, operation });
  };

  return (message: unknown): void => {
    if (!isBacktestWorkerRequest(message)) {
      if (isRequestIdentity(message)) fail(message, "PROTOCOL", "Malformed Backtest Worker request");
      return;
    }
    if (disposed && message.type !== "dispose") {
      fail(message, "WORKER_DISPOSED", "Backtest Worker has been disposed");
      return;
    }
    if (message.type === "dispose") {
      activeController?.abort();
      activeController = null;
      activeRequestId = null;
      candles = null;
      datasetId = null;
      disposed = true;
      acknowledge(message, "dispose");
      return;
    }
    if (message.type === "cancel") {
      if (message.targetRequestId === activeRequestId) activeController?.abort();
      acknowledge(message, "cancel");
      return;
    }
    if (message.type === "initialize") {
      if (activeController !== null) {
        fail(message, "INITIALIZE_FAILED", "Cannot initialize while a backtest is running");
        return;
      }
      try {
        const store = new CandleStore();
        store.setData(message.candles);
        candles = store.getAll();
        datasetId = message.datasetId;
        acknowledge(message, "initialize");
      } catch (error) {
        candles = null;
        datasetId = null;
        fail(message, "INVALID_INPUT", error instanceof Error ? error.message : String(error));
      }
      return;
    }
    if (candles === null || datasetId === null) {
      fail(message, "INITIALIZE_REQUIRED", "Backtest Worker must be initialized before running");
      return;
    }
    if (activeController !== null) {
      fail(message, "EXECUTION_FAILED", "A backtest is already running");
      return;
    }

    const controller = new AbortController();
    activeController = controller;
    activeRequestId = message.requestId;
    let lastProgress = 0;
    try {
      const session = createBacktest({
        ...message.options,
        candles,
        strategyRegistry: createDefaultStrategyRegistry(),
        signal: controller.signal,
        onProgress: (progress) => {
          const isFinal = progress.processedBars >= progress.totalBars;
          if (!isFinal && progress.processedBars - lastProgress < PROGRESS_INTERVAL) return;
          lastProgress = progress.processedBars;
          send({ protocol: OPENKLINE_BACKTEST_WORKER_PROTOCOL_VERSION, type: "progress", requestId: message.requestId, generation: message.generation, progress });
        },
      });
      try {
        const result = session.run();
        send({ protocol: OPENKLINE_BACKTEST_WORKER_PROTOCOL_VERSION, type: "complete", requestId: message.requestId, generation: message.generation, result });
      } finally {
        session.dispose();
      }
    } catch (error) {
      if (error instanceof BacktestCancellationError || controller.signal.aborted) fail(message, "CANCELLED", "Backtest Worker execution was cancelled");
      else if (error instanceof BacktestValidationError) fail(message, "INVALID_INPUT", error.message);
      else fail(message, "EXECUTION_FAILED", error instanceof Error ? error.message : String(error));
    } finally {
      activeController = null;
      activeRequestId = null;
    }
  };
}

function isRequestIdentity(value: unknown): value is Pick<BacktestWorkerRequest, "requestId" | "generation"> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as { readonly requestId?: unknown; readonly generation?: unknown };
  return typeof candidate.requestId === "string" && candidate.requestId.length > 0 && typeof candidate.generation === "number" && Number.isInteger(candidate.generation) && candidate.generation >= 0;
}
