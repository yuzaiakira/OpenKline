/**
 * Mobile Studio presentation helpers for the active-panel-only compact layout.
 * The CSS breakpoint is `max-width: 720px` (see studio.module.css).
 */

/** Matches `@media (max-width: 720px)` active-panel-only Studio layout. */
export const STUDIO_MOBILE_BREAKPOINT_PX = 720;

export interface StudioMobilePanelSummary {
  readonly panelId: string;
  readonly symbol: string;
  readonly timeframe: string;
  readonly indicatorCount: number;
  readonly drawingCount: number;
  readonly active: boolean;
  readonly ordinal: number;
  readonly label: string;
  readonly detail: string;
}

export function isStudioMobileViewportWidth(widthPx: number): boolean {
  return Number.isFinite(widthPx) && widthPx <= STUDIO_MOBILE_BREAKPOINT_PX;
}

export function formatStudioMobilePanelLabel(args: {
  readonly panelId: string;
  readonly symbol: string;
  readonly timeframe: string;
}): string {
  return `${args.symbol} · ${args.timeframe}`;
}

export function formatStudioMobilePanelDetail(args: {
  readonly panelId: string;
  readonly indicatorCount: number;
  readonly drawingCount: number;
}): string {
  return `${args.panelId} · ${args.indicatorCount} indicators · ${args.drawingCount} drawings`;
}

export function buildStudioMobilePanelSummaries(
  panels: readonly {
    readonly panelId: string;
    readonly symbol: string;
    readonly timeframe: string;
    readonly indicatorCount?: number;
    readonly drawingCount?: number;
  }[],
  activePanelId: string,
): readonly StudioMobilePanelSummary[] {
  return panels.map((panel, index) => {
    const indicatorCount = panel.indicatorCount ?? 0;
    const drawingCount = panel.drawingCount ?? 0;
    return {
      panelId: panel.panelId,
      symbol: panel.symbol,
      timeframe: panel.timeframe,
      indicatorCount,
      drawingCount,
      active: panel.panelId === activePanelId,
      ordinal: index + 1,
      label: formatStudioMobilePanelLabel(panel),
      detail: formatStudioMobilePanelDetail({
        panelId: panel.panelId,
        indicatorCount,
        drawingCount,
      }),
    };
  });
}

export function describeStudioMobileActivePanel(
  summaries: readonly StudioMobilePanelSummary[],
  activePanelId: string,
): string {
  const active = summaries.find((item) => item.panelId === activePanelId) ?? summaries[0];
  if (active === undefined) return "No chart panels";
  return `Viewing panel ${active.ordinal} of ${summaries.length}: ${active.label}`;
}
