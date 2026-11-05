import type { StudioWorkspaceDocument } from "./workspace.js";

/** User-facing persistence status for the live Studio desk. */
export type StudioWorkspaceSaveStatus =
  | "saved"
  | "unsaved-changes"
  | "unsaved-workspace"
  | "save-failed";

export interface StudioWorkspaceBaseline {
  /** Persisted library id when a backing record exists; null for new/detached desks. */
  readonly libraryId: string | null;
  /** Fingerprint of last successfully persisted content (id/name excluded). */
  readonly fingerprint: string;
}

/**
 * Deterministic JSON fingerprint with sorted object keys.
 * Used for semantic dirty detection independent of property insertion order.
 */
export function stableStudioJsonFingerprint(value: unknown): string {
  return JSON.stringify(sortStudioJson(value));
}

function sortStudioJson(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => sortStudioJson(item));
  const record = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    sorted[key] = sortStudioJson(record[key]);
  }
  return sorted;
}

/**
 * Content fingerprint for dirty detection.
 * Excludes workspace id and display name so metadata-only rename stays clean.
 */
export function studioWorkspaceContentFingerprint(document: StudioWorkspaceDocument): string {
  return stableStudioJsonFingerprint({
    layout: document.layout,
    charts: document.charts,
    synchronization: document.synchronization,
    watchlists: document.watchlists,
    comparison: document.comparison ?? null,
    portfolioBacktest: document.portfolioBacktest ?? null,
    // Quarantined imported scripts are persisted Studio content; Activate/Dismiss
    // must dirty the desk even before chart indicators change.
    pendingImportedScripts: document.pendingImportedScripts ?? [],
  });
}

export function createStudioWorkspaceBaseline(
  document: StudioWorkspaceDocument,
  libraryId: string | null = document.id,
): StudioWorkspaceBaseline {
  return {
    libraryId,
    fingerprint: studioWorkspaceContentFingerprint(document),
  };
}

export function resolveStudioWorkspaceSaveStatus(args: {
  readonly libraryBackingId: string | null;
  readonly baselineFingerprint: string | null;
  readonly liveFingerprint: string | null;
  readonly saveFailed?: boolean;
}): StudioWorkspaceSaveStatus {
  if (args.saveFailed === true) return "save-failed";
  if (args.libraryBackingId === null || args.baselineFingerprint === null || args.liveFingerprint === null) {
    return "unsaved-workspace";
  }
  if (args.liveFingerprint !== args.baselineFingerprint) return "unsaved-changes";
  return "saved";
}

/**
 * Whether destructive navigation must ask the user.
 * Pristine unsaved desks (new/detached with no edits since origin) do not guard,
 * matching Save semantics where there is nothing meaningful to discard yet.
 */
export function studioWorkspaceNeedsNavigationGuard(
  status: StudioWorkspaceSaveStatus,
  options: { readonly pristineUnsavedWorkspace?: boolean } = {},
): boolean {
  if (status === "saved") return false;
  if (status === "unsaved-workspace" && options.pristineUnsavedWorkspace === true) return false;
  return true;
}

/** Concise status text for the Studio chrome (not color-only). */
export function describeStudioWorkspaceSaveStatus(
  status: StudioWorkspaceSaveStatus,
  workspaceName: string,
): string {
  const label = workspaceName.trim().length > 0 ? workspaceName.trim() : "Workspace";
  switch (status) {
    case "saved":
      return `${label} · Saved`;
    case "unsaved-changes":
      return `${label} · Unsaved changes`;
    case "unsaved-workspace":
      return `${label} · Unsaved workspace`;
    case "save-failed":
      return `${label} · Save failed`;
    default:
      return label;
  }
}

export function studioWorkspaceSaveStatusAnnouncement(status: StudioWorkspaceSaveStatus): string {
  switch (status) {
    case "saved":
      return "Workspace saved.";
    case "unsaved-changes":
      return "Workspace has unsaved changes.";
    case "unsaved-workspace":
      return "Unsaved workspace.";
    case "save-failed":
      return "Workspace save failed.";
    default:
      return "";
  }
}
