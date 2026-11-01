/**
 * Internal Phase 16.4.0 widget foundation.
 *
 * This entry point is intentionally not re-exported by `src/index.ts`. The
 * owner-authorized phase builds and verifies the controller before a separate
 * public API/package decision.
 */
export { createOpenKlineWidget, normalizeWidgetFeatures, normalizeWidgetLabels, WidgetLifecycleError } from "./controller.js";
export type {
  InternalWidget,
  WidgetChartType,
  WidgetDatafeedQuery,
  WidgetDiagnostics,
  WidgetEvent,
  WidgetFeatureVisibility,
  WidgetLabels,
  WidgetOptions,
  WidgetSnapshot,
  WidgetStatus,
  WidgetStorage,
} from "./types.js";
