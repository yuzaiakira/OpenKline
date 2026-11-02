import assert from "node:assert/strict";
import test from "node:test";
import {
  STUDIO_WORKSPACE_NAME_MAX_LENGTH,
  StudioWorkspaceImportError,
  StudioWorkspaceLibraryError,
  allocateStudioWorkspaceId,
  createStudioWorkspace,
  deleteStudioWorkspaceRecord,
  duplicateStudioWorkspaceRecord,
  parseStudioWorkspaceCollection,
  renameStudioWorkspaceRecord,
  studioWorkspaceSelectorLabel,
  type StudioWorkspaceCollection,
  type WorkspaceDocument,
} from "../src/index.js";

function chartWorkspace(drawingId: string, color: string, locked = false, visible = true): WorkspaceDocument {
  return {
    version: 1,
    metadata: { symbol: "BTC-USD", timeframe: "1h" },
    chart: {
      theme: {
        background: "#000", text: "#fff", grid: "#111", border: "#222",
        upCandle: "#0f0", downCandle: "#f00", crosshair: "#aaa", volumeUp: "#0f0", volumeDown: "#f00",
      },
      locale: "en-US", timeZone: "UTC", pricePrecision: 2, direction: "ltr",
    },
    panes: [{ id: "main", height: null, minHeight: 120 }],
    series: [],
    indicators: [],
    drawings: {
      version: 1,
      drawings: [{
        id: drawingId,
        type: "horizontal-line",
        points: [{ time: 1, price: 100 }],
        style: { color, lineWidth: 2, locked, visible },
        zIndex: 0,
      }],
    },
    viewport: { rangeStart: 0, visibleCount: 1 },
    plugins: [],
  };
}

function multiPanelDocument(id: string, name: string) {
  const base = createStudioWorkspace(
    {
      panelId: "chart-1",
      symbol: "BTC-USD",
      timeframe: "1h",
      workspace: chartWorkspace("drawing-a", "#ef4444", true, true),
    },
    { id, name },
  );
  return {
    ...base,
    layout: "two-horizontal" as const,
    charts: [
      base.charts[0]!,
      {
        panelId: "chart-2",
        symbol: "ETH-USD",
        timeframe: "4h" as const,
        workspace: chartWorkspace("drawing-b", "#22c55e", false, false),
      },
    ],
  };
}

function sampleCollection(): StudioWorkspaceCollection {
  const first = multiPanelDocument("desk-a", "Alpha Desk");
  const second = multiPanelDocument("desk-b", "Beta Desk");
  return parseStudioWorkspaceCollection({
    version: 1,
    currentId: first.id,
    workspaces: [first, second],
  });
}

test("allocateStudioWorkspaceId stays unique under identical timestamps", () => {
  const stamp = 1_700_000_100_000;
  const first = allocateStudioWorkspaceId([], "copy", stamp);
  const second = allocateStudioWorkspaceId([first], "copy", stamp);
  const third = allocateStudioWorkspaceId([first, second, `copy-${stamp}-2`], "copy", stamp);
  assert.equal(first, `copy-${stamp}-0`);
  assert.equal(second, `copy-${stamp}-1`);
  assert.equal(third, `copy-${stamp}-3`);
});

test("renameStudioWorkspaceRecord updates display name only and preserves multi-panel content", () => {
  const collection = sampleCollection();
  const before = JSON.stringify(collection.workspaces[0]!.charts);
  const renamed = renameStudioWorkspaceRecord(collection, "desk-a", "  Alpha Renamed  ");
  assert.equal(renamed.document.id, "desk-a");
  assert.equal(renamed.document.name, "Alpha Renamed");
  assert.equal(JSON.stringify(renamed.document.charts), before);
  assert.equal(renamed.collection.currentId, "desk-a");
  assert.equal(renamed.collection.workspaces[1]!.name, "Beta Desk");
  assert.equal(renamed.nameCollision, false);
});

test("renameStudioWorkspaceRecord validates empty, whitespace, and long names", () => {
  const collection = sampleCollection();
  assert.throws(() => renameStudioWorkspaceRecord(collection, "desk-a", "   "), StudioWorkspaceImportError);
  assert.throws(() => renameStudioWorkspaceRecord(collection, "desk-a", ""), StudioWorkspaceImportError);
  assert.throws(
    () => renameStudioWorkspaceRecord(collection, "desk-a", "x".repeat(STUDIO_WORKSPACE_NAME_MAX_LENGTH + 1)),
    /at most/,
  );
});

test("renameStudioWorkspaceRecord permits duplicate display names with a collision flag", () => {
  const collection = sampleCollection();
  const renamed = renameStudioWorkspaceRecord(collection, "desk-b", "Alpha Desk");
  assert.equal(renamed.document.name, "Alpha Desk");
  assert.equal(renamed.nameCollision, true);
  assert.equal(renamed.document.id, "desk-b");
  assert.equal(renamed.collection.workspaces[0]!.id, "desk-a");
});

test("renameStudioWorkspaceRecord rejects missing ids", () => {
  assert.throws(
    () => renameStudioWorkspaceRecord(sampleCollection(), "missing", "Nope"),
    (error: unknown) => error instanceof StudioWorkspaceLibraryError && error.reason === "missing",
  );
});

test("deleteStudioWorkspaceRecord removes only the target id and detaches current without emptying unrelated records", () => {
  const collection = sampleCollection();
  const deleted = deleteStudioWorkspaceRecord(collection, "desk-a");
  assert.equal(deleted.deletedId, "desk-a");
  assert.equal(deleted.wasCurrent, true);
  assert.equal(deleted.detachLiveWorkspace, true);
  assert.notEqual(deleted.collection, null);
  assert.equal(deleted.collection!.workspaces.length, 1);
  assert.equal(deleted.collection!.workspaces[0]!.id, "desk-b");
  assert.equal(deleted.collection!.workspaces[0]!.charts[1]?.workspace.drawings.drawings[0]?.style.color, "#22c55e");
  assert.equal(deleted.collection!.currentId, "desk-b");
});

test("deleteStudioWorkspaceRecord preserves live-detach semantics for duplicate display names", () => {
  const twinA = multiPanelDocument("twin-1", "Twin");
  const twinB = multiPanelDocument("twin-2", "Twin");
  const collection = parseStudioWorkspaceCollection({
    version: 1,
    currentId: "twin-2",
    workspaces: [twinA, twinB],
  });
  const deleted = deleteStudioWorkspaceRecord(collection, "twin-2");
  assert.equal(deleted.detachLiveWorkspace, true);
  assert.deepEqual(deleted.collection!.workspaces.map((item) => item.id), ["twin-1"]);
  assert.equal(deleted.collection!.workspaces[0]!.name, "Twin");
});

test("deleteStudioWorkspaceRecord returns null collection when the last record is removed", () => {
  const only = multiPanelDocument("only", "Only Desk");
  const collection = parseStudioWorkspaceCollection({ version: 1, currentId: "only", workspaces: [only] });
  const deleted = deleteStudioWorkspaceRecord(collection, "only");
  assert.equal(deleted.collection, null);
  assert.equal(deleted.detachLiveWorkspace, true);
});

test("deleteStudioWorkspaceRecord rejects missing ids and leaves caller to preserve storage", () => {
  assert.throws(
    () => deleteStudioWorkspaceRecord(sampleCollection(), "ghost"),
    (error: unknown) => error instanceof StudioWorkspaceLibraryError && error.reason === "missing",
  );
});

test("duplicateStudioWorkspaceRecord allocates a collision-safe id and preserves source content", () => {
  const collection = sampleCollection();
  const stamp = 1_700_000_200_000;
  const duplicated = duplicateStudioWorkspaceRecord(collection, "desk-a", stamp);
  assert.equal(duplicated.document.id, `copy-${stamp}-0`);
  assert.match(duplicated.document.name, /Alpha Desk copy/i);
  assert.notEqual(duplicated.document.id, "desk-a");
  assert.equal(duplicated.collection.workspaces.length, 3);
  assert.equal(duplicated.collection.workspaces.find((item) => item.id === "desk-a")?.name, "Alpha Desk");
  assert.equal(
    duplicated.document.charts[1]?.workspace.drawings.drawings[0]?.style.visible,
    false,
  );
  const again = duplicateStudioWorkspaceRecord(duplicated.collection, "desk-a", stamp);
  assert.equal(again.document.id, `copy-${stamp}-1`);
});

test("studioWorkspaceSelectorLabel disambiguates duplicate display names with an id suffix", () => {
  const entries = [
    { id: "alpha-long-id-1111", name: "Desk" },
    { id: "beta-long-id-2222", name: "Desk" },
    { id: "unique", name: "Solo" },
  ];
  assert.equal(studioWorkspaceSelectorLabel(entries[2]!, entries), "Solo");
  assert.match(studioWorkspaceSelectorLabel(entries[0]!, entries), /Desk ·/);
  assert.match(studioWorkspaceSelectorLabel(entries[1]!, entries), /2222/);
});

test("parseStudioWorkspaceCollection rejects empty or broken collections", () => {
  assert.throws(() => parseStudioWorkspaceCollection({ version: 1, currentId: "x", workspaces: [] }), StudioWorkspaceLibraryError);
  assert.throws(() => parseStudioWorkspaceCollection({ version: 1, currentId: "missing", workspaces: [multiPanelDocument("desk-a", "A")] }), StudioWorkspaceLibraryError);
});
