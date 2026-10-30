import type { PluginOverlayRenderItem, PluginRenderCommand, PluginRenderContext } from "./extensions/types.js";
import { TradingCalendarEngine, type TradingCalendarSnapshot } from "./trading-calendar.js";

/** Display controls for the session overlay; no schedule facts are encoded here. */
export interface TradingCalendarDisplayOptions {
  readonly visible?: boolean;
  readonly showBoundaries?: boolean;
  readonly showBreaks?: boolean;
  readonly showLabels?: boolean;
  readonly sessionColor?: string;
  readonly breakColor?: string;
  readonly labelColor?: string;
  readonly opacity?: number;
  readonly maxSessions?: number;
}

export interface ResolvedTradingCalendarDisplayOptions {
  readonly visible: boolean;
  readonly showBoundaries: boolean;
  readonly showBreaks: boolean;
  readonly showLabels: boolean;
  readonly sessionColor: string;
  readonly breakColor: string;
  readonly labelColor: string;
  readonly opacity: number;
  readonly maxSessions: number;
}

/** Stable workspace representation. The executable calendar remains runtime-only. */
export interface WorkspaceTradingCalendar {
  readonly calendarId: string;
  readonly version: string;
  readonly display: ResolvedTradingCalendarDisplayOptions;
}

export interface TradingCalendarApi {
  readonly calendarId: string;
  readonly version: string;
  readonly timeZone: string;
  getSnapshot(): TradingCalendarSnapshot;
  getDisplayOptions(): ResolvedTradingCalendarDisplayOptions;
  setDisplayOptions(patch: TradingCalendarDisplayOptions): void;
  setVisible(visible: boolean): void;
  remove(): void;
}

const DEFAULT_DISPLAY: ResolvedTradingCalendarDisplayOptions = {
  visible: true,
  showBoundaries: true,
  showBreaks: true,
  showLabels: true,
  sessionColor: "#64748b",
  breakColor: "#94a3b8",
  labelColor: "#64748b",
  opacity: 0.16,
  maxSessions: 128,
};

export function resolveTradingCalendarDisplayOptions(options: TradingCalendarDisplayOptions = {}): ResolvedTradingCalendarDisplayOptions {
  const result = {
    ...DEFAULT_DISPLAY,
    ...options,
  };
  if (typeof result.visible !== "boolean"
    || typeof result.showBoundaries !== "boolean"
    || typeof result.showBreaks !== "boolean"
    || typeof result.showLabels !== "boolean"
    || typeof result.sessionColor !== "string"
    || typeof result.breakColor !== "string"
    || typeof result.labelColor !== "string"
    || !Number.isFinite(result.opacity) || result.opacity < 0 || result.opacity > 1
    || !Number.isSafeInteger(result.maxSessions) || result.maxSessions < 1 || result.maxSessions > 10_000) {
    throw new RangeError("Invalid trading calendar display options");
  }
  return result;
}

export function toWorkspaceTradingCalendar(
  calendar: TradingCalendarEngine,
  display: ResolvedTradingCalendarDisplayOptions,
): WorkspaceTradingCalendar {
  return {
    calendarId: calendar.definition.id,
    version: calendar.definition.version,
    display: { ...display },
  };
}

/** Render only resolved sessions that intersect the current visible UTC range. */
export function renderTradingCalendarOverlay(
  calendar: TradingCalendarEngine,
  display: ResolvedTradingCalendarDisplayOptions,
  context: PluginRenderContext,
  locale: string,
): PluginOverlayRenderItem | null {
  if (!display.visible || context.times.length === 0) return null;
  const pane = context.pane("main");
  if (pane === undefined) return null;
  const visibleFrom = context.times[0]!;
  const visibleTo = Math.max(visibleFrom + 1, context.times.at(-1)! + 1);
  let sessions;
  try {
    sessions = calendar.enumerateSessions(visibleFrom, visibleTo, { maxSessions: display.maxSessions });
  } catch {
    return null;
  }
  const commands: PluginRenderCommand[] = [];
  const clampX = (x: number): number => Math.min(pane.right, Math.max(pane.left, x));
  const dateFormatter = new Intl.DateTimeFormat(locale, { timeZone: calendar.timeZone, month: "short", day: "numeric" });
  const classificationLabel = (classification: string): string => classification === "regular" ? "" : ` · ${classification}`;
  for (const session of sessions) {
    if (display.showBreaks) {
      for (const sessionBreak of session.breaks) {
        const left = clampX(context.xForTime(Math.max(visibleFrom, sessionBreak.start)));
        const right = clampX(context.xForTime(Math.min(visibleTo, sessionBreak.end)));
        if (right > left) {
          commands.push({
            kind: "rectangle",
            left,
            top: pane.top,
            width: right - left,
            height: pane.bottom - pane.top,
            fillColor: display.breakColor,
            color: display.breakColor,
            lineWidth: 0,
            alpha: display.opacity,
          });
        }
      }
    }
    if (display.showBoundaries) {
      for (const boundary of [session.start, session.end]) {
        if (boundary < visibleFrom || boundary > visibleTo) continue;
        const x = clampX(context.xForTime(boundary));
        commands.push({
          kind: "line",
          from: { x, y: pane.top },
          to: { x, y: pane.bottom },
          color: display.sessionColor,
          lineWidth: 1,
          alpha: Math.min(1, display.opacity + 0.45),
        });
      }
    }
    if (display.showLabels && session.start >= visibleFrom && session.start <= visibleTo) {
      const localDate = new Date(session.start);
      const label = `${dateFormatter.format(localDate)}${classificationLabel(session.classification)}`;
      commands.push({
        kind: "text",
        x: clampX(context.xForTime(session.start) + 4),
        y: pane.top + 14,
        text: label,
        color: display.labelColor,
        font: "10px system-ui, sans-serif",
        alpha: Math.min(1, display.opacity + 0.65),
      });
    }
  }
  return { id: `openkline.trading-calendar.${calendar.definition.id}`, zIndex: 8, commands };
}

export function defaultTradingCalendarDisplayOptions(): ResolvedTradingCalendarDisplayOptions {
  return { ...DEFAULT_DISPLAY };
}

export function isTradingCalendarEngine(value: unknown): value is TradingCalendarEngine {
  return value instanceof TradingCalendarEngine;
}

export type { TradingCalendarSnapshot } from "./trading-calendar.js";
