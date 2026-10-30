import { createPortfolioBacktestWorkerHandler } from "openkline";

type WorkerScope = {
  readonly postMessage: (message: unknown) => void;
  onmessage: ((event: { readonly data: unknown }) => void) | null;
};

const scope = globalThis as unknown as WorkerScope;
const handle = createPortfolioBacktestWorkerHandler((response) => scope.postMessage(response));

scope.onmessage = (event) => handle(event.data);

export {};
