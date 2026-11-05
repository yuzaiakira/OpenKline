import assert from "node:assert/strict";
import test from "node:test";
import {
  STUDIO_KLINESCRIPT_TEMPLATES,
  allocateStudioScriptInstanceId,
  allocateStudioUserScriptId,
  applyStudioKlineScriptIndicator,
  buildStudioAppliedScriptInspector,
  buildStudioUserScriptCatalog,
  compileStudioKlineScript,
  createStudioWorkspaceBaseline,
  discoverStudioScriptInputs,
  dismissStudioPendingImportedScript,
  filterStudioUserScriptCatalog,
  gateStudioKlineScriptCompile,
  isStudioAppliedScriptIndicator,
  parseStudioWorkspace,
  partitionStudioAppliedIndicators,
  quarantineStudioImportedScripts,
  reapplyStudioKlineScriptIndicator,
  resolveStudioScriptApplyTarget,
  studioWorkspaceContentFingerprint,
  validateStudioScriptParameters,
  type StudioScriptTargetChart,
  type WorkspaceDocument,
} from "../src/index.js";

test("buildStudioUserScriptCatalog separates user scripts from built-in naming", () => {
  const catalog = buildStudioUserScriptCatalog([
    { name: "My EMA", source: 'indicator("My EMA")\nplot(close)' },
    { name: "My EMA", source: "duplicate ignored by id" },
    { id: "custom-rsi", name: "Custom RSI", source: 'indicator("Custom RSI", overlay=False)\nplot(close)' },
  ]);
  assert.equal(catalog.length, 2);
  assert.equal(catalog[0]?.name, "My EMA");
  assert.equal(catalog[1]?.id, "custom-rsi");
  assert.ok(catalog.every((entry) => entry.searchableText.includes(entry.name.toLowerCase().split(" ")[0]!)));
});

test("filterStudioUserScriptCatalog searches name and source without compiling", () => {
  const catalog = buildStudioUserScriptCatalog(STUDIO_KLINESCRIPT_TEMPLATES.map((item) => ({
    id: item.id,
    name: item.name,
    source: item.source,
  })));
  assert.equal(filterStudioUserScriptCatalog(catalog, { query: "" }).length, catalog.length);
  const rsi = filterStudioUserScriptCatalog(catalog, { query: "rsi" });
  assert.equal(rsi.length, 1);
  assert.equal(rsi[0]?.name, "RSI pane");
  assert.equal(filterStudioUserScriptCatalog(catalog, { query: "zzz-no-match" }).length, 0);
});

test("compileStudioKlineScript reports success and diagnostics through the real compiler", () => {
  const ok = compileStudioKlineScript({
    source: STUDIO_KLINESCRIPT_TEMPLATES[2]!.source,
    generation: 3,
  });
  assert.equal(ok.success, true);
  assert.equal(ok.generation, 3);
  assert.ok(ok.programId?.startsWith("KLINESCRIPT-"));
  assert.equal(ok.overlay, true);

  const bad = compileStudioKlineScript({
    source: 'indicator("Broken")\nplot(not_a_series)',
    generation: 4,
  });
  assert.equal(bad.success, false);
  assert.ok(bad.diagnostics.length > 0);
  assert.equal(bad.programId, null);
});

test("gateStudioKlineScriptCompile rejects stale and failed compiles", () => {
  const stale = gateStudioKlineScriptCompile({
    source: 'indicator("Ok")\nplot(close)',
    requestGeneration: 1,
    currentGeneration: 2,
  });
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.reason, "stale");

  const failed = gateStudioKlineScriptCompile({
    source: "not valid klinescript",
    requestGeneration: 5,
    currentGeneration: 5,
  });
  assert.equal(failed.ok, false);
  if (!failed.ok) assert.equal(failed.reason, "compile-failed");

  const ready = gateStudioKlineScriptCompile({
    source: 'indicator("Ok")\nplot(close)',
    requestGeneration: 7,
    currentGeneration: 7,
  });
  assert.equal(ready.ok, true);
});

test("resolveStudioScriptApplyTarget enforces panel ownership and replay", () => {
  const chart: StudioScriptTargetChart = {
    addScriptIndicatorAsync: async () => ({ id: "x", indicatorId: "KLINESCRIPT-x" }),
    removeIndicator: () => undefined,
  };
  assert.equal(resolveStudioScriptApplyTarget({
    activePanelId: "chart-1",
    targetPanelId: "chart-2",
    getChart: () => chart,
  }).ok, false);
  assert.equal(resolveStudioScriptApplyTarget({
    activePanelId: "chart-1",
    targetPanelId: "chart-1",
    replayActive: true,
    getChart: () => chart,
  }).ok, false);
  assert.equal(resolveStudioScriptApplyTarget({
    activePanelId: "chart-1",
    targetPanelId: "chart-1",
    getChart: () => null,
  }).ok, false);
  const ok = resolveStudioScriptApplyTarget({
    activePanelId: "chart-1",
    targetPanelId: "chart-1",
    getChart: () => chart,
  });
  assert.equal(ok.ok, true);
});

test("applyStudioKlineScriptIndicator uses Worker path and rejects stale panel completion", async () => {
  let removed: string | null = null;
  let activePanel = "chart-1";
  let generation = 1;
  const chart: StudioScriptTargetChart = {
    addScriptIndicatorAsync: async (source, options) => {
      assert.match(source, /plot\(close\)/);
      activePanel = "chart-2";
      return { id: options?.id ?? "script-1", indicatorId: "KLINESCRIPT-demo" };
    },
    removeIndicator: (id) => { removed = id; },
  };
  const stale = await applyStudioKlineScriptIndicator({
    source: 'indicator("Demo")\nplot(close)',
    activePanelId: "chart-1",
    targetPanelId: "chart-1",
    requestGeneration: 1,
    getCurrentGeneration: () => generation,
    getActivePanelId: () => activePanel,
    instanceId: allocateStudioScriptInstanceId(9),
    getChart: () => chart,
  });
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.reason, "stale-panel");
  assert.equal(removed, "studio-script-9");

  activePanel = "chart-1";
  removed = null;
  const charts = new Map<string, StudioScriptTargetChart>([["chart-1", {
    addScriptIndicatorAsync: async (_source, options) => ({ id: options?.id ?? "script-2", indicatorId: "KLINESCRIPT-ok" }),
    removeIndicator: (id) => { removed = id; },
  }]]);
  const ok = await applyStudioKlineScriptIndicator({
    source: 'indicator("Demo")\nplot(close)',
    activePanelId: "chart-1",
    targetPanelId: "chart-1",
    requestGeneration: 2,
    getCurrentGeneration: () => 2,
    getActivePanelId: () => "chart-1",
    instanceId: "studio-script-ok",
    getChart: (panelId) => charts.get(panelId),
  });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.instanceId, "studio-script-ok");
    assert.equal(ok.panelId, "chart-1");
  }
  assert.equal(removed, null);

  const failed = await applyStudioKlineScriptIndicator({
    source: "broken",
    activePanelId: "chart-1",
    targetPanelId: "chart-1",
    requestGeneration: 3,
    getCurrentGeneration: () => 3,
    getActivePanelId: () => "chart-1",
    instanceId: "studio-script-bad",
    getChart: (panelId) => charts.get(panelId),
  });
  assert.equal(failed.ok, false);
  if (!failed.ok) assert.equal(failed.reason, "compile-failed");
});

test("partitionStudioAppliedIndicators isolates script instances", () => {
  const partitioned = partitionStudioAppliedIndicators([
    { id: "sma-1", indicatorId: "SMA", paneId: "main" },
    { id: "script-1", indicatorId: "KLINESCRIPT-abc", paneId: "pane-2", script: { programId: "KLINESCRIPT-abc", source: 'indicator("X")\nplot(close)' } },
  ]);
  assert.equal(partitioned.builtIn.length, 1);
  assert.equal(partitioned.scripts.length, 1);
  assert.equal(isStudioAppliedScriptIndicator(partitioned.scripts[0]!), true);
  assert.equal(isStudioAppliedScriptIndicator(partitioned.builtIn[0]!), false);
});

test("script identity helpers stay collision-safe and local", () => {
  assert.equal(allocateStudioScriptInstanceId(3), "studio-script-3");
  assert.equal(allocateStudioUserScriptId("My EMA!", 4), "user-script-my-ema-4");
});

test("workspace fingerprint changes when a script indicator is added", () => {
  const baseDoc = parseStudioWorkspace({
    version: 1,
    id: "ws-script",
    name: "Script desk",
    layout: "single",
    charts: [{
      panelId: "chart-1",
      symbol: "BTC-USD",
      timeframe: "1h",
      workspace: chartWorkspace(),
    }],
    synchronization: { crosshair: false, visibleRange: false, symbol: false, timeframe: false },
    watchlists: { version: 1, selectedWatchlistId: null, lists: [] },
  });
  const baseline = createStudioWorkspaceBaseline(baseDoc);
  const withScript = {
    ...baseDoc,
    charts: [{
      ...baseDoc.charts[0]!,
      workspace: chartWorkspace([{
        id: "studio-script-1",
        indicatorId: "KLINESCRIPT-demo",
        paneId: "pane-2",
        parameters: {},
        outputStyles: {},
        script: { programId: "KLINESCRIPT-demo", source: 'indicator("Demo")\nplot(close)' },
      }]),
    }],
  };
  const next = studioWorkspaceContentFingerprint(withScript);
  assert.notEqual(next, baseline.fingerprint);
});

function chartWorkspace(indicators: WorkspaceDocument["indicators"] = []): WorkspaceDocument {
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
    panes: [{ id: "main", height: null, minHeight: 120 }, ...(indicators.some((item) => item.paneId !== "main") ? [{ id: "pane-2", height: 180, minHeight: 80 }] : [])],
    series: [],
    indicators,
    drawings: { version: 1, drawings: [] },
    viewport: { rangeStart: 0, visibleCount: 1 },
    plugins: [],
  };
}

test("discoverStudioScriptInputs exposes int/float/bool metadata from the compiler", () => {
  const discovered = discoverStudioScriptInputs(STUDIO_KLINESCRIPT_TEMPLATES[0]!.source);
  assert.equal(discovered.success, true);
  assert.equal(discovered.inputs.length, 1);
  assert.equal(discovered.inputs[0]?.name, "period");
  assert.equal(discovered.inputs[0]?.type, "int");
  const valid = validateStudioScriptParameters(discovered.inputs, { period: 34 });
  assert.equal(valid.ok, true);
  const invalid = validateStudioScriptParameters(discovered.inputs, { period: 0.5 });
  assert.equal(invalid.ok, false);
  const inspector = buildStudioAppliedScriptInspector({
    panelId: "chart-1",
    indicator: {
      id: "studio-script-1",
      indicatorId: discovered.programId!,
      paneId: "main",
      parameters: { period: 21 },
      script: { programId: discovered.programId!, source: STUDIO_KLINESCRIPT_TEMPLATES[0]!.source },
    },
  });
  assert.ok(inspector);
  assert.equal(inspector.displayName, "Studio EMA");
  assert.equal(inspector.inputs[0]?.name, "period");
});

test("quarantineStudioImportedScripts strips executable scripts and preserves pending activation records", () => {
  const source = 'indicator("Imported")\nplot(close)';
  const compiled = compileStudioKlineScript({ source, generation: 1 });
  assert.equal(compiled.success, true);
  const document = parseStudioWorkspace({
    version: 1,
    id: "imported-desk",
    name: "Imported desk",
    layout: "single",
    charts: [{
      panelId: "chart-1",
      symbol: "BTC-USD",
      timeframe: "1h",
      workspace: chartWorkspace([{
        id: "studio-script-1",
        indicatorId: compiled.programId!,
        paneId: "main",
        parameters: {},
        outputStyles: {},
        script: { programId: compiled.programId!, source },
      }]),
    }],
    synchronization: { crosshair: false, visibleRange: false, symbol: false, timeframe: false },
    watchlists: { version: 1, selectedWatchlistId: null, lists: [] },
  });
  const { document: stripped, pending } = quarantineStudioImportedScripts(document);
  assert.equal(stripped.charts[0]!.workspace.indicators.length, 0);
  assert.equal(pending.length, 1);
  assert.equal(pending[0]?.source, source);
  const parsed = parseStudioWorkspace(stripped);
  assert.equal(parsed.pendingImportedScripts?.length, 1);
  assert.equal(dismissStudioPendingImportedScript(parsed.pendingImportedScripts ?? [], pending[0]!.pendingId).length, 0);
});

test("quarantine preserves already-pending scripts and ignores forged trust metadata", () => {
  const source = 'indicator("Pending Close")\nplot(close)';
  const compiled = compileStudioKlineScript({ source, generation: 1 });
  assert.equal(compiled.success, true);
  const pendingId = "pending-chart-1-studio-script-1";
  const forged = {
    version: 1,
    id: "forged-desk",
    name: "Forged desk",
    layout: "single",
    charts: [{
      panelId: "chart-1",
      symbol: "BTC-USD",
      timeframe: "1h",
      workspace: chartWorkspace([]),
    }],
    synchronization: { crosshair: false, visibleRange: false, symbol: false, timeframe: false },
    watchlists: { version: 1, selectedWatchlistId: null, lists: [] },
    pendingImportedScripts: [{
      pendingId,
      panelId: "chart-1",
      instanceId: "studio-script-1",
      indicatorId: compiled.programId!,
      paneId: "main",
      programId: compiled.programId!,
      source,
      parameters: {},
      displayName: "Pending Close",
      approved: true,
      trusted: true,
      activationAuthorized: true,
    }],
    scriptsApproved: true,
    trust: { autoActivate: true },
  } as unknown;
  const document = parseStudioWorkspace(forged);
  assert.equal(document.pendingImportedScripts?.length, 1);
  assert.equal("approved" in (document.pendingImportedScripts?.[0] as object), false);
  const { document: stripped, pending } = quarantineStudioImportedScripts(document);
  assert.equal(stripped.charts[0]!.workspace.indicators.length, 0);
  assert.equal(pending.length, 1);
  assert.equal(pending[0]?.pendingId, pendingId);
  assert.equal(pending[0]?.source, source);
  assert.equal(stripped.pendingImportedScripts?.length, 1);

  const revisedSource = 'indicator("Revised")\nplot(open)';
  const revised = parseStudioWorkspace({
    ...stripped,
    charts: [{
      panelId: "chart-1",
      symbol: "BTC-USD",
      timeframe: "1h",
      workspace: chartWorkspace([{
        id: "studio-script-1",
        indicatorId: "KLINESCRIPT-revised",
        paneId: "main",
        parameters: {},
        outputStyles: {},
        script: { programId: "KLINESCRIPT-revised", source: revisedSource },
      }]),
    }],
    pendingImportedScripts: stripped.pendingImportedScripts,
  });
  const requarantined = quarantineStudioImportedScripts(revised);
  assert.equal(requarantined.document.charts[0]!.workspace.indicators.length, 0);
  assert.equal(requarantined.pending.length, 1);
  assert.equal(requarantined.pending[0]?.source, revisedSource);
});

test("reapplyStudioKlineScriptIndicator restores previous revision when the next Worker apply fails", async () => {
  const removed: string[] = [];
  const applied: string[] = [];
  const chart: StudioScriptTargetChart = {
    addScriptIndicatorAsync: async (source, options) => {
      applied.push(source);
      if (source.includes("Broken")) throw new Error("worker failed");
      return { id: options?.id ?? "x", indicatorId: "KLINESCRIPT-ok" };
    },
    removeIndicator: (id) => { removed.push(id); },
  };
  const previous = 'indicator("Ok")\nplot(close)';
  const result = await reapplyStudioKlineScriptIndicator({
    previousSource: previous,
    previousPaneId: "main",
    nextSource: 'indicator("Broken")\nplot(close)\nthis is not valid!!!!',
    instanceId: "studio-script-1",
    activePanelId: "chart-1",
    targetPanelId: "chart-1",
    requestGeneration: 1,
    getCurrentGeneration: () => 1,
    getActivePanelId: () => "chart-1",
    getChart: () => chart,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "compile-failed");
    assert.equal(result.restoredPrevious, false);
  }
  assert.equal(removed.length, 0);

  const runtimeFail = await reapplyStudioKlineScriptIndicator({
    previousSource: previous,
    previousPaneId: "main",
    nextSource: 'indicator("Broken")\nplot(close)',
    instanceId: "studio-script-1",
    activePanelId: "chart-1",
    targetPanelId: "chart-1",
    requestGeneration: 2,
    getCurrentGeneration: () => 2,
    getActivePanelId: () => "chart-1",
    getChart: () => chart,
  });
  assert.equal(runtimeFail.ok, false);
  if (!runtimeFail.ok) {
    assert.equal(runtimeFail.restoredPrevious, true);
  }
  assert.ok(removed.includes("studio-script-1"));
  assert.ok(applied.some((source) => source === previous));
});
