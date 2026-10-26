import { createScreenerWorkerHandler } from "./worker-handler.js";

const scope = globalThis as unknown as { postMessage: (message: unknown) => void; onmessage: ((event: { readonly data: unknown }) => void) | null };
scope.onmessage = createScreenerWorkerHandler((response) => scope.postMessage(response));

