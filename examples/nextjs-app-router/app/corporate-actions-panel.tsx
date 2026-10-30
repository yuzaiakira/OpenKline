"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import type { Chart, Candle, CorporateAction, CorporateActionDataset, PortfolioBacktestResult, WorkspaceCorporateActions, StrategyDefinition } from "openkline";
import { createPortfolioBacktest, StrategyRegistry } from "openkline";
import styles from "./studio.module.css";

interface CorporateActionsPanelProps {
  readonly chart: Chart | null;
  readonly symbol: string;
  readonly timeframe: string;
  readonly replayActive: boolean;
  readonly onNotice: (message: string) => void;
}

type FixtureMode = "raw" | "split-adjusted" | "total-return";

const ILLUSTRATION_SOURCE = {
  id: "openkline-studio-corporate-actions-illustration",
  version: "1.0.0",
  provenance: "Deterministic Studio illustration; not exchange-authoritative",
} as const;

function buildIllustrativeDataset(symbol: string, candles: readonly Candle[]): CorporateActionDataset {
  const first = candles[0];
  if (first === undefined) throw new Error("Corporate-action illustration needs chart data");
  const interval = candles[1] === undefined ? 3_600_000 : Math.max(1, candles[1].time - first.time);
  const at = (index: number): number => candles[Math.min(Math.max(0, index), candles.length - 1)]?.time ?? first.time + index * interval;
  const splitTime = at(30);
  const dividendTime = at(90);
  return {
    version: 1,
    instrumentId: symbol,
    source: { ...ILLUSTRATION_SOURCE },
    knowledgeCoverage: "known",
    actions: [
      {
        id: `${symbol}:illustration:split-2-for-1`,
        instrumentId: symbol,
        kind: "stock-split",
        effectiveTime: splitTime,
        revision: 1,
        source: { ...ILLUSTRATION_SOURCE },
        newShares: 2,
        oldShares: 1,
      },
      {
        id: `${symbol}:illustration:cash-dividend`,
        instrumentId: symbol,
        kind: "cash-dividend",
        effectiveTime: dividendTime,
        exDividendTime: dividendTime,
        paymentTime: at(120),
        revision: 1,
        source: { ...ILLUSTRATION_SOURCE },
        amountPerShare: 1,
        currency: "USD",
      },
    ],
  };
}

function illustrativeStrategy(): StrategyDefinition {
  return {
    metadata: {
      id: "STUDIO-CORPORATE-ACTION-ENTRY",
      name: "Corporate-action illustration entry",
      version: 1,
      description: "Enters a fixed illustrative position on the first completed bar.",
      parameters: [],
      requiredInputs: ["ohlcv"],
    },
    requiresHistory: false,
    validateParameters: () => ({}),
    createEvaluator: () => ({
      evaluateBar: ({ index }) => index === 0 ? [{ action: "enter-long", reason: "Illustrative corporate-action accounting entry" }] : [],
    }),
  };
}

function formatNumber(value: number | null | undefined, digits = 2): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "—" : value.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function formatTime(value: number): string {
  return new Date(value).toISOString();
}

function actionLabel(action: CorporateAction): string {
  if (action.kind === "cash-dividend") return `${action.amountPerShare} ${action.currency} cash dividend`;
  return `${action.newShares}:${action.oldShares} ${action.kind === "stock-split" ? "stock split" : "reverse split"}`;
}

function calculatePortfolioPreview(symbol: string, timeframe: string, candles: readonly Candle[], dataset: CorporateActionDataset): PortfolioBacktestResult {
  const registry = new StrategyRegistry();
  registry.register(illustrativeStrategy());
  const session = createPortfolioBacktest({
    accountCurrency: "USD",
    initialCapital: 10_000,
    instruments: [{
      id: symbol,
      symbol,
      quoteCurrency: "USD",
      timeframe,
      candles,
      strategy: { strategy: "STUDIO-CORPORATE-ACTION-ENTRY", parameters: {} },
      corporateActions: dataset,
    }],
    positionSizing: { type: "fixed-quantity", quantity: 10 },
    commission: { type: "percent", value: 0 },
    slippage: { type: "percent", value: 0 },
    strategyRegistry: registry,
  });
  try {
    return session.run();
  } finally {
    session.dispose();
  }
}

export function CorporateActionsPanel({ chart, symbol, timeframe, replayActive, onNotice }: CorporateActionsPanelProps): ReactElement {
  const [dataset, setDataset] = useState<CorporateActionDataset | null>(null);
  const [unresolvedReference, setUnresolvedReference] = useState<WorkspaceCorporateActions | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [mode, setMode] = useState<FixtureMode>("raw");
  const [markersVisible, setMarkersVisible] = useState(true);
  const [selectedActionId, setSelectedActionId] = useState("");
  const [adjustment, setAdjustment] = useState<ReturnType<Chart["getCorporateActionAdjustment"]>>(null);
  const [displayedClose, setDisplayedClose] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const syncFromChart = (target: Chart, nextDataset: CorporateActionDataset | null = target.getCorporateActions()): void => {
    setDataset(nextDataset);
    setCandles(target.getData());
    setAdjustment(target.getCorporateActionAdjustment());
    setDisplayedClose(target.getDisplayedData().at(-1)?.close ?? null);
    if (nextDataset !== null) setSelectedActionId((current) => nextDataset.actions.some((action) => action.id === current) ? current : nextDataset.actions[0]?.id ?? "");
  };

  useEffect(() => {
    setError(null);
    setDataset(null);
    setUnresolvedReference(null);
    setCandles([]);
    setAdjustment(null);
    setDisplayedClose(null);
    if (chart === null) return;
    try {
      const existing = chart.getCorporateActions();
      const persistedReference = chart.serializeWorkspace().corporateActions;
      if (existing !== null) {
        const options = chart.getCorporateActionDisplayOptions();
        setMode(options.mode);
        setMarkersVisible(options.markersVisible);
        syncFromChart(chart, existing);
        return;
      }
      if (persistedReference !== undefined) {
        setUnresolvedReference(persistedReference);
        setCandles(chart.getData());
        return;
      }
      const raw = chart.getData();
      if (raw.length === 0) return;
      const illustration = buildIllustrativeDataset(symbol, raw);
      chart.setCorporateActions(illustration, { mode: "raw", context: "retrospective", markersVisible: true });
      syncFromChart(chart, illustration);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [chart, symbol, timeframe]);

  const portfolioPreview = useMemo(() => {
    if (dataset === null || candles.length === 0) return { result: null, error: null };
    try {
      return { result: calculatePortfolioPreview(symbol, timeframe, candles, dataset), error: null };
    } catch (cause) {
      return { result: null, error: cause instanceof Error ? cause.message : String(cause) };
    }
  }, [candles, dataset, symbol, timeframe]);

  const selectedAction = dataset?.actions.find((action) => action.id === selectedActionId) ?? dataset?.actions[0] ?? null;
  const priceReturn = candles.length > 1 && candles[0] !== undefined && candles.at(-1) !== undefined && candles[0].close !== 0
    ? ((candles.at(-1)!.close - candles[0].close) / candles[0].close) * 100
    : null;
  const totalReturnPoints = adjustment?.totalReturn ?? [];
  const totalReturn = totalReturnPoints.length > 1 && totalReturnPoints[0] !== undefined && totalReturnPoints.at(-1) !== undefined && totalReturnPoints[0].value !== 0
    ? ((totalReturnPoints.at(-1)!.value - totalReturnPoints[0].value) / totalReturnPoints[0].value) * 100
    : null;
  const sourceText = unresolvedReference === null
    ? dataset?.source.id ?? "waiting for chart data"
    : `unresolved: ${unresolvedReference.sourceId}@${unresolvedReference.sourceVersion}`;

  const applyMode = (nextMode: FixtureMode): void => {
    if (chart === null || dataset === null || replayActive) return;
    try {
      chart.setCorporateActionDisplayMode(nextMode, { context: "retrospective", markersVisible });
      setMode(nextMode);
      setAdjustment(chart.getCorporateActionAdjustment());
      setDisplayedClose(chart.getDisplayedData().at(-1)?.close ?? null);
      onNotice(`Corporate-action view changed to ${nextMode}; raw candles remain unchanged.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const setMarkerVisibility = (visible: boolean): void => {
    if (chart === null || replayActive) return;
    try {
      chart.setCorporateActionMarkersVisible(visible);
      setMarkersVisible(visible);
      onNotice(`Corporate-action markers ${visible ? "shown" : "hidden"}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const loadIllustration = (): void => {
    if (chart === null || replayActive) return;
    try {
      const raw = chart.getData();
      const illustration = buildIllustrativeDataset(symbol, raw);
      chart.clearCorporateActions();
      chart.setCorporateActions(illustration, { mode: "raw", context: "retrospective", markersVisible: true });
      setUnresolvedReference(null);
      setMode("raw");
      syncFromChart(chart, illustration);
      onNotice("Loaded the deterministic corporate-action illustration; it is not authoritative market data.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const portfolio = portfolioPreview.result;
  return <section className={styles.corporateActionsPanel} aria-label="Corporate Actions & Total Return" data-corporate-actions-status={chart === null ? "waiting" : unresolvedReference === null ? "ready" : "unresolved"} data-corporate-actions-mode={mode} data-corporate-actions-source={sourceText} data-corporate-actions-replay={replayActive ? "active" : "idle"}>
    <div className={styles.panelHeading}>
      <div>
        <h2>Corporate Actions &amp; Total Return</h2>
        <small>Selected chart: {symbol} · {timeframe}</small>
      </div>
      <span className={styles.corporateActionsBadge}>Illustration · offline fixture</span>
    </div>
    <p className={styles.corporateActionsSource}>Source: <code>{sourceText}</code>. Values are deterministic for UI verification and are not exchange-authoritative. Required source identity and knowledge coverage remain explicit.</p>
    {unresolvedReference === null ? null : <div className={styles.corporateActionWarning} role="status"><strong>Source unresolved.</strong> The saved workspace reference was preserved and no replacement dataset was loaded. Choose the explicit offline illustration only if that substitution is intended. <button type="button" onClick={loadIllustration} disabled={replayActive}>Load offline illustration</button></div>}
    {error === null && portfolioPreview.error === null ? null : <p className={styles.corporateActionWarning} role="alert">Corporate-action preview error: {error ?? portfolioPreview.error}</p>}
    <div className={styles.corporateActionsControls}>
      <label>Analysis view<select aria-label="Corporate action display mode" value={mode} disabled={chart === null || dataset === null || replayActive} onChange={(event) => applyMode(event.target.value as FixtureMode)}><option value="raw">Raw OHLCV</option><option value="split-adjusted">Split-adjusted OHLCV</option><option value="total-return">Total-return index</option></select></label>
      <label className={styles.check}><input aria-label="Show corporate-action markers" type="checkbox" checked={markersVisible} disabled={chart === null || dataset === null || replayActive} onChange={(event) => setMarkerVisibility(event.target.checked)} />Show event markers</label>
      <label>Event details<select aria-label="Corporate action event" value={selectedAction?.id ?? ""} disabled={dataset === null} onChange={(event) => setSelectedActionId(event.target.value)}><option value="">No event</option>{dataset?.actions.map((action) => <option key={action.id} value={action.id}>{actionLabel(action)}</option>)}</select></label>
    </div>
    {replayActive ? <p className={styles.corporateActionWarning}>Replay is active. Controls are read-only; future events are masked and split-adjusted replay uses the causal historical boundary.</p> : null}
    {selectedAction === null ? null : <div className={styles.corporateActionDetails} role="group" aria-label="Selected corporate action details"><strong>{actionLabel(selectedAction)}</strong><span>Effective: {formatTime(selectedAction.effectiveTime)}</span><span>Revision: {selectedAction.revision}</span><span>Knowledge: {selectedAction.knowledgeTime === undefined ? "not declared" : formatTime(selectedAction.knowledgeTime)}</span>{selectedAction.kind === "cash-dividend" ? <span>Payment: {selectedAction.paymentTime === undefined ? "not declared" : formatTime(selectedAction.paymentTime)}</span> : null}</div>}
    <div className={styles.corporateActionsSummary} aria-label="Corporate action view summary">
      <div><small>Raw candles</small><strong>{candles.length}</strong></div>
      <div><small>Displayed close</small><strong>{mode === "total-return" ? "Index only" : formatNumber(displayedClose)}</strong></div>
      <div><small>Price return</small><strong>{priceReturn === null ? "—" : `${formatNumber(priceReturn)}%`}</strong></div>
      <div><small>Total return</small><strong>{totalReturn === null ? "—" : `${formatNumber(totalReturn)}%`}</strong></div>
      <div><small>Applied events</small><strong>{adjustment?.appliedActions.length ?? 0}</strong></div>
      <div><small>Raw unchanged</small><strong>{adjustment?.provenance.rawDataUnchanged === true ? "Yes" : "—"}</strong></div>
    </div>
    {dataset === null ? null : <div className={styles.corporateActionsTableWrap}><table className={styles.corporateActionsTable}><caption>Event markers and source records · {dataset.knowledgeCoverage} coverage</caption><thead><tr><th scope="col">Event</th><th scope="col">Effective</th><th scope="col">Source</th><th scope="col">Status</th></tr></thead><tbody>{dataset.actions.map((action) => <tr key={action.id}><td>{actionLabel(action)}</td><td>{formatTime(action.effectiveTime)}</td><td>{action.source.id}@{action.source.version}</td><td>{adjustment?.appliedActions.some((item) => item.id === action.id) ? "Applied" : "Excluded"}</td></tr>)}</tbody></table></div>}
    <div className={styles.corporateActionsPortfolio} data-corporate-actions-portfolio={portfolio === null ? "unavailable" : "ready"}>
      <div className={styles.panelHeading}><h3>Portfolio accounting preview</h3><small>Illustrative fixed 10-share entry; no live orders or credentials.</small></div>
      {portfolio === null ? <p>Portfolio accounting is available after an offline action dataset is attached.</p> : <div className={styles.corporateActionsSummary}><div><small>Quantity after split</small><strong>{formatNumber(portfolio.positions[0]?.quantity, 4)}</strong></div><div><small>Dividend income</small><strong>{formatNumber(portfolio.metrics.dividendIncome)}</strong></div><div><small>Cash</small><strong>{formatNumber(portfolio.finalAccount.cash)}</strong></div><div><small>Equity</small><strong>{formatNumber(portfolio.finalAccount.equity)}</strong></div><div><small>Ledger events</small><strong>{portfolio.corporateActionLedger?.length ?? 0}</strong></div></div>}
    </div>
    <p className={styles.corporateActionsFootnote}>Total return is an analytical index using the documented reinvestment convention; it is not OHLCV or a historical execution price. The fixture demonstrates the contract only. Provider coverage, corrections, timezone interpretation, and corporate-action completeness must be verified by the consuming application.</p>
  </section>;
}

