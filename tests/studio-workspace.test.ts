import test from "node:test";
import assert from "node:assert/strict";
import {
  WatchlistModel,
  WatchlistValidationError,
  createStudioWorkspace,
  migrateLegacyWorkspace,
  parseStudioWorkspace,
  parseWatchlistDocument,
} from "../src/index.js";
import type { WorkspaceDocument } from "../src/workspace.js";

function legacyWorkspace(): WorkspaceDocument {
  return {
    version: 1,
    metadata: { symbol: "BTC-USD", timeframe: "1h" },
    chart: { theme: { background: "#000", text: "#fff", grid: "#111", border: "#222", upCandle: "#0f0", downCandle: "#f00", crosshair: "#aaa", volumeUp: "#0f0", volumeDown: "#f00" }, locale: "en-US", timeZone: "UTC", pricePrecision: 2, direction: "ltr" },
    panes: [{ id: "main", height: null, minHeight: 120 }],
    series: [],
    indicators: [],
    drawings: { version: 1, drawings: [] },
    viewport: { rangeStart: 0, visibleCount: 1 },
    plugins: [],
  };
}

test("Studio workspace parser validates layout cardinality and chart isolation", () => {
  const document = createStudioWorkspace({ panelId: "chart-1", symbol: "BTC-USD", timeframe: "1h", workspace: legacyWorkspace() });
  assert.equal(document.layout, "single");
  assert.equal(document.charts[0]?.workspace.metadata?.symbol, "BTC-USD");
  assert.throws(() => parseStudioWorkspace({ ...document, layout: "four-grid" }), /requires 4/);
  assert.throws(() => parseStudioWorkspace({ ...document, charts: [{ ...document.charts[0]!, panelId: "chart-1" }, { ...document.charts[0]!, panelId: "chart-1" }] }), /requires 1/);
});

test("legacy single-chart workspaces migrate without overwriting source data", () => {
  const legacy = legacyWorkspace();
  const migrated = migrateLegacyWorkspace(legacy);
  assert.equal(migrated.id, "studio-default");
  assert.equal(migrated.charts[0]?.panelId, "chart-1");
  assert.equal(migrated.charts[0]?.symbol, "BTC-USD");
  assert.deepEqual(legacy, legacyWorkspace());
});

test("WatchlistModel supports stable CRUD, ordering, favorites, and round trips", () => {
  let next = 0;
  const model = new WatchlistModel(undefined, (prefix) => `${prefix}-${++next}`);
  const list = model.create("Favorites");
  model.addSymbol(list.id, { id: "btc", displaySymbol: "BTC-USD", name: "Bitcoin", favorite: true });
  model.addSymbol(list.id, { id: "eth", displaySymbol: "ETH-USD", name: "Ether" });
  model.reorderSymbol(list.id, "eth", 0);
  model.setFavorite(list.id, "eth", true);
  assert.deepEqual(model.getDocument().lists[0]?.symbols.map((symbol) => symbol.id), ["eth", "btc"]);
  assert.equal(model.getDocument().lists[0]?.symbols[0]?.favorite, true);
  assert.throws(() => model.addSymbol(list.id, { id: "eth", displaySymbol: "ETH-USD", name: "Duplicate" }), WatchlistValidationError);
  model.removeSymbol(list.id, "btc");
  model.rename(list.id, "Pinned");
  assert.equal(parseWatchlistDocument(model.getDocument()).lists[0]?.name, "Pinned");
  model.delete(list.id);
  assert.equal(model.getDocument().selectedWatchlistId, null);
});
