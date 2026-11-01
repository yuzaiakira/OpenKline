/**
 * Internal Phase 16.4.0–16.4.2 widget foundation.
 *
 * This entry point is intentionally not re-exported by `src/index.ts`. The
 * owner-authorized phases build and verify the controller before a separate
 * public API/package decision.
 */
export {
  createOpenKlineWidget,
  normalizeWidgetFeatures,
  normalizeWidgetLabels,
  WidgetLifecycleError,
} from "./controller.js";
export {
  OPENKLINE_WIDGET_COMPOSITION_VERSION,
  chartCountForLayout,
  parseWidgetComposition,
  isWidgetLayout,
} from "./composition.js";
export type {
  WidgetCompositionDocument,
  WidgetChartComposition,
  WidgetComparisonComposition,
  WidgetSyncComposition,
} from "./composition.js";
export { WidgetCompositionValidationError } from "./errors.js";
export type {
  InternalWidget,
  WidgetChartSnapshot,
  WidgetChartType,
  WidgetDataIdentity,
  WidgetDatafeedQuery,
  WidgetDiagnostics,
  WidgetEvent,
  WidgetFeatureVisibility,
  WidgetIdentityStatus,
  WidgetLabels,
  WidgetLayout,
  WidgetOptions,
  WidgetSnapshot,
  WidgetStatus,
  WidgetStorage,
  WidgetSyncOptions,
} from "./types.js";
