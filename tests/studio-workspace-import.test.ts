import assert from "node:assert/strict";
import test from "node:test";
import {
  STUDIO_WORKSPACE_IMPORT_MAX_BYTES,
  STUDIO_WORKSPACE_NAME_MAX_LENGTH,
  StudioWorkspaceImportError,
  createStudioWorkspace,
  describeStudioWorkspaceImportError,
  finalizeStudioWorkspaceImport,
  normalizeStudioWorkspaceName,
  parseStudioWorkspaceImportText,
  prepareStudioWorkspaceImport,
  type WorkspaceDocument,
} from "../src/index.js";

function chartWorkspace(): WorkspaceDocument {
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
        id: "drawing-1",
        type: "horizontal-line",
        points: [{ time: 1, price: 100 }],
        style: { color: "#ef4444", lineWidth: 3, locked: true, visible: true },
        zIndex: 0,
      }],
    },
    viewport: { rangeStart: 0, visibleCount: 1 },
    plugins: [],
  };
}

function sampleDocument() {
  return createStudioWorkspace({
    panelId: "chart-1",
    symbol: "BTC-USD",
    timeframe: "1h",
    workspace: chartWorkspace(),
  });
}

test("normalizeStudioWorkspaceName trims, collapses spaces, and rejects empty or oversized names", () => {
  assert.equal(normalizeStudioWorkspaceName("  My   Desk  "), "My Desk");
  assert.throws(() => normalizeStudioWorkspaceName("   "), StudioWorkspaceImportError);
  assert.throws(() => normalizeStudioWorkspaceName("x".repeat(STUDIO_WORKSPACE_NAME_MAX_LENGTH + 1)), /at most/);
});

test("parseStudioWorkspaceImportText validates JSON and Studio documents without mutation", () => {
  const document = sampleDocument();
  const parsed = parseStudioWorkspaceImportText(JSON.stringify(document));
  assert.equal(parsed.id, document.id);
  assert.equal(parsed.charts[0]?.workspace.drawings.drawings[0]?.style.color, "#ef4444");
  assert.throws(() => parseStudioWorkspaceImportText("{"), /not valid JSON/);
  assert.throws(() => parseStudioWorkspaceImportText(JSON.stringify({ version: 99 })), StudioWorkspaceImportError);
  assert.throws(() => parseStudioWorkspaceImportText(""), /empty/);
  assert.throws(
    () => parseStudioWorkspaceImportText("{}", STUDIO_WORKSPACE_IMPORT_MAX_BYTES + 1),
    /too large|exceeds/i,
  );
});

test("prepareStudioWorkspaceImport reports id and name collisions without rewriting identity yet", () => {
  const document = sampleDocument();
  const prepared = prepareStudioWorkspaceImport({
    text: JSON.stringify(document),
    existingIds: [document.id],
    existingNames: [document.name],
  });
  assert.equal(prepared.idCollision, true);
  assert.equal(prepared.nameCollision, true);
  assert.equal(prepared.panelCount, 1);
  assert.equal(prepared.document.id, document.id);
});

test("finalizeStudioWorkspaceImport assigns a new host id and normalized name", () => {
  const document = sampleDocument();
  const finalized = finalizeStudioWorkspaceImport(document, "  Imported Desk  ", "imported-123");
  assert.equal(finalized.id, "imported-123");
  assert.equal(finalized.name, "Imported Desk");
  assert.notEqual(finalized.id, document.id);
  assert.equal(finalized.charts[0]?.workspace.drawings.drawings[0]?.style.locked, true);
});

test("describeStudioWorkspaceImportError preserves current-workspace safety wording", () => {
  const message = describeStudioWorkspaceImportError(new StudioWorkspaceImportError("invalid-json", "bad"));
  assert.match(message, /not changed/i);
  assert.match(message, /JSON/i);
});
