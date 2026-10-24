import type { DrawingToolDefinition } from "../drawings/types.js";
import type { IndicatorDefinition } from "../indicators/types.js";
import type {
  ChartEventHandler,
  ChartEventName,
  ChartTheme,
  SeriesPoint,
  SeriesStyle,
  SeriesType,
} from "../types.js";

/** The host API version is intentionally independent from the package version. */
export const OPENKLINE_PLUGIN_API_VERSION = 1 as const;

export type PluginApiVersion = typeof OPENKLINE_PLUGIN_API_VERSION;

export interface Disposable {
  dispose(): void;
}

export interface ExtensionMetadata {
  readonly id: string;
  readonly name: string;
  readonly version: 1;
  readonly description: string;
}

/** Legacy Phase 2 extension contract retained for source compatibility. */
export interface ExtensionHost {
  readonly apiVersion: 1;
  registerIndicator(definition: IndicatorDefinition): () => void;
  registerDrawingTool(definition: DrawingToolDefinition): () => void;
}

export interface OpenKlineExtension {
  readonly metadata: ExtensionMetadata;
  activate(host: ExtensionHost): void | (() => void);
}

export interface ExtensionHandle extends Disposable {
  readonly metadata: Readonly<ExtensionMetadata>;
}

export interface PluginDependency {
  readonly id: string;
  /** A small, deterministic semver range such as ^1.0.0, ~1.2.0, or *. */
  readonly version: string;
  readonly optional?: boolean;
}

export interface PluginMetadata {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly apiVersion: PluginApiVersion;
  readonly description?: string;
  /** Host package range; omitted means compatible with the current host. */
  readonly hostVersionRange?: string;
  readonly dependencies?: readonly PluginDependency[];
}

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export interface PluginStateStore {
  get<T extends JsonValue = JsonValue>(key: string): T | undefined;
  set(key: string, value: JsonValue): void;
  delete(key: string): boolean;
  has(key: string): boolean;
  snapshot(): Readonly<Record<string, JsonValue>>;
  restore(snapshot: unknown): void;
  clear(): void;
}

export interface PluginEventApi {
  on<Name extends ChartEventName>(name: Name, handler: ChartEventHandler<Name>): Disposable;
}

export interface PluginCommand {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly shortcut?: string;
  execute(args?: unknown): unknown | Promise<unknown>;
}

export interface PluginCommandMetadata {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly shortcut?: string;
}

export interface PluginCommandApi {
  register(command: PluginCommand): Disposable;
  execute(id: string, args?: unknown): unknown | Promise<unknown>;
  list(): readonly PluginCommandMetadata[];
}

export interface PluginPaneBounds {
  readonly id: string;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export interface PluginSeriesSnapshot {
  readonly id: string;
  readonly type: SeriesType;
  readonly paneId: string;
  readonly title?: string;
  readonly style: SeriesStyle;
  readonly data: readonly SeriesPoint[];
}

export interface PluginRenderContext {
  readonly width: number;
  readonly height: number;
  readonly devicePixelRatio: number;
  readonly theme: Readonly<ChartTheme>;
  readonly series: readonly PluginSeriesSnapshot[];
  readonly panes: readonly PluginPaneBounds[];
  readonly times: readonly number[];
  readonly xForTime: (time: number) => number;
  readonly timeForX: (x: number) => number;
  readonly pane: (id?: string) => PluginPaneRenderContext | undefined;
}

export interface PluginPaneRenderContext extends PluginPaneBounds {
  readonly xForTime: (time: number) => number;
  readonly timeForX: (x: number) => number;
  readonly yForPrice: (price: number) => number;
  readonly priceForY: (y: number) => number;
}

export type PluginRenderCommand =
  | {
      readonly kind: "line";
      readonly from: { readonly x: number; readonly y: number };
      readonly to: { readonly x: number; readonly y: number };
      readonly color?: string;
      readonly lineWidth?: number;
      readonly alpha?: number;
    }
  | {
      readonly kind: "rectangle";
      readonly left: number;
      readonly top: number;
      readonly width: number;
      readonly height: number;
      readonly color?: string;
      readonly fillColor?: string;
      readonly lineWidth?: number;
      readonly alpha?: number;
    }
  | {
      readonly kind: "text";
      readonly x: number;
      readonly y: number;
      readonly text: string;
      readonly color?: string;
      readonly font?: string;
      readonly alpha?: number;
    };

export interface PluginOverlayRenderItem {
  readonly id: string;
  readonly zIndex: number;
  readonly commands: readonly PluginRenderCommand[];
}

export interface PluginOverlayDefinition {
  readonly id: string;
  readonly title: string;
  readonly zIndex?: number;
  render(context: PluginRenderContext): readonly PluginRenderCommand[];
}

export interface PluginIndicatorApi {
  register(definition: IndicatorDefinition): Disposable;
}

export interface PluginDrawingApi {
  register(definition: DrawingToolDefinition): Disposable;
}

export interface PluginOverlayApi {
  register(definition: PluginOverlayDefinition): Disposable;
}

export interface PluginContext {
  readonly apiVersion: PluginApiVersion;
  readonly plugin: Readonly<PluginMetadata>;
  readonly indicators: PluginIndicatorApi;
  readonly drawings: PluginDrawingApi;
  readonly overlays: PluginOverlayApi;
  readonly events: PluginEventApi;
  readonly commands: PluginCommandApi;
  readonly state: PluginStateStore;
}

export interface OpenKlinePlugin {
  readonly metadata: PluginMetadata;
  setup(context: PluginContext): void | (() => void);
}

export interface PluginHandle extends Disposable {
  readonly metadata: Readonly<PluginMetadata>;
  readonly state: PluginStateStore;
}

export interface InstalledPluginMetadata extends PluginMetadata {
  readonly active: boolean;
}

export class PluginValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "PluginValidationError";
  }
}

export class PluginCompatibilityError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "PluginCompatibilityError";
  }
}

export class PluginLifecycleError extends Error {
  public constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PluginLifecycleError";
  }
}
