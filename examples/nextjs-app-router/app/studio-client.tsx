"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FinancialChart } from "@openkline/react";
import type { FinancialChartHandle } from "@openkline/react";
import { compileKlineScript } from "openkline";
import type {
  Candle,
  Chart,
  ChartSeriesInfo,
  CrosshairMoveEvent,
  DrawingSnapshot,
  WorkspaceDocument,
} from "openkline";
import styles from "./studio.module.css";

type Timeframe = "5m" | "1h" | "4h" | "1D";
type Presentation = "candles" | "line" | "area";

interface StudioObjects {
  readonly series: readonly ChartSeriesInfo[];
  readonly indicators: ReadonlyArray<{ id: string; indicatorId: string; paneId: string }>;
  readonly drawings: readonly DrawingSnapshot[];
}

const STORAGE_KEY = "openkline-studio-workspace-v1";
const symbols = ["BTC-USD", "ETH-USD", "AAPL"] as const;
const indicatorChoices = [
  ["SMA", "SMA · 20"],
  ["EMA", "EMA · 20"],
  ["RSI", "RSI · 14"],
  ["MACD", "MACD · 12/26/9"],
  ["BOLLINGER_BANDS", "Bollinger Bands · 20"],
  ["ATR", "ATR · 14"],
  ["STOCHASTIC", "Stochastic · 14/3"],
  ["VWAP", "VWAP · UTC day"],
] as const;
const drawingTools = [
  ["trend-line", "Trend"],
  ["horizontal-line", "Horizontal"],
  ["vertical-line", "Vertical"],
  ["rectangle", "Rectangle"],
  ["fibonacci-retracement", "Fib"],
  ["text", "Text"],
] as const;

const defaultScript = [
  'indicator("Studio EMA")',
  'period = input.int("Period", default=21, min=1, max=200)',
  "value = ta.ema(close, period)",
  'plot(value, title="EMA", color="#a78bfa")',
].join("\n");

function intervalFor(timeframe: Timeframe): number {
  return { "5m": 5 * 60_000, "1h": 60 * 60_000, "4h": 4 * 60 * 60_000, "1D": 24 * 60 * 60_000 }[timeframe];
}

function buildCandles(symbol: string, timeframe: Timeframe): Candle[] {
  const interval = intervalFor(timeframe);
  const seed = [...symbol].reduce((total, character) => total + character.charCodeAt(0), 0);
  const baseline = symbol === "BTC-USD" ? 64_000 : symbol === "ETH-USD" ? 3_200 : 190;
  const start = Date.UTC(2026, 0, 1) - interval * 239;
  return Array.from({ length: 240 }, (_, index) => {
    const wave = Math.sin((index + seed) / 13) * baseline * 0.025;
    const trend = index * baseline * 0.00035;
    const close = baseline + wave + trend + Math.cos((index + seed) / 5) * baseline * 0.006;
    const open = close - Math.sin((index + seed) / 3) * baseline * 0.004;
    const spread = baseline * (0.004 + ((index + seed) % 7) * 0.00045);
    return {
      time: start + index * interval,
      open,
      high: Math.max(open, close) + spread,
      low: Math.min(open, close) - spread,
      close,
      volume: 120 + ((index * 17 + seed) % 180) * 8,
    };
  });
}

function pricePoints(candles: readonly Candle[]) {
  return candles.map((candle) => ({ time: candle.time, value: candle.close }));
}

function volumePoints(candles: readonly Candle[]) {
  return candles.map((candle) => ({
    time: candle.time,
    value: candle.volume ?? 0,
    color: candle.close >= candle.open ? "#34d39999" : "#fb718599",
  }));
}

function indicatorParameters(id: string): Record<string, unknown> {
  switch (id) {
    case "MACD": return { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 };
    case "BOLLINGER_BANDS": return { period: 20, standardDeviations: 2 };
    case "STOCHASTIC": return { kPeriod: 14, dPeriod: 3 };
    case "VWAP": return { session: "utc-day" };
    default: return { period: 14 };
  }
}

function textForCrosshair(event: CrosshairMoveEvent | null): string {
  if (event === null || event.time === null || event.price === null) return "Move across the chart for OHLC-scale readout";
  return `${new Date(event.time).toLocaleString()} · ${event.price.toLocaleString(undefined, { maximumFractionDigits: 4 })}`;
}

export default function StudioClient() {
  const handleRef = useRef<FinancialChartHandle>(null);
  const serialRef = useRef(1);
  const [symbol, setSymbol] = useState<(typeof symbols)[number]>("BTC-USD");
  const [timeframe, setTimeframe] = useState<Timeframe>("1h");
  const [presentation, setPresentation] = useState<Presentation>("candles");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [locale, setLocale] = useState("en-US");
  const [timeZone, setTimeZone] = useState("UTC");
  const [pricePrecision, setPricePrecision] = useState(2);
  const [interaction, setInteraction] = useState({ wheelZoom: true, pointerPan: true, crosshair: true, keyboardShortcuts: true });
  const [objects, setObjects] = useState<StudioObjects>({ series: [], indicators: [], drawings: [] });
  const [crosshair, setCrosshair] = useState<CrosshairMoveEvent | null>(null);
  const [notice, setNotice] = useState("Ready. The Studio uses deterministic local market data; no vendor credentials are required.");
  const [indicatorToAdd, setIndicatorToAdd] = useState<(typeof indicatorChoices)[number][0]>("SMA");
  const [scriptOpen, setScriptOpen] = useState(false);
  const [scriptSource, setScriptSource] = useState(defaultScript);
  const [scriptError, setScriptError] = useState<string | null>(null);

  const chart = (): Chart | null => handleRef.current?.getChart() ?? null;

  const refreshObjects = useCallback((target = chart()): void => {
    if (target === null) return;
    const workspace = target.serializeWorkspace();
    setObjects({
      series: target.getSeriesInfo(),
      indicators: workspace.indicators.map((indicator) => ({ id: indicator.id, indicatorId: indicator.indicatorId, paneId: indicator.paneId })),
      drawings: target.getDrawings(),
    });
  }, []);

  const applyPresentation = useCallback((next: Presentation, target = chart()): void => {
    if (target === null) return;
    const visibility: Record<string, boolean> = {
      "studio-price": next === "candles",
      "studio-line": next === "line",
      "studio-area": next === "area",
    };
    for (const [id, visible] of Object.entries(visibility)) {
      if (target.getSeriesIds().includes(id)) target.setSeriesStyle(id, { visible });
    }
    setPresentation(next);
    refreshObjects(target);
  }, [refreshObjects]);

  const replaceMarketData = useCallback((nextSymbol: string, nextTimeframe: Timeframe): void => {
    const target = chart();
    if (target === null) return;
    const candles = buildCandles(nextSymbol, nextTimeframe);
    const workspace = target.serializeWorkspace({ symbol: nextSymbol, timeframe: nextTimeframe });
    const nextWorkspace: WorkspaceDocument = {
      ...workspace,
      series: workspace.series.map((series) => ({
        ...series,
        data: series.type === "candlestick"
          ? candles
          : series.type === "volume" || series.type === "histogram"
            ? volumePoints(candles)
            : pricePoints(candles),
      })),
    };
    try {
      target.restoreWorkspace(nextWorkspace);
      target.resetView();
      refreshObjects(target);
      setNotice(`Loaded ${nextSymbol} at ${nextTimeframe} with ${candles.length} deterministic bars.`);
    } catch (error) {
      setNotice(`Could not replace market data: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [refreshObjects]);

  const initializeChart = useCallback((target: Chart): void => {
    const candles = buildCandles(symbol, timeframe);
    const price = target.addCandlestickSeries({ id: "studio-price", title: "Price", style: { upColor: "#34d399", downColor: "#fb7185" } });
    const line = target.addLineSeries({ id: "studio-line", title: "Close", style: { color: "#60a5fa", lineWidth: 2, visible: false } });
    const area = target.addAreaSeries({ id: "studio-area", title: "Close area", style: { color: "#a78bfa", fillColor: "#8b5cf6", fillOpacity: 0.2, visible: false } });
    const volume = target.addVolumeSeries({ id: "studio-volume", title: "Volume" });
    price.setData(candles);
    line.setData(pricePoints(candles));
    area.setData(pricePoints(candles));
    volume.setData(volumePoints(candles));
    target.addIndicator("SMA", { id: "studio-sma", pane: "main", parameters: { period: 20 } });
    target.addIndicator("RSI", { id: "studio-rsi", pane: "new", parameters: { period: 14 } });
    target.subscribe("drawingSelection", () => window.setTimeout(() => refreshObjects(target), 0));
    target.subscribe("indicatorChange", () => window.setTimeout(() => refreshObjects(target), 0));
    refreshObjects(target);
    setNotice(`Loaded ${symbol} at ${timeframe} with ${candles.length} deterministic bars.`);
  }, [refreshObjects, symbol, timeframe]);

  useEffect(() => () => { handleRef.current = null; }, []);

  const updateTheme = (next: "dark" | "light"): void => {
    chart()?.setOptions({ theme: next });
    setTheme(next);
    setNotice(`${next === "dark" ? "Dark" : "Light"} theme applied without recreating the chart.`);
  };

  const updateInteraction = (name: keyof typeof interaction): void => {
    const next = { ...interaction, [name]: !interaction[name] };
    chart()?.setOptions({ interaction: next });
    setInteraction(next);
  };

  const addIndicator = (): void => {
    const target = chart();
    if (target === null) return;
    const id = `studio-${indicatorToAdd.toLowerCase()}-${serialRef.current++}`;
    try {
      target.addIndicator(indicatorToAdd, {
        id,
        pane: indicatorToAdd === "SMA" || indicatorToAdd === "EMA" || indicatorToAdd === "BOLLINGER_BANDS" || indicatorToAdd === "VWAP" ? "main" : "new",
        parameters: indicatorParameters(indicatorToAdd),
      });
      refreshObjects(target);
      setNotice(`Added ${indicatorToAdd} (${id}).`);
    } catch (error) {
      setNotice(`Could not add ${indicatorToAdd}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const addOverlay = (): void => {
    const target = chart();
    if (target === null) return;
    const data = target.getData();
    const id = `studio-overlay-${serialRef.current++}`;
    const overlay = target.addLineSeries({ id, title: "Custom overlay", style: { color: "#fbbf24", lineWidth: 2 } });
    overlay.setData(data.map((candle) => ({ time: candle.time, value: candle.close * 1.01 })));
    refreshObjects(target);
    setNotice(`Added removable overlay ${id}.`);
  };

  const activateDrawing = (type: string): void => {
    const target = chart();
    if (target === null) return;
    try {
      target.startDrawing(type, {
        style: { color: "#fbbf24", fillColor: "#fbbf2433", lineWidth: 2 },
        ...(type === "text" ? { text: "Studio note" } : {}),
      });
      setNotice(`${type} is active. Place its anchors directly on the chart.`);
    } catch (error) {
      setNotice(`Could not activate ${type}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const patchDrawingStyle = (id: string, patch: Record<string, unknown>): void => {
    const target = chart();
    if (target === null) return;
    const document = target.serializeDrawings();
    target.restoreDrawings({
      version: 1,
      drawings: document.drawings.map((drawing) => drawing.id === id ? { ...drawing, style: { ...drawing.style, ...patch } } : drawing),
    });
    target.selectDrawing(id);
    refreshObjects(target);
  };

  const saveWorkspace = (): void => {
    const target = chart();
    if (target === null) return;
    try {
      const workspace = target.serializeWorkspace({ symbol, timeframe });
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
      setNotice("Workspace saved locally in this browser.");
    } catch (error) {
      setNotice(`Could not save workspace: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const loadWorkspace = (): void => {
    const target = chart();
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (target === null || raw === null) {
      setNotice("No locally saved Studio workspace is available.");
      return;
    }
    try {
      target.restoreWorkspace(JSON.parse(raw));
      refreshObjects(target);
      setNotice("Local workspace restored through the public workspace contract.");
    } catch (error) {
      setNotice(`Could not load workspace: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const exportWorkspace = (): void => {
    const target = chart();
    if (target === null) return;
    const file = new Blob([JSON.stringify(target.serializeWorkspace({ symbol, timeframe }), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `openkline-${symbol.toLowerCase()}-${timeframe}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("Workspace JSON export started.");
  };

  const addScript = (): void => {
    const target = chart();
    if (target === null) return;
    const result = compileKlineScript(scriptSource);
    if (!result.success) {
      const message = result.diagnostics.map((diagnostic) => `L${diagnostic.span.start.line}:${diagnostic.span.start.column} ${diagnostic.message}`).join(" · ");
      setScriptError(message);
      return;
    }
    try {
      target.addScriptIndicator(result.program, { id: `studio-script-${serialRef.current++}`, pane: "new" });
      setScriptError(null);
      setScriptOpen(false);
      refreshObjects(target);
      setNotice(`Added validated KlineScript indicator “${result.program.metadata.name}”.`);
    } catch (error) {
      setScriptError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <main className={styles.studio}>
      <header className={styles.topbar}>
        <div className={styles.brand}><span aria-hidden="true">◈</span><strong>OpenKline Studio</strong><small>Phase 6 local workspace</small></div>
        <label>Symbol
          <select value={symbol} onChange={(event) => { const next = event.target.value as (typeof symbols)[number]; setSymbol(next); replaceMarketData(next, timeframe); }}>
            {symbols.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>Timeframe
          <select value={timeframe} onChange={(event) => { const next = event.target.value as Timeframe; setTimeframe(next); replaceMarketData(symbol, next); }}>
            {(["5m", "1h", "4h", "1D"] as const).map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <div className={styles.topActions}>
          <button type="button" onClick={saveWorkspace}>Save</button>
          <button type="button" onClick={loadWorkspace}>Load</button>
          <button type="button" onClick={exportWorkspace}>Export</button>
          <button type="button" onClick={() => setScriptOpen((open) => !open)} aria-expanded={scriptOpen}>KlineScript</button>
        </div>
      </header>

      <section className={styles.toolbar} aria-label="Chart tools">
        <div className={styles.toolGroup} aria-label="Chart presentation">
          {(["candles", "line", "area"] as const).map((item) => <button key={item} type="button" aria-pressed={presentation === item} onClick={() => applyPresentation(item)}>{item}</button>)}
          <button type="button" onClick={() => chart()?.fitContent()}>Fit</button>
          <button type="button" onClick={() => chart()?.resetView()}>Reset</button>
        </div>
        <div className={styles.toolGroup} aria-label="Drawing tools">
          {drawingTools.map(([type, label]) => <button key={type} type="button" onClick={() => activateDrawing(type)}>{label}</button>)}
          <button type="button" onClick={() => { const changed = chart()?.undoDrawing(); refreshObjects(); if (changed) setNotice("Drawing undo applied."); }}>Undo</button>
          <button type="button" onClick={() => { const changed = chart()?.redoDrawing(); refreshObjects(); if (changed) setNotice("Drawing redo applied."); }}>Redo</button>
        </div>
      </section>

      {scriptOpen ? <section className={styles.scriptPanel} aria-label="KlineScript editor">
        <div><strong>KlineScript Editor</strong><span>Compiled locally through the restricted public compiler.</span></div>
        <textarea value={scriptSource} onChange={(event) => setScriptSource(event.target.value)} spellCheck={false} aria-label="KlineScript source" />
        {scriptError === null ? null : <p role="alert">{scriptError}</p>}
        <div><button type="button" onClick={addScript}>Compile and add</button><button type="button" onClick={() => setScriptOpen(false)}>Close</button></div>
      </section> : null}

      <section className={styles.workspace}>
        <aside className={styles.sidebar} aria-label="Chart object manager">
          <div className={styles.panelHeading}><h2>Objects</h2><button type="button" onClick={addOverlay}>Add overlay</button></div>
          <details open>
            <summary>Series ({objects.series.length})</summary>
            <ul>{objects.series.map((series) => <li key={series.id}>
              <span title={`${series.type} · ${series.dataLength} points`}>{series.title ?? series.id}</span>
              <button type="button" aria-label={`Toggle ${series.id}`} onClick={() => { chart()?.setSeriesStyle(series.id, { visible: series.style.visible === false }); refreshObjects(); }}>{series.style.visible === false ? "Show" : "Hide"}</button>
              <input aria-label={`${series.id} color`} type="color" value={series.style.color ?? series.style.upColor ?? "#60a5fa"} onChange={(event) => { chart()?.setSeriesStyle(series.id, series.type === "candlestick" ? { upColor: event.target.value } : { color: event.target.value }); refreshObjects(); }} />
              {series.id === "studio-price" || series.id.includes(":") ? null : <button type="button" aria-label={`Remove ${series.id}`} onClick={() => { chart()?.removeSeries(series.id); refreshObjects(); }}>×</button>}
            </li>)}</ul>
          </details>
          <details open>
            <summary>Indicators ({objects.indicators.length})</summary>
            <div className={styles.addRow}><select aria-label="Indicator" value={indicatorToAdd} onChange={(event) => setIndicatorToAdd(event.target.value as typeof indicatorToAdd)}>{indicatorChoices.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><button type="button" onClick={addIndicator}>Add</button></div>
            <ul>{objects.indicators.map((indicator) => <li key={indicator.id}><span>{indicator.indicatorId} <small>{indicator.paneId}</small></span><button type="button" aria-label={`Remove ${indicator.id}`} onClick={() => { chart()?.removeIndicator(indicator.id); refreshObjects(); }}>×</button></li>)}</ul>
          </details>
          <details open>
            <summary>Drawings ({objects.drawings.length})</summary>
            <ul>{objects.drawings.map((drawing) => <li key={drawing.id} className={styles.drawingRow}>
              <button type="button" className={styles.objectName} onClick={() => chart()?.selectDrawing(drawing.id)}>{drawing.type}</button>
              <button type="button" onClick={() => patchDrawingStyle(drawing.id, { visible: drawing.style.visible === false })}>{drawing.style.visible === false ? "Show" : "Hide"}</button>
              <button type="button" onClick={() => patchDrawingStyle(drawing.id, { locked: drawing.style.locked !== true })}>{drawing.style.locked ? "Unlock" : "Lock"}</button>
              <input aria-label={`${drawing.id} color`} type="color" value={drawing.style.color ?? "#fbbf24"} onChange={(event) => patchDrawingStyle(drawing.id, { color: event.target.value })} />
              <button type="button" aria-label={`Remove ${drawing.id}`} onClick={() => { chart()?.removeDrawing(drawing.id); refreshObjects(); }}>×</button>
            </li>)}</ul>
          </details>
        </aside>

        <section className={styles.chartColumn} aria-label="OpenKline chart workspace">
          <div className={styles.chartFrame}>
            <FinancialChart
              ref={handleRef}
              autoSize
              theme={theme}
              locale={locale}
              timeZone={timeZone}
              pricePrecision={pricePrecision}
              interaction={interaction}
              onChartReady={initializeChart}
              onCrosshairMove={setCrosshair}
              style={{ height: "100%" }}
            />
          </div>
          <div className={styles.status} aria-live="polite"><span>{textForCrosshair(crosshair)}</span><span>{notice}</span></div>
        </section>

        <aside className={styles.sidebar} aria-label="Chart settings">
          <div className={styles.panelHeading}><h2>Settings</h2></div>
          <label>Theme<select value={theme} onChange={(event) => updateTheme(event.target.value as "dark" | "light")}><option value="dark">Dark</option><option value="light">Light</option></select></label>
          <label>Locale<select value={locale} onChange={(event) => { const next = event.target.value; chart()?.setOptions({ locale: next }); setLocale(next); }}><option value="en-US">English (US)</option><option value="de-DE">Deutsch</option><option value="fa-IR">فارسی</option></select></label>
          <label>Timezone<select value={timeZone} onChange={(event) => { const next = event.target.value; chart()?.setOptions({ timeZone: next }); setTimeZone(next); }}><option value="UTC">UTC</option><option value="America/New_York">New York</option><option value="Asia/Tehran">Tehran</option></select></label>
          <label>Precision<select value={pricePrecision} onChange={(event) => { const next = Number(event.target.value); chart()?.setOptions({ pricePrecision: next }); setPricePrecision(next); }}><option value={0}>0</option><option value={2}>2</option><option value={4}>4</option><option value={6}>6</option></select></label>
          <fieldset><legend>Interaction</legend>{(Object.keys(interaction) as Array<keyof typeof interaction>).map((name) => <label key={name} className={styles.check}><input type="checkbox" checked={interaction[name]} onChange={() => updateInteraction(name)} />{name.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}</label>)}</fieldset>
          <button type="button" onClick={() => { chart()?.pan(-20); setNotice("Panned twenty bars toward history."); }}>Pan history</button>
          <button type="button" onClick={() => { chart()?.zoom(0.75); setNotice("Zoomed in around the centre."); }}>Zoom in</button>
        </aside>
      </section>
    </main>
  );
}
