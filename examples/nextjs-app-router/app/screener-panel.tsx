"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createDeterministicScreenerUniverse,
  createUniverseFromWatchlist,
  DeterministicScreenerMarketDataProvider,
  runScreenerSnapshot,
  ScreenerWatchSession,
  type ScreenerRuleNode,
  type ScreenerRuleSet,
  type ScreenerSymbolSnapshot,
  type ScreenerWatchStatus,
  type WatchlistDocument,
} from "openkline";
import styles from "./studio.module.css";

interface ScreenerPanelProps {
  readonly watchlists: WatchlistDocument;
  readonly onOpenChart: (symbol: string) => void;
  readonly onFavorite: (symbol: string) => void;
  readonly onSelectWatchlist: (id: string) => void;
  readonly onNotice: (message: string) => void;
}

interface ScreenerPreset {
  readonly version: 1;
  readonly id: string;
  readonly name: string;
  readonly watchlistId: string;
  readonly timeframe: string;
  readonly ruleSet: ScreenerRuleSet;
}

type SortKey = "symbol" | "match" | "close" | "bars";

const DEMO_PROVIDER_ID = "OPENKLINE-DEMO";
const demoProvider = new DeterministicScreenerMarketDataProvider({ symbolCount: 8, barsPerInstrument: 240, pageSize: 100 });

export function ScreenerPanel({ watchlists, onOpenChart, onFavorite, onSelectWatchlist, onNotice }: ScreenerPanelProps) {
  const selectedWatchlistId = watchlists.selectedWatchlistId ?? watchlists.lists[0]?.id ?? "";
  const selectedList = watchlists.lists.find((list) => list.id === selectedWatchlistId);
  const [timeframe, setTimeframe] = useState("1h");
  const [priceThreshold, setPriceThreshold] = useState("0");
  const [indicator, setIndicator] = useState("none");
  const [indicatorThreshold, setIndicatorThreshold] = useState("50");
  const [groupOperator, setGroupOperator] = useState<"and" | "or">("and");
  const [results, setResults] = useState<readonly ScreenerSymbolSnapshot[]>([]);
  const [status, setStatus] = useState("idle");
  const [watchStatus, setWatchStatus] = useState<ScreenerWatchStatus>("idle");
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [query, setQuery] = useState("");
  const [matchFilter, setMatchFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("symbol");
  const [descending, setDescending] = useState(false);
  const [presetName, setPresetName] = useState("Demo screener");
  const [presets, setPresets] = useState<readonly ScreenerPreset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState("");
  const watchRef = useRef<ScreenerWatchSession | null>(null);
  const presetInputRef = useRef<HTMLInputElement>(null);

  const ruleSet = useMemo<ScreenerRuleSet>(() => {
    const conditions: ScreenerRuleNode[] = [{ type: "price-threshold", field: "close", operator: ">", value: Number(priceThreshold) }];
    if (indicator === "SMA" || indicator === "EMA" || indicator === "RSI") conditions.push({ type: "indicator-threshold", reference: { indicatorId: indicator, parameters: { period: indicator === "RSI" ? 14 : 20 }, output: "value" }, operator: ">", value: Number(indicatorThreshold) });
    return { version: 1, id: "studio-screener", name: "Studio screener", root: conditions.length === 1 ? conditions[0]! : { type: "group", operator: groupOperator, children: conditions } };
  }, [groupOperator, indicator, indicatorThreshold, priceThreshold]);

  useEffect(() => () => { watchRef.current?.dispose(); watchRef.current = null; }, []);

  const scan = async (watch: boolean): Promise<void> => {
    watchRef.current?.dispose();
    watchRef.current = null;
    setStatus(watch ? "starting watch" : "scanning");
    setProgress({ completed: 0, total: selectedList?.symbols.length ?? 0 });
    try {
      const universe = selectedList === undefined ? createDeterministicScreenerUniverse(8) : createUniverseFromWatchlist(watchlists, selectedWatchlistId, DEMO_PROVIDER_ID);
      if (watch) {
        const session = new ScreenerWatchSession({ provider: demoProvider, universe, ruleSet, timeframe, limits: { maxPageSize: 100 }, onStatus: setWatchStatus, onUpdate: (update) => setResults((current) => current.map((item) => item.instrumentIdentity === update.result.instrumentIdentity ? update.result : item)), onError: (_instrument, error) => onNotice(`Screener provider error: ${error.message}`) });
        watchRef.current = session;
        const snapshot = await session.start();
        setResults(snapshot.results);
        setStatus("watching");
      } else {
        const snapshot = await runScreenerSnapshot({ provider: demoProvider, universe, ruleSet, timeframe, evaluationTime: Date.now(), limits: { maxPageSize: 100 }, onProgress: (event) => setProgress({ completed: event.completed, total: event.total }) });
        setResults(snapshot.results);
        setStatus("completed");
      }
    } catch (error) {
      setStatus("error");
      onNotice(`Screener unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const displayed = [...results].filter((result) => result.instrument.symbol.toLowerCase().includes(query.toLowerCase()) && (matchFilter === "all" || result.match === matchFilter)).sort((left, right) => {
    const sign = descending ? -1 : 1;
    if (sortKey === "symbol") return sign * left.instrument.symbol.localeCompare(right.instrument.symbol);
    if (sortKey === "match") return sign * left.match.localeCompare(right.match);
    if (sortKey === "bars") return sign * (left.barsEvaluated - right.barsEvaluated);
    return sign * ((left.evaluation?.value ?? Number.NEGATIVE_INFINITY) - (right.evaluation?.value ?? Number.NEGATIVE_INFINITY));
  });

  const savePreset = (): void => {
    const preset: ScreenerPreset = { version: 1, id: `preset-${Date.now()}`, name: presetName.trim() || "Untitled screener", watchlistId: selectedWatchlistId, timeframe, ruleSet };
    setPresets((current) => [...current.filter((item) => item.name !== preset.name), preset]);
    setSelectedPreset(preset.id);
    onNotice(`Screener preset “${preset.name}” saved separately from the workspace.`);
  };
  const loadPreset = (): void => { const preset = presets.find((item) => item.id === selectedPreset); if (preset === undefined) return; setPresetName(preset.name); setTimeframe(preset.timeframe); const root = preset.ruleSet.root; const conditions = root.type === "group" ? root.children : [root]; const price = conditions.find((item) => item.type === "price-threshold"); const indicatorCondition = conditions.find((item) => item.type === "indicator-threshold"); if (price?.type === "price-threshold") setPriceThreshold(String(price.value)); if (indicatorCondition?.type === "indicator-threshold") { setIndicator(indicatorCondition.reference.indicatorId); setIndicatorThreshold(String(indicatorCondition.value)); } else setIndicator("none"); onNotice(`Preset “${preset.name}” loaded; run it to replace the result table.`); };
  const exportPreset = (): void => { const value = presets.find((item) => item.id === selectedPreset) ?? { version: 1 as const, id: "exported", name: presetName, watchlistId: selectedWatchlistId, timeframe, ruleSet }; const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${value.name.toLowerCase().replace(/\s+/g, "-")}.screener.json`; anchor.click(); URL.revokeObjectURL(url); };
  const importPreset = (file: File): void => { void file.text().then((text) => { try { const value = JSON.parse(text) as ScreenerPreset; if (value.version !== 1 || typeof value.name !== "string" || typeof value.ruleSet !== "object") throw new Error("invalid preset"); setPresets((current) => [...current, value]); setSelectedPreset(value.id); onNotice(`Imported preset “${value.name}” after validation.`); } catch { onNotice("Preset import rejected; current screener settings were preserved."); } }); };

  return <section className={styles.screenerPanel} aria-label="Market screener">
    <div className={styles.panelHeading}><h2>Market Screener</h2><span aria-live="polite">{status}{watchStatus !== "idle" ? ` · ${watchStatus}` : ""}</span></div>
    <div className={styles.screenerControls}>
      <label>Universe<select aria-label="Screener watchlist" value={selectedWatchlistId} onChange={(event) => onSelectWatchlist(event.target.value)}>{watchlists.lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}{watchlists.lists.length === 0 ? <option value="">Deterministic demo</option> : null}</select></label>
      <label>Timeframe<select aria-label="Screener timeframe" value={timeframe} onChange={(event) => setTimeframe(event.target.value)}><option>5m</option><option>1h</option><option>4h</option><option>1D</option></select></label>
      <label>Close &gt;<input aria-label="Screener close threshold" type="number" value={priceThreshold} onChange={(event) => setPriceThreshold(event.target.value)} /></label>
      <label>Indicator<select aria-label="Screener indicator" value={indicator} onChange={(event) => setIndicator(event.target.value)}><option value="none">None</option><option value="SMA">SMA 20</option><option value="EMA">EMA 20</option><option value="RSI">RSI 14</option></select></label>
      {indicator !== "none" ? <label>Indicator &gt;<input aria-label="Screener indicator threshold" type="number" value={indicatorThreshold} onChange={(event) => setIndicatorThreshold(event.target.value)} /></label> : null}
      {indicator !== "none" ? <label>Group<select aria-label="Screener group operator" value={groupOperator} onChange={(event) => setGroupOperator(event.target.value as "and" | "or")}><option value="and">AND</option><option value="or">OR</option></select></label> : null}
      <button type="button" onClick={() => { void scan(false); }}>Run scan</button><button type="button" onClick={() => { void scan(true); }}>Watch</button><button type="button" onClick={() => watchRef.current?.pause()}>Pause</button><button type="button" onClick={() => watchRef.current?.resume()}>Resume</button><button type="button" onClick={() => demoProvider.step()} disabled={watchRef.current === null}>Step demo</button><button type="button" onClick={() => { watchRef.current?.dispose(); watchRef.current = null; setStatus("idle"); setWatchStatus("idle"); }}>Cancel</button>
    </div>
    <div className={styles.screenerPresets}><label>Preset name<input aria-label="Screener preset name" value={presetName} onChange={(event) => setPresetName(event.target.value)} /></label><button type="button" onClick={savePreset}>Save preset</button><select aria-label="Screener preset" value={selectedPreset} onChange={(event) => setSelectedPreset(event.target.value)}><option value="">Select preset</option>{presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select><button type="button" onClick={loadPreset} disabled={selectedPreset === ""}>Load</button><button type="button" onClick={exportPreset}>Export JSON</button><button type="button" onClick={() => presetInputRef.current?.click()}>Import JSON</button><input ref={presetInputRef} type="file" accept="application/json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file !== undefined) importPreset(file); event.currentTarget.value = ""; }} /></div>
    <div className={styles.screenerTableTools}><input aria-label="Screener search" placeholder="Search symbols" value={query} onChange={(event) => setQuery(event.target.value)} /><select aria-label="Screener match filter" value={matchFilter} onChange={(event) => setMatchFilter(event.target.value)}><option value="all">All states</option><option value="matched">Matched</option><option value="unmatched">Unmatched</option><option value="unavailable">Unavailable</option></select><select aria-label="Screener sort" value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}><option value="symbol">Symbol</option><option value="match">Match</option><option value="close">Value</option><option value="bars">Bars</option></select><button type="button" onClick={() => setDescending((value) => !value)}>{descending ? "Descending" : "Ascending"}</button><span>{progress.total === 0 ? `${displayed.length} results` : `${progress.completed}/${progress.total} symbols`}</span></div>
    <div className={styles.screenerTableWrap}><table className={styles.screenerTable}><caption>Screening results. Developing bars are not eligible.</caption><thead><tr><th>Symbol</th><th>State</th><th>Value</th><th>Source bar</th><th>Actions</th></tr></thead><tbody>{displayed.map((result) => <tr key={result.resultId}><td>{result.instrument.symbol}</td><td><span className={result.match === "matched" ? styles.screenerMatched : result.match === "unavailable" ? styles.screenerUnavailable : ""}>{result.match}</span></td><td>{result.evaluation?.value?.toFixed(2) ?? "—"}</td><td>{result.sourceBarTime === null ? result.diagnostics[0] ?? "—" : new Date(result.sourceBarTime).toISOString()}</td><td><button type="button" onClick={() => onOpenChart(result.instrument.symbol)}>Open chart</button><button type="button" onClick={() => onFavorite(result.instrument.symbol)}>Favorite</button></td></tr>)}</tbody></table></div>
    <small className={styles.screenerDisclaimer}>Demo provider: {DEMO_PROVIDER_ID}. Results are descriptive analytics, not alerts, signals, orders, or financial advice.</small>
  </section>;
}

