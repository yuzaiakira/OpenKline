import {
  parseStudioWorkspace,
  StudioWorkspaceValidationError,
  type StudioWorkspaceDocument,
} from "./workspace.js";

/** Soft upper bound for Studio JSON imports; protects the host from oversized untrusted blobs. */
export const STUDIO_WORKSPACE_IMPORT_MAX_BYTES = 2_000_000;

/** Maximum length for a Studio workspace display name after normalization. */
export const STUDIO_WORKSPACE_NAME_MAX_LENGTH = 80;

export type StudioWorkspaceImportFailureReason =
  | "empty"
  | "too-large"
  | "invalid-json"
  | "invalid-document"
  | "invalid-name";

export class StudioWorkspaceImportError extends Error {
  public readonly reason: StudioWorkspaceImportFailureReason;

  public constructor(reason: StudioWorkspaceImportFailureReason, message: string) {
    super(message);
    this.name = "StudioWorkspaceImportError";
    this.reason = reason;
  }
}

export interface PreparedStudioWorkspaceImport {
  readonly document: StudioWorkspaceDocument;
  readonly sourceId: string;
  readonly sourceName: string;
  readonly panelCount: number;
  readonly panelIds: readonly string[];
  readonly suggestedName: string;
  readonly nameCollision: boolean;
  readonly idCollision: boolean;
}

/**
 * Normalize a Studio workspace display name for import / Save As UX.
 * Trims edges, collapses internal whitespace, and enforces a bounded length.
 */
export function normalizeStudioWorkspaceName(value: string): string {
  if (typeof value !== "string") {
    throw new StudioWorkspaceImportError("invalid-name", "Workspace name must be a non-empty string");
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length === 0) {
    throw new StudioWorkspaceImportError("invalid-name", "Workspace name must be a non-empty string");
  }
  if (normalized.length > STUDIO_WORKSPACE_NAME_MAX_LENGTH) {
    throw new StudioWorkspaceImportError(
      "invalid-name",
      `Workspace name must be at most ${STUDIO_WORKSPACE_NAME_MAX_LENGTH} characters`,
    );
  }
  return normalized;
}

/**
 * Parse and validate an imported Studio workspace JSON string without mutating storage.
 */
function utf8ByteLength(text: string): number {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text).length;
  return text.length;
}

export function parseStudioWorkspaceImportText(text: string, byteLength = utf8ByteLength(text)): StudioWorkspaceDocument {
  if (typeof text !== "string" || text.trim().length === 0) {
    throw new StudioWorkspaceImportError("empty", "Import file is empty");
  }
  if (byteLength > STUDIO_WORKSPACE_IMPORT_MAX_BYTES) {
    throw new StudioWorkspaceImportError(
      "too-large",
      `Import file exceeds the ${STUDIO_WORKSPACE_IMPORT_MAX_BYTES} byte Studio limit`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new StudioWorkspaceImportError("invalid-json", "Import file is not valid JSON");
  }
  try {
    return parseStudioWorkspace(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new StudioWorkspaceImportError("invalid-document", message);
  }
}

export interface PrepareStudioWorkspaceImportOptions {
  readonly text: string;
  readonly byteLength?: number;
  readonly existingIds?: readonly string[];
  readonly existingNames?: readonly string[];
}

/**
 * Validate import text and describe collisions. Does not assign a new id yet.
 */
export function prepareStudioWorkspaceImport(options: PrepareStudioWorkspaceImportOptions): PreparedStudioWorkspaceImport {
  const document = parseStudioWorkspaceImportText(options.text, options.byteLength ?? utf8ByteLength(options.text));
  const existingIds = new Set(options.existingIds ?? []);
  const existingNames = new Set((options.existingNames ?? []).map((name) => name.trim().replace(/\s+/g, " ").toLowerCase()));
  const suggestedName = normalizeStudioWorkspaceName(document.name);
  return {
    document,
    sourceId: document.id,
    sourceName: document.name,
    panelCount: document.charts.length,
    panelIds: document.charts.map((chart) => chart.panelId),
    suggestedName,
    nameCollision: existingNames.has(suggestedName.toLowerCase()),
    idCollision: existingIds.has(document.id),
  };
}

/**
 * Allocate an import id that cannot collide with existing stored ids even when
 * multiple imports share the same wall-clock millisecond.
 */
export function allocateStudioWorkspaceImportId(
  existingIds: readonly string[],
  nowMs: number = Date.now(),
): string {
  if (!Number.isFinite(nowMs)) {
    throw new StudioWorkspaceImportError("invalid-name", "Import id clock must be a finite number");
  }
  const occupied = new Set(existingIds);
  const stamp = Math.trunc(nowMs);
  for (let sequence = 0; sequence < 10_000; sequence += 1) {
    const candidate = `imported-${stamp}-${sequence}`;
    if (!occupied.has(candidate)) return candidate;
  }
  throw new StudioWorkspaceImportError(
    "invalid-document",
    "Could not allocate a unique imported workspace id",
  );
}

/**
 * Assign a host-owned id/name for a validated import so existing stored ids are never overwritten.
 */
export function finalizeStudioWorkspaceImport(
  document: StudioWorkspaceDocument,
  name: string,
  newId: string,
): StudioWorkspaceDocument {
  const normalizedName = normalizeStudioWorkspaceName(name);
  const normalizedId = newId.trim();
  if (normalizedId.length === 0) {
    throw new StudioWorkspaceValidationError("Studio workspace id must be a non-empty string");
  }
  return parseStudioWorkspace({
    ...document,
    id: normalizedId,
    name: normalizedName,
  });
}

export function describeStudioWorkspaceImportError(error: unknown): string {
  if (error instanceof StudioWorkspaceImportError) {
    switch (error.reason) {
      case "empty":
        return "Import rejected: the file is empty. The current workspace was not changed.";
      case "too-large":
        return "Import rejected: the file is too large. The current workspace was not changed.";
      case "invalid-json":
        return "Import rejected: the file is not valid JSON. The current workspace was not changed.";
      case "invalid-document":
        return `Import rejected: ${error.message}. The current workspace was not changed.`;
      case "invalid-name":
        return error.message;
      default:
        return "Import rejected. The current workspace was not changed.";
    }
  }
  if (error instanceof StudioWorkspaceValidationError) {
    return `Import rejected: ${error.message}. The current workspace was not changed.`;
  }
  return "Import rejected. The current workspace was not changed.";
}
