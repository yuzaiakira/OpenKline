import type { IndicatorRegistry } from "../indicators/engine.js";
import type { IndicatorCategory, IndicatorMetadata } from "../indicators/types.js";

/** Catalog entry for Studio Indicator Explorer discovery. */
export interface StudioIndicatorCatalogEntry {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly category: IndicatorCategory;
  readonly overlay: boolean;
  readonly searchableText: string;
}

export interface StudioIndicatorCatalogFilter {
  readonly query?: string;
  readonly category?: string;
  readonly favoriteIds?: readonly string[];
  readonly favoritesOnly?: boolean;
}

const STUDIO_OVERLAY_INDICATOR_IDS = new Set([
  "SMA",
  "EMA",
  "BOLLINGER_BANDS",
  "VWAP",
  "DONCHIAN_CHANNELS",
  "KELTNER_CHANNELS",
  "ANCHORED_VWAP",
]);

/**
 * Build Explorer catalog entries from registry metadata for the Studio-supported ids.
 * Unknown ids are skipped; order follows `supportedIds`.
 */
export function buildStudioIndicatorCatalog(
  registry: Pick<IndicatorRegistry, "has" | "getMetadata">,
  supportedIds: readonly string[],
): readonly StudioIndicatorCatalogEntry[] {
  const entries: StudioIndicatorCatalogEntry[] = [];
  const seen = new Set<string>();
  for (const rawId of supportedIds) {
    const id = rawId.trim().toUpperCase();
    if (id.length === 0 || seen.has(id) || !registry.has(id)) continue;
    seen.add(id);
    const metadata = registry.getMetadata(id);
    entries.push(toCatalogEntry(metadata));
  }
  return entries;
}

export function studioIndicatorDefaultPane(entry: Pick<StudioIndicatorCatalogEntry, "id" | "overlay">): "main" | "new" {
  return entry.overlay || STUDIO_OVERLAY_INDICATOR_IDS.has(entry.id) ? "main" : "new";
}

/**
 * Case-insensitive search across id, name, description, and category.
 * Empty query returns the full (already filtered) catalog.
 */
export function filterStudioIndicatorCatalog(
  catalog: readonly StudioIndicatorCatalogEntry[],
  filter: StudioIndicatorCatalogFilter = {},
): readonly StudioIndicatorCatalogEntry[] {
  const category = filter.category?.trim().toLowerCase() ?? "all";
  const favoritesOnly = filter.favoritesOnly === true;
  const favoriteIds = new Set((filter.favoriteIds ?? []).map((id) => id.toUpperCase()));
  const query = normalizeSearchQuery(filter.query ?? "");
  return catalog.filter((entry) => {
    if (category !== "all" && entry.category.toLowerCase() !== category) return false;
    if (favoritesOnly && !favoriteIds.has(entry.id)) return false;
    if (query.length === 0) return true;
    return entry.searchableText.includes(query);
  });
}

export function listStudioIndicatorCategories(
  catalog: readonly StudioIndicatorCatalogEntry[],
): readonly string[] {
  return ["all", ...new Set(catalog.map((entry) => entry.category))];
}

function toCatalogEntry(metadata: IndicatorMetadata): StudioIndicatorCatalogEntry {
  const category = metadata.category ?? "custom";
  const overlay = metadata.overlay === true || STUDIO_OVERLAY_INDICATOR_IDS.has(metadata.id);
  const label = metadata.name;
  return {
    id: metadata.id,
    name: metadata.name,
    label,
    description: metadata.description,
    category,
    overlay,
    searchableText: normalizeSearchQuery([metadata.id, metadata.name, metadata.description, category].join(" ")),
  };
}

function normalizeSearchQuery(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
