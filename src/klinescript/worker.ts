import { createKlineScriptWorkerHandler } from "./worker-handler.js";

interface WorkerScope {
  addEventListener(type: "message", listener: (event: { readonly data: unknown }) => void): void;
  postMessage(message: unknown): void;
}

const scope = globalThis as unknown as WorkerScope;
const handleMessage = createKlineScriptWorkerHandler((response) => scope.postMessage(response));
scope.addEventListener("message", (event) => handleMessage(event.data));
