# Phase 15.5.2 public API owner-review dossier

Status: **REQUIRES OWNER APPROVAL**

Review revision: `dc8dad5a10e36ee975e63d000d9e3cf10e3b7914`

Protected compatibility baseline: `3e7a889a94c40255bbcce210a672856cfc98b32b`

This dossier separates an additive engineering diff from approval of the
protected public API baseline. The baseline file was not modified. No owner
approval is inferred from a successful TypeScript build or from the absence of
removed exports.

## Verification commands

| Command | Result | Interpretation |
| --- | --- | --- |
| `npm run api:inventory` | PASS | Current inventory generated for `dc8dad5`; 319 runtime and 736 type exports. |
| `npm run api:diagnostics` | PASS (`PASS_ADDITIVE_REVIEW_REQUIRED`) | No removed exports, changed existing signatures, or required-property additions; three historical declaration hashes require review. |
| `npm run api:check` | FAIL | Strict comparison remains open because `Chart`, `WorkspaceDocument`, and `WorkspaceRestoreOptions` hashes changed. |
| `npm test` | PASS after this dossier's validator test is included | Public API and workspace round-trip tests remain covered by the Node suite. |

The generated current inventory is intentionally tracked. The protected
`docs/audits/public-api-baseline.json` remains at the Phase 15.5.1 baseline and
must not be rewritten until the owner approves the exact contract below.

## Historical versus current declarations

### `WorkspaceDocument`

Historical declaration at the protected baseline:

```ts
export interface WorkspaceDocument {
  readonly version: typeof OPENKLINE_WORKSPACE_VERSION;
  readonly metadata?: WorkspaceMetadata;
  readonly chart: WorkspaceChartConfiguration;
  readonly panes: readonly WorkspacePane[];
  readonly series: readonly WorkspaceSeries[];
  readonly indicators: readonly WorkspaceIndicator[];
  readonly drawings: DrawingDocument;
  readonly viewport: { readonly rangeStart: number; readonly visibleCount: number };
  readonly plugins: readonly WorkspacePluginState[];
  /** Optional serializable alert definitions. Runtime state and history are never persisted. */
  readonly alerts?: AlertDefinitionDocument;
  /** Present when this document was exported from a partial replay-visible chart. */
  readonly replay?: WorkspaceReplayState;
}
```

Current declaration at the review revision preserves every historical member
and adds these six optional members:

```ts
  /** Optional chart-owned volume analytics configuration; legacy version-1 documents omit it. */
  readonly volumeAnalytics?: WorkspaceVolumeAnalytics;
  /** Optional additive Phase 10 multi-timeframe configuration. Derived data is never persisted. */
  readonly multiTimeframe?: WorkspaceMultiTimeframeAnalysis;
  /** Optional Phase 11 session-aware indicator/reference configuration. */
  readonly sessionAnalysis?: WorkspaceSessionAnalysis;
  /** Optional Phase 11 calendar identity and display settings; runtime schedule is resolved by the host. */
  readonly tradingCalendar?: WorkspaceTradingCalendar;
  /** Optional Phase 13 corporate-action source and analytical presentation reference. */
  readonly corporateActions?: WorkspaceCorporateActions;
  /** Optional Phase 14 market-data source references and bounded display settings. */
  readonly orderFlow?: WorkspaceOrderFlow;
```

Baseline hash: `6df247327aa5c6e1c6d207c3c443b070dbd8309879ddeb647a5ad59d2c158b4e`

Current hash: `a64cd69cc0971622e461d6009b6a0837c161e2f48ada76fc4f222068f25e67dd`

All six additions are optional. Existing version-1 documents remain valid;
derived analytics and runtime state are not serialized. A configured document
may now contain additional source/configuration references, so owner approval
must cover the serialization surface and the documented compatibility behavior.

### `WorkspaceRestoreOptions`

Historical declaration:

```ts
export interface WorkspaceRestoreOptions {
  readonly missingPlugins?: "skip" | "error";
  readonly missingIndicators?: "skip" | "error";
}
```

Current declaration adds one optional resolver:

```ts
export interface WorkspaceRestoreOptions {
  readonly missingPlugins?: "skip" | "error";
  readonly missingIndicators?: "skip" | "error";
  /** Resolve a persisted calendar ID/version without serializing executable schedule state. */
  readonly tradingCalendarResolver?:
    (calendarId: string, version: string) => TradingCalendarEngine | undefined;
}
```

Baseline hash: `c2dc1471bc35af1ac923d5ebf1f533e053e722082c52dac927c48d3131023bff`

Current hash: `9bc8fbe1476192dad92bf1f406ef776bb58c1e4ab19ad9d8dd74887536f2dffe`

The callback is optional, affects calendar restoration only when supplied, and
does not serialize executable schedule state. Existing callers do not need to
change. The owner must still approve adding this callback to the public
contract.

### `Chart`

Baseline hash: `3bc2ff383acdcf266a3cddd810dd5f14f44ee4273fa4b703f98047097ca86a75`

Current hash: `c302edb4f198091b97cd126895e45c4ba9166c45b97bd1f95b98df5293c0d4e1`

The baseline `Chart` declaration contained none of the following 46 methods;
the current declaration adds them without changing the parameters or return
types of the historical methods:

```ts
public addAnchoredVwap(options: AnchoredVwapChartOptions): AnchoredVwapApi
public addMultiTimeframeIndicator(options: MultiTimeframeIndicatorOptions): MultiTimeframeIndicatorApi
public addMultiTimeframeReference(options: MultiTimeframeReferenceOptions): MultiTimeframeReferenceApi
public addSessionIndicator(options: SessionIndicatorChartOptions): SessionIndicatorApi
public addSessionReference(options: SessionReferenceChartOptions): SessionReferenceApi
public addVolumeProfile(options: VolumeProfileOptions = {}): VolumeProfileApi
public applyOrderBookDelta(delta: OrderBookDelta): void
public clearCorporateActions(): void
public createMarketReplay(options: ChartMarketReplayOptions): MarketReplayController
public getAnchoredVwaps(): AnchoredVwapApi[]
public getCorporateActionAdjustment(): CorporateActionAdjustmentResult | null
public getCorporateActionDisplayOptions(): Required<Pick<CorporateActionDisplayOptions, "mode" | "context" | "volumePolicy" | "markersVisible">> & Pick<CorporateActionDisplayOptions, "asOfTime" | "sourceDurationMs">
public getCorporateActions(): CorporateActionDataset | null
public getCvdOptions(): Required<CvdDisplayOptions>
public getCvdResult(): CvdResult | null
public getDepthMetrics(): ReturnType<typeof calculateOrderBookDepthMetrics> | null
public getDepthOptions(): Required<DepthDisplayOptions>
public getDepthState(asOfTime?: number): OrderBookState | null
public getDisplayedData(): Candle[]
public getFootprintOptions(): Required<FootprintDisplayOptions>
public getMarketReplay(): MarketReplayController | null
public getMarketTrades(options: { readonly from?: number; readonly to?: number; readonly asOfTime?: number; readonly limit?: number } = {}): MarketTrade[]
public getMultiTimeframeIndicators(): MultiTimeframeIndicatorApi[]
public getMultiTimeframeReferences(): MultiTimeframeReferenceApi[]
public getOrderFlowState(): OrderFlowState
public getPrimaryDrawingPaneBounds(): { readonly id: string; readonly left: number; readonly right: number; readonly top: number; readonly bottom: number; readonly chartWidth: number; readonly chartHeight: number; } | null
public getSessionIndicators(): SessionIndicatorApi[]
public getSessionReferences(): SessionReferenceApi[]
public getTimeAndSales(options: TimeAndSalesOptions): MarketTrade[]
public getTradingCalendar(): TradingCalendarApi | null
public getVolumeProfiles(): VolumeProfileApi[]
public removeOrderFlow(): void
public removeTradingCalendar(): void
public setCorporateActionDisplayMode(mode: NonNullable<CorporateActionDisplayOptions["mode"]>, options: Omit<CorporateActionDisplayOptions, "mode"> = {}): void
public setCorporateActionMarkersVisible(visible: boolean): void
public setCorporateActions(dataset: CorporateActionDataset, options: CorporateActionDisplayOptions = {}): void
public setCvdOptions(options: CvdDisplayOptions): void
public setDepthOptions(options: DepthDisplayOptions): void
public setFootprintOptions(options: FootprintDisplayOptions): void
public async setMarketTradeSource(datafeed: MarketTradeDatafeed, query: MarketTradeQuery): Promise<void>
public setMarketTrades(values: readonly MarketTrade[] | MarketTradeDataset): void
public setOrderBookSnapshot(snapshot: OrderBookSnapshot): void
public async setOrderBookSource(datafeed: OrderBookDatafeed, query: OrderBookQuery): Promise<void>
public setTradingCalendar(calendar: TradingCalendarEngine, options: TradingCalendarDisplayOptions = {}): TradingCalendarApi
public startAnchoredVwapPlacement(id: string): void
public updateMarketTrade(value: MarketTrade): void
```

The current root surface has 432 additive exports/members in total and no
removed or changed existing root export. This is a large additive surface,
not a claim that every new method is stable enough for a release baseline.

## Compatibility and runtime impact

| Contract | TypeScript impact | Runtime/serialization impact | Existing consumer impact | Owner decision |
| --- | --- | --- | --- | --- |
| `Chart` methods | Additive methods only; old calls type-check unchanged. | Opt-in order-flow, calendar, analytics, and replay state; async source setters have lifecycle effects when called. | No migration required for existing calls. | Approve the 46-method additive surface or request a narrower preview surface. |
| `WorkspaceDocument` | Six optional fields; old structural values remain assignable. | New fields may be emitted when configured; legacy documents omit them. | No migration for old documents. | Approve optional serialization and version-1 compatibility statement. |
| `WorkspaceRestoreOptions` | One optional callback; old options remain valid. | Host-supplied calendar resolution can affect restore only when configured. | No migration; no executable state is persisted. | Approve resolver contract and host responsibility. |
| Root export inventory | 432 additive entries; zero removed/changed entries. | Package entry points expose a materially larger API. | Existing imports remain available. | Approve the reviewed surface before baseline update. |

Relevant local coverage includes public API tests, workspace round trips,
market replay, order-flow, calendar, corporate-action, session, and React
integration tests. These tests establish engineering behavior; they do not
constitute owner or legal approval of the public contract.

## Decision record

| Decision | Status | Required evidence |
| --- | --- | --- |
| Keep the historical baseline unchanged during this review | **PASS** | Baseline file remains at commit `3e7a889`; no baseline write was performed. |
| Treat the current delta as additive for engineering triage | **PASS** | Diagnostics found no removal, required addition, or changed existing member. |
| Approve `Chart` additive methods | **REQUIRES OWNER APPROVAL** | Written owner decision against the exact signatures above. |
| Approve workspace optional fields and resolver | **REQUIRES OWNER APPROVAL** | Written owner decision covering serialization and restore behavior. |
| Mark strict API gate complete | **NOT VERIFIED** | `npm run api:check` currently fails on the three changed historical hashes. |

Until these decisions are recorded, maintainers must not rewrite the protected
baseline, advertise a stable API guarantee, or use the additive diagnostics as
a release approval.
