import type { DrawingToolDefinition } from "../drawings/types.js";
import type { IndicatorDefinition } from "../indicators/types.js";

export interface ExtensionMetadata {
  readonly id: string;
  readonly name: string;
  readonly version: 1;
  readonly description: string;
}

export interface ExtensionHost {
  readonly apiVersion: 1;
  registerIndicator(definition: IndicatorDefinition): () => void;
  registerDrawingTool(definition: DrawingToolDefinition): () => void;
}

export interface OpenKlineExtension {
  readonly metadata: ExtensionMetadata;
  activate(host: ExtensionHost): void | (() => void);
}

export interface ExtensionHandle {
  readonly metadata: ExtensionMetadata;
  dispose(): void;
}
