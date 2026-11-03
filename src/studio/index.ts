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
  STUDIO_WORKSPACE_IMPORT_MAX_BYTES,
  STUDIO_WORKSPACE_NAME_MAX_LENGTH,
  StudioWorkspaceImportError,
  allocateStudioWorkspaceImportId,
  describeStudioWorkspaceImportError,
  finalizeStudioWorkspaceImport,
  normalizeStudioWorkspaceName,
  parseStudioWorkspaceImportText,
  prepareStudioWorkspaceImport,
} from "./workspace-import.js";
export type {
  PreparedStudioWorkspaceImport,
  PrepareStudioWorkspaceImportOptions,
  StudioWorkspaceImportFailureReason,
} from "./workspace-import.js";
export {
  StudioWorkspaceLibraryError,
  allocateStudioWorkspaceId,
  deleteStudioWorkspaceRecord,
  duplicateStudioWorkspaceRecord,
  parseStudioWorkspaceCollection,
  renameStudioWorkspaceRecord,
  studioWorkspaceSelectorLabel,
} from "./workspace-library.js";
export type {
  DeleteStudioWorkspaceResult,
  StudioWorkspaceCollection,
} from "./workspace-library.js";
export {
  createStudioWorkspaceBaseline,
  describeStudioWorkspaceSaveStatus,
  resolveStudioWorkspaceSaveStatus,
  stableStudioJsonFingerprint,
  studioWorkspaceContentFingerprint,
  studioWorkspaceNeedsNavigationGuard,
  studioWorkspaceSaveStatusAnnouncement,
} from "./workspace-dirty.js";
export type {
  StudioWorkspaceBaseline,
  StudioWorkspaceSaveStatus,
} from "./workspace-dirty.js";
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
