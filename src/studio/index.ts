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
  applyScopedDrawingZIndex,
  clearScopedDrawingSelection,
} from "./drawing-ownership.js";
export type {
  ApplyScopedDrawingStyleArgs,
  ApplyScopedDrawingZIndexArgs,
  ClearScopedDrawingSelectionArgs,
  ScopedDrawingChart,
  ScopedDrawingMutationFailure,
  ScopedDrawingMutationResult,
} from "./drawing-ownership.js";
export {
  isStudioDrawingColorValue,
  resolveStudioDrawingLayerZIndex,
  resolveStudioDrawingPropertyCapabilities,
  studioDrawingLayerActionLabel,
  studioDrawingSupportsStyleField,
  toStudioDrawingColorInput,
} from "./drawing-properties.js";
export type {
  StudioDrawingLayerAction,
  StudioDrawingLayerCandidate,
  StudioDrawingPropertyCapabilities,
  StudioDrawingStyleField,
} from "./drawing-properties.js";
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
  buildStudioIndicatorCatalog,
  filterStudioIndicatorCatalog,
  listStudioIndicatorCategories,
  studioIndicatorDefaultPane,
} from "./indicator-explorer.js";
export type {
  StudioIndicatorCatalogEntry,
  StudioIndicatorCatalogFilter,
} from "./indicator-explorer.js";
export {
  buildStudioDrawingToolbarCatalog,
  cancelStudioInteractiveDrawing,
  filterStudioDrawingToolbarCatalog,
  listStudioDrawingToolGroups,
  studioDrawingToolGroupLabel,
} from "./drawing-toolbar.js";
export type {
  StudioDrawingToolEntry,
  StudioDrawingToolGroup,
  StudioDrawingToolbarFilter,
} from "./drawing-toolbar.js";
export {
  STUDIO_KLINESCRIPT_TEMPLATES,
  allocateStudioScriptInstanceId,
  allocateStudioUserScriptId,
  applyStudioKlineScriptIndicator,
  buildStudioAppliedScriptInspector,
  buildStudioUserScriptCatalog,
  compileStudioKlineScript,
  discoverStudioScriptInputs,
  dismissStudioPendingImportedScript,
  filterStudioUserScriptCatalog,
  gateStudioKlineScriptCompile,
  isStudioAppliedScriptIndicator,
  partitionStudioAppliedIndicators,
  quarantineStudioImportedScripts,
  reapplyStudioKlineScriptIndicator,
  resolveStudioScriptApplyTarget,
  validateStudioScriptParameters,
} from "./klinescript-studio.js";
export type {
  StudioAppliedIndicatorRef,
  StudioAppliedScriptInspectorModel,
  StudioPendingImportedScript,
  StudioScriptApplyFailureReason,
  StudioScriptApplyTargetArgs,
  StudioScriptApplyTargetResult,
  StudioScriptCompileGateArgs,
  StudioScriptCompileGateResult,
  StudioScriptCompileRequest,
  StudioScriptCompileSnapshot,
  StudioScriptTargetChart,
  StudioUserScriptCatalogFilter,
  StudioUserScriptDefinition,
} from "./klinescript-studio.js";
export type { StudioPendingImportedScriptDocument } from "./workspace.js";
export {
  STUDIO_MOBILE_BREAKPOINT_PX,
  buildStudioMobilePanelSummaries,
  describeStudioMobileActivePanel,
  formatStudioMobilePanelDetail,
  formatStudioMobilePanelLabel,
  isStudioMobileViewportWidth,
} from "./mobile-panels.js";
export type { StudioMobilePanelSummary } from "./mobile-panels.js";
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
