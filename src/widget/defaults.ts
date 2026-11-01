import type { WidgetFeatureVisibility, WidgetLabels } from "./types.js";

export const DEFAULT_TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
export const DEFAULT_INDICATORS = ["SMA", "EMA", "RSI", "MACD", "BOLLINGER_BANDS"] as const;
export const DEFAULT_DRAWINGS = [
  "trend-line",
  "ray",
  "extended-line",
  "horizontal-line",
  "vertical-line",
  "parallel-channel",
  "rectangle",
  "fibonacci-retracement",
  "fibonacci-extension",
  "price-range",
  "date-range",
  "long-position",
  "short-position",
  "text",
] as const;

export const BASE_SERIES_ID = "widget-price";
export const PRESENTATION_SERIES_ID = "widget-presentation";
export const COMPARISON_SERIES_PREFIX = "widget-comparison-";
export const MAX_COMPARISON_ASSETS = 8;
export const MAX_WATCHLIST_SYMBOLS = 64;

export const DEFAULT_LABELS: WidgetLabels = {
  widgetLabel: "OpenKline financial chart",
  symbol: "Symbol",
  timeframe: "Timeframe",
  chartType: "Chart type",
  indicators: "Indicators",
  drawings: "Drawings",
  theme: "Theme",
  direction: "Direction",
  saveWorkspace: "Save workspace",
  loadWorkspace: "Load workspace",
  add: "Add",
  start: "Start",
  load: "Load",
  loading: "Loading market data",
  empty: "No chart data loaded",
  ready: "Chart ready",
  error: "Chart error",
  indicatorExplorer: "Indicator explorer",
  drawingToolbar: "Drawing tools",
  objectTree: "Object tree",
  drawingProperties: "Drawing properties",
  chartSettings: "Chart settings",
  close: "Close",
  cancel: "Cancel",
  undo: "Undo",
  redo: "Redo",
  update: "Update",
  remove: "Remove",
  apply: "Apply",
  layout: "Layout",
  activeChart: "Active chart",
  synchronization: "Synchronization",
  syncCrosshair: "Sync crosshair",
  syncVisibleRange: "Sync visible range",
  syncEnabled: "Enable synchronization",
  watchlist: "Watchlist",
  comparison: "Comparison",
  replay: "Replay",
  favorite: "Favorite",
  reorder: "Reorder",
  play: "Play",
  pause: "Pause",
  stepForward: "Next bar",
  stepBackward: "Previous bar",
  seek: "Seek",
  exitReplay: "Exit replay",
  speed: "Speed",
  baseline: "Baseline",
  normalization: "Normalization",
};

export function normalizeWidgetLabels(labels?: Partial<WidgetLabels>): WidgetLabels {
  return { ...DEFAULT_LABELS, ...(labels ?? {}) };
}

export function normalizeWidgetFeatures(features?: Partial<WidgetFeatureVisibility>): WidgetFeatureVisibility {
  return {
    header: features?.header ?? true,
    symbol: features?.symbol ?? true,
    timeframe: features?.timeframe ?? true,
    chartType: features?.chartType ?? true,
    indicators: features?.indicators ?? true,
    drawings: features?.drawings ?? true,
    theme: features?.theme ?? true,
    direction: features?.direction ?? true,
    workspace: features?.workspace ?? true,
    status: features?.status ?? true,
    indicatorExplorer: features?.indicatorExplorer ?? true,
    drawingToolbar: features?.drawingToolbar ?? true,
    objectTree: features?.objectTree ?? true,
    drawingProperties: features?.drawingProperties ?? true,
    chartSettings: features?.chartSettings ?? true,
    layout: features?.layout ?? true,
    synchronization: features?.synchronization ?? true,
    watchlist: features?.watchlist ?? true,
    comparison: features?.comparison ?? true,
    replay: features?.replay ?? true,
  };
}
