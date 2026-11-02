import { normalizeStudioWorkspaceName } from "./workspace-import.js";
import {
  parseStudioWorkspace,
  StudioWorkspaceValidationError,
  type StudioWorkspaceDocument,
} from "./workspace.js";

/** Versioned Studio localStorage collection shape used by the reference host. */
export interface StudioWorkspaceCollection {
  readonly version: 1;
  readonly currentId: string;
  readonly workspaces: readonly StudioWorkspaceDocument[];
}

export class StudioWorkspaceLibraryError extends Error {
  public readonly reason: "missing" | "invalid-collection" | "invalid-name" | "empty-collection" | "id-allocation";

  public constructor(reason: StudioWorkspaceLibraryError["reason"], message: string) {
    super(message);
    this.name = "StudioWorkspaceLibraryError";
    this.reason = reason;
  }
}

/**
 * Allocate a collision-safe Studio library id for Save As / Duplicate / detach.
 * Reuses the same stamp+sequence strategy as import ids with a caller-chosen prefix.
 */
export function allocateStudioWorkspaceId(
  existingIds: readonly string[],
  prefix: string = "workspace",
  nowMs: number = Date.now(),
): string {
  const normalizedPrefix = prefix.trim();
  if (normalizedPrefix.length === 0) {
    throw new StudioWorkspaceLibraryError("invalid-name", "Workspace id prefix must be a non-empty string");
  }
  if (!Number.isFinite(nowMs)) {
    throw new StudioWorkspaceLibraryError("invalid-name", "Workspace id clock must be a finite number");
  }
  const occupied = new Set(existingIds);
  const stamp = Math.trunc(nowMs);
  for (let sequence = 0; sequence < 10_000; sequence += 1) {
    const candidate = `${normalizedPrefix}-${stamp}-${sequence}`;
    if (!occupied.has(candidate)) return candidate;
  }
  throw new StudioWorkspaceLibraryError("id-allocation", "Could not allocate a unique Studio workspace id");
}

export function parseStudioWorkspaceCollection(value: unknown): StudioWorkspaceCollection {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new StudioWorkspaceLibraryError("invalid-collection", "Invalid workspace collection");
  }
  const record = value as Record<string, unknown>;
  if (record.version !== 1 || typeof record.currentId !== "string" || !Array.isArray(record.workspaces)) {
    throw new StudioWorkspaceLibraryError("invalid-collection", "Invalid workspace collection");
  }
  const workspaces = record.workspaces.map((item) => parseStudioWorkspace(item));
  if (workspaces.length === 0) {
    throw new StudioWorkspaceLibraryError("empty-collection", "Workspace collection is empty");
  }
  if (!workspaces.some((item) => item.id === record.currentId)) {
    throw new StudioWorkspaceLibraryError("invalid-collection", "Current workspace is missing");
  }
  return { version: 1, currentId: record.currentId, workspaces };
}

/**
 * Rename a saved workspace by stable id. Display name only; document body unchanged.
 * Duplicate display names are permitted (caller may warn).
 */
export function renameStudioWorkspaceRecord(
  collection: StudioWorkspaceCollection,
  id: string,
  nextName: string,
): { readonly collection: StudioWorkspaceCollection; readonly document: StudioWorkspaceDocument; readonly nameCollision: boolean } {
  const named = normalizeStudioWorkspaceName(nextName);
  const index = collection.workspaces.findIndex((item) => item.id === id);
  if (index < 0) {
    throw new StudioWorkspaceLibraryError("missing", `Saved workspace “${id}” was not found`);
  }
  const current = collection.workspaces[index]!;
  const document = parseStudioWorkspace({ ...current, name: named });
  const workspaces = collection.workspaces.map((item, itemIndex) => (itemIndex === index ? document : item));
  const nameCollision = workspaces.some((item) => item.id !== id && item.name.toLowerCase() === named.toLowerCase());
  return {
    collection: { version: 1, currentId: collection.currentId, workspaces },
    document,
    nameCollision,
  };
}

export interface DeleteStudioWorkspaceResult {
  /** Remaining collection, or null when the library is empty after deletion. */
  readonly collection: StudioWorkspaceCollection | null;
  readonly deletedId: string;
  readonly wasCurrent: boolean;
  /** True when the deleted record was current; live Studio should detach without loading another desk. */
  readonly detachLiveWorkspace: boolean;
}

/**
 * Delete exactly one saved workspace by id.
 * When the deleted record was current, the next currentId (if any) is updated for storage
 * continuity, but callers must not auto-load that successor into the live Studio.
 */
export function deleteStudioWorkspaceRecord(
  collection: StudioWorkspaceCollection,
  id: string,
): DeleteStudioWorkspaceResult {
  const remaining = collection.workspaces.filter((item) => item.id !== id);
  if (remaining.length === collection.workspaces.length) {
    throw new StudioWorkspaceLibraryError("missing", `Saved workspace “${id}” was not found`);
  }
  const wasCurrent = collection.currentId === id;
  if (remaining.length === 0) {
    return { collection: null, deletedId: id, wasCurrent, detachLiveWorkspace: wasCurrent };
  }
  const currentId = wasCurrent ? remaining[0]!.id : collection.currentId;
  if (!remaining.some((item) => item.id === currentId)) {
    throw new StudioWorkspaceValidationError("Current workspace is missing after delete");
  }
  return {
    collection: { version: 1, currentId, workspaces: remaining },
    deletedId: id,
    wasCurrent,
    detachLiveWorkspace: wasCurrent,
  };
}

/**
 * Append a duplicate of an existing saved workspace with a new collision-safe id and display name.
 * Source record is unchanged.
 */
export function duplicateStudioWorkspaceRecord(
  collection: StudioWorkspaceCollection,
  sourceId: string,
  nowMs: number = Date.now(),
): { readonly collection: StudioWorkspaceCollection; readonly document: StudioWorkspaceDocument } {
  const source = collection.workspaces.find((item) => item.id === sourceId);
  if (source === undefined) {
    throw new StudioWorkspaceLibraryError("missing", `Saved workspace “${sourceId}” was not found`);
  }
  const existingIds = collection.workspaces.map((item) => item.id);
  const id = allocateStudioWorkspaceId(existingIds, "copy", nowMs);
  const baseName = normalizeStudioWorkspaceName(`${source.name} copy`);
  const document = parseStudioWorkspace({ ...source, id, name: baseName });
  return {
    collection: {
      version: 1,
      currentId: document.id,
      workspaces: [...collection.workspaces, document],
    },
    document,
  };
}

/** Selector label that disambiguates duplicate display names by stable id suffix. */
export function studioWorkspaceSelectorLabel(
  entry: { readonly id: string; readonly name: string },
  entries: readonly { readonly id: string; readonly name: string }[],
): string {
  const collisions = entries.filter((candidate) => candidate.name.toLowerCase() === entry.name.toLowerCase()).length;
  if (collisions <= 1) return entry.name;
  const suffix = entry.id.length <= 8 ? entry.id : entry.id.slice(-8);
  return `${entry.name} · ${suffix}`;
}
