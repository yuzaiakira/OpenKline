import assert from "node:assert/strict";
import test from "node:test";
import {
  createStudioWorkspace,
  createStudioWorkspaceBaseline,
  describeStudioWorkspaceSaveStatus,
  resolveStudioWorkspaceSaveStatus,
  studioWorkspaceContentFingerprint,
  studioWorkspaceNeedsNavigationGuard,
  type WorkspaceDocument,
} from "../src/index.js";

function chartWorkspace(drawingColor: string): WorkspaceDocument {
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
        style: { color: drawingColor, lineWidth: 2, locked: false, visible: true },
        zIndex: 0,
      }],
    },
    viewport: { rangeStart: 0, visibleCount: 1 },
    plugins: [],
  };
}

function sampleDocument(id: string, name: string, color = "#ef4444") {
  return createStudioWorkspace(
    {
      panelId: "chart-1",
      symbol: "BTC-USD",
      timeframe: "1h",
      workspace: chartWorkspace(color),
    },
    { id, name },
  );
}

test("content fingerprint ignores workspace id and display name", () => {
  const first = sampleDocument("id-a", "Alpha");
  const renamed = { ...first, id: "id-b", name: "Beta Renamed" };
  assert.equal(studioWorkspaceContentFingerprint(first), studioWorkspaceContentFingerprint(renamed));
});

test("content fingerprint changes when drawing style or layout changes", () => {
  const base = sampleDocument("desk", "Desk", "#ef4444");
  const recolored = sampleDocument("desk", "Desk", "#22c55e");
  assert.notEqual(studioWorkspaceContentFingerprint(base), studioWorkspaceContentFingerprint(recolored));
  const relayout = { ...base, layout: "two-horizontal" as const, charts: [base.charts[0]!, {
    panelId: "chart-2",
    symbol: "ETH-USD",
    timeframe: "4h",
    workspace: chartWorkspace("#22c55e"),
  }] };
  assert.notEqual(studioWorkspaceContentFingerprint(base), studioWorkspaceContentFingerprint(relayout));
});

test("content fingerprint is stable under key insertion order differences", () => {
  const document = sampleDocument("desk", "Desk");
  const shuffled = JSON.parse(JSON.stringify(document)) as typeof document;
  const charts = [...shuffled.charts];
  Object.assign(shuffled, { charts, layout: shuffled.layout, synchronization: shuffled.synchronization });
  assert.equal(studioWorkspaceContentFingerprint(document), studioWorkspaceContentFingerprint(shuffled));
});

test("resolveStudioWorkspaceSaveStatus covers saved, dirty, unsaved, and save-failed", () => {
  const document = sampleDocument("desk", "Desk");
  const baseline = createStudioWorkspaceBaseline(document);
  assert.equal(resolveStudioWorkspaceSaveStatus({
    libraryBackingId: baseline.libraryId,
    baselineFingerprint: baseline.fingerprint,
    liveFingerprint: baseline.fingerprint,
  }), "saved");
  assert.equal(resolveStudioWorkspaceSaveStatus({
    libraryBackingId: baseline.libraryId,
    baselineFingerprint: baseline.fingerprint,
    liveFingerprint: "different",
  }), "unsaved-changes");
  assert.equal(resolveStudioWorkspaceSaveStatus({
    libraryBackingId: null,
    baselineFingerprint: null,
    liveFingerprint: baseline.fingerprint,
  }), "unsaved-workspace");
  assert.equal(resolveStudioWorkspaceSaveStatus({
    libraryBackingId: baseline.libraryId,
    baselineFingerprint: baseline.fingerprint,
    liveFingerprint: baseline.fingerprint,
    saveFailed: true,
  }), "save-failed");
});

test("navigation guard is required for every status except saved and pristine unsaved desks", () => {
  assert.equal(studioWorkspaceNeedsNavigationGuard("saved"), false);
  assert.equal(studioWorkspaceNeedsNavigationGuard("unsaved-changes"), true);
  assert.equal(studioWorkspaceNeedsNavigationGuard("unsaved-workspace"), true);
  assert.equal(studioWorkspaceNeedsNavigationGuard("unsaved-workspace", { pristineUnsavedWorkspace: true }), false);
  assert.equal(studioWorkspaceNeedsNavigationGuard("save-failed"), true);
});

test("status labels remain textual and non-color-only", () => {
  assert.match(describeStudioWorkspaceSaveStatus("saved", "Research"), /Saved/);
  assert.match(describeStudioWorkspaceSaveStatus("unsaved-changes", "Research"), /Unsaved changes/);
  assert.match(describeStudioWorkspaceSaveStatus("unsaved-workspace", "New workspace"), /Unsaved workspace/);
  assert.match(describeStudioWorkspaceSaveStatus("save-failed", "Research"), /Save failed/);
});

test("returning to baseline fingerprint restores saved status", () => {
  const document = sampleDocument("desk", "Desk", "#ef4444");
  const baseline = createStudioWorkspaceBaseline(document);
  const dirty = studioWorkspaceContentFingerprint(sampleDocument("desk", "Desk", "#22c55e"));
  assert.equal(resolveStudioWorkspaceSaveStatus({
    libraryBackingId: "desk",
    baselineFingerprint: baseline.fingerprint,
    liveFingerprint: dirty,
  }), "unsaved-changes");
  assert.equal(resolveStudioWorkspaceSaveStatus({
    libraryBackingId: "desk",
    baselineFingerprint: baseline.fingerprint,
    liveFingerprint: baseline.fingerprint,
  }), "saved");
});
