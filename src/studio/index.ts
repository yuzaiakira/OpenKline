export {
  OPENKLINE_STUDIO_WORKSPACE_VERSION,
  StudioWorkspaceValidationError,
  chartCount,
  createStudioWorkspace,
  migrateLegacyWorkspace,
  parseStudioWorkspace,
} from "./workspace.js";
export type {
  LegacyWorkspaceMigrationOptions,
  StudioChartPanelDocument,
  StudioComparisonDocument,
  StudioLayout,
  StudioSynchronizationPreferences,
  StudioWorkspaceDocument,
} from "./workspace.js";
export { StudioSynchronizationController } from "./synchronization.js";
export type { StudioSynchronizationTarget, StudioSynchronizationTargets } from "./synchronization.js";
export {
  applyScopedDrawingStyle,
  clearScopedDrawingSelection,
} from "./drawing-ownership.js";
export type {
  ApplyScopedDrawingStyleArgs,
  ClearScopedDrawingSelectionArgs,
  ScopedDrawingChart,
  ScopedDrawingMutationFailure,
  ScopedDrawingMutationResult,
} from "./drawing-ownership.js";
export {
  OPENKLINE_WATCHLIST_VERSION,
  WatchlistModel,
  WatchlistValidationError,
  createDeterministicDemoQuoteProvider,
  parseWatchlistDocument,
} from "./watchlist.js";
export type {
  QuoteProvider,
  QuoteStatus,
  Watchlist,
  WatchlistDocument,
  WatchlistIdFactory,
  WatchlistQuote,
  WatchlistSymbol,
} from "./watchlist.js";
