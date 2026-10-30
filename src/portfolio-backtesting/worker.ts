import { createPortfolioBacktestWorkerHandler } from "./worker-handler.js";
import type { PortfolioBacktestWorkerResponse } from "./worker-protocol.js";

const scope = globalThis as unknown as { postMessage: (message: PortfolioBacktestWorkerResponse) => void; onmessage: ((event: MessageEvent<unknown>) => void) | null };
const handle = createPortfolioBacktestWorkerHandler((response) => scope.postMessage(response));
scope.onmessage = (event) => handle(event.data);
