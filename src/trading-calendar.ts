import type { TimeframeCalendar } from "./multi-timeframe.js";

/** A local civil date in the calendar's IANA timezone, formatted as YYYY-MM-DD. */
export type TradingDate = string;

export type TradingSessionClassification = "regular" | "holiday-adjusted" | "special" | "early-close" | "late-open";
export type TradingCalendarCoverageStatus = "supported" | "outside-validity" | "unknown";
export type TradingCalendarExceptionKind = "closed" | "modified";
export type LocalTimeDisambiguation = "earlier" | "later" | "reject";

export interface TradingSessionSegmentDefinition {
  readonly id?: string;
  readonly start: string;
  readonly end: string;
  /** Local calendar-day offset from the trading date. Defaults to zero. */
  readonly startDayOffset?: number;
  /** Local calendar-day offset from the trading date. If omitted, an end at or before start rolls to the next day. */
  readonly endDayOffset?: number;
}

export interface TradingSessionTemplate {
  /** JavaScript weekday: Sunday is 0 and Saturday is 6. */
  readonly weekday: number;
  readonly segments: readonly TradingSessionSegmentDefinition[];
  readonly classification?: TradingSessionClassification;
}

export interface TradingCalendarException {
  readonly date: TradingDate;
  readonly kind: TradingCalendarExceptionKind;
  readonly segments?: readonly TradingSessionSegmentDefinition[];
  readonly classification?: TradingSessionClassification;
  readonly label?: string;
}

export interface TradingCalendarValidity {
  /** Inclusive local trading date. */
  readonly from?: TradingDate;
  /** Inclusive local trading date. */
  readonly to?: TradingDate;
}

export interface TradingCalendarDefinition {
  readonly id: string;
  readonly version: string;
  readonly timeZone: string;
  /** The local date assigned to the session's opening schedule. */
  readonly tradingDateConvention?: "local-date" | "session-date";
  readonly weekStartsOn?: number;
  readonly weeklySchedule: readonly TradingSessionTemplate[];
  readonly exceptions?: readonly TradingCalendarException[];
  readonly validity?: TradingCalendarValidity;
  /** Default is reject: hosts must opt into an ambiguous local-clock policy. */
  readonly dstDisambiguation?: LocalTimeDisambiguation;
}

export interface TradingSessionSegment {
  readonly id: string;
  readonly sessionId: string;
  readonly start: number;
  readonly end: number;
}

export interface TradingSessionBreak {
  readonly id: string;
  readonly sessionId: string;
  readonly start: number;
  readonly end: number;
}

export interface TradingSession {
  readonly id: string;
  readonly tradingDate: TradingDate;
  readonly calendarId: string;
  readonly calendarVersion: string;
  readonly timeZone: string;
  readonly start: number;
  readonly end: number;
  readonly segments: readonly TradingSessionSegment[];
  readonly breaks: readonly TradingSessionBreak[];
  readonly classification: TradingSessionClassification;
  readonly label?: string;
  readonly coverage: "supported";
}

export interface TradingCalendarSnapshot {
  readonly calendarId: string;
  readonly version: string;
  readonly timeZone: string;
  readonly tradingDateConvention: "local-date" | "session-date";
  readonly validity: TradingCalendarValidity;
  readonly coverage: TradingCalendarCoverageStatus;
}

export interface TradingCalendarCoverage {
  readonly tradingDate: TradingDate;
  readonly status: TradingCalendarCoverageStatus;
  readonly session: TradingSession | null;
}

export interface TradingCalendarQueryOptions {
  /** Prevent unbounded date enumeration. Defaults to 10,000 sessions/dates. */
  readonly maxSessions?: number;
  /** Prevent unbounded lookback/lookahead when finding a session. Defaults to 370 days. */
  readonly maxDays?: number;
}

export interface TradingCalendarLocalDateTime {
  readonly date: TradingDate;
  readonly time: string;
}

export interface TradingCalendarRegistryEntry {
  readonly id: string;
  readonly version: string;
  readonly timeZone: string;
}

const DEFAULT_MAX_SESSIONS = 10_000;
const DEFAULT_MAX_DAYS = 370;
const DAY_MS = 86_400_000;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;

/**
 * Resolve a local wall-clock value with IANA timezone rules.
 *
 * `reject` is deliberately the default for both ambiguous and nonexistent
 * local times. This prevents a DST transition from silently moving a session.
 */
export function resolveTradingLocalDateTime(
  value: TradingCalendarLocalDateTime,
  timeZone: string,
  disambiguation: LocalTimeDisambiguation = "reject",
): number {
  const date = parseTradingDate(value.date);
  const localTime = parseLocalTime(value.time, false);
  validateTimeZone(timeZone);
  if (disambiguation !== "earlier" && disambiguation !== "later" && disambiguation !== "reject") {
    throw new RangeError(`Unsupported local-time disambiguation: ${disambiguation}`);
  }
  const naive = Date.UTC(date.year, date.month - 1, date.day + localTime.dayOffset, localTime.hour, localTime.minute, localTime.second, localTime.millisecond);
  const offsets = new Set<number>();
  // Offsets are sampled around the candidate. The range is intentionally
  // bounded and covers modern IANA DST and date-line transitions.
  for (let hours = -72; hours <= 72; hours += 1) {
    const candidate = naive + hours * 3_600_000;
    const parts = formatParts(candidate, timeZone);
    const localNaive = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, parts.millisecond);
    // `localNaive - candidate` is the signed local-minus-UTC offset. The
    // corresponding UTC instant is therefore `naive - offset`.
    offsets.add(localNaive - candidate);
  }
  const matches = [...offsets]
    .map((offset) => naive - offset)
    .filter((candidate) => sameLocalParts(formatParts(candidate, timeZone), date, localTime));
  const unique = [...new Set(matches)].sort((left, right) => left - right);
  if (unique.length === 0) {
    throw new RangeError(`Nonexistent local time ${value.date}T${value.time} in ${timeZone}`);
  }
  if (unique.length > 1 && disambiguation === "reject") {
    throw new RangeError(`Ambiguous local time ${value.date}T${value.time} in ${timeZone}`);
  }
  return disambiguation === "later" ? unique.at(-1)! : unique[0]!;
}

/** Return the local calendar date for a UTC timestamp in an IANA timezone. */
export function tradingDateForTimestamp(timestamp: number, timeZone: string): TradingDate {
  if (!Number.isFinite(timestamp)) throw new RangeError("Timestamp must be finite");
  validateTimeZone(timeZone);
  const parts = formatParts(timestamp, timeZone);
  return formatTradingDate(parts.year, parts.month, parts.day);
}

export class TradingCalendarEngine implements TimeframeCalendar {
  public readonly id: string;
  public readonly version: string;
  public readonly definition: TradingCalendarDefinition;
  private readonly templates = new Map<number, TradingSessionTemplate>();
  private readonly exceptions = new Map<TradingDate, TradingCalendarException>();
  private readonly snapshotValue: TradingCalendarSnapshot;

  public constructor(definition: TradingCalendarDefinition) {
    validateCalendarDefinition(definition);
    this.id = definition.id;
    this.version = definition.version;
    this.definition = cloneDefinition(definition);
    for (const template of definition.weeklySchedule) this.templates.set(template.weekday, cloneTemplate(template));
    for (const exception of definition.exceptions ?? []) this.exceptions.set(exception.date, cloneException(exception));
    this.snapshotValue = {
      calendarId: definition.id,
      version: definition.version,
      timeZone: definition.timeZone,
      tradingDateConvention: definition.tradingDateConvention ?? "local-date",
      validity: { ...(definition.validity ?? {}) },
      coverage: "supported",
    };
  }

  public get timeZone(): string {
    return this.definition.timeZone;
  }

  public snapshot(): TradingCalendarSnapshot {
    return {
      ...this.snapshotValue,
      validity: { ...this.snapshotValue.validity },
    };
  }

  public resolveSession(tradingDate: TradingDate): TradingSession | null {
    parseTradingDate(tradingDate);
    if (!this.isDateInValidity(tradingDate)) return null;
    const exception = this.exceptions.get(tradingDate);
    if (exception?.kind === "closed") return null;
    const weekday = dayOfTradingDate(tradingDate);
    const template = exception?.segments === undefined ? this.templates.get(weekday) : undefined;
    const segments = exception?.segments ?? template?.segments;
    if (segments === undefined || segments.length === 0) return null;
    const sessionId = `${this.id}@${this.version}:${tradingDate}`;
    const resolvedSegments = segments.map((segment, index) => this.resolveSegment(sessionId, tradingDate, segment, index));
    resolvedSegments.sort((left, right) => left.start - right.start);
    for (let index = 1; index < resolvedSegments.length; index += 1) {
      const previous = resolvedSegments[index - 1]!;
      const current = resolvedSegments[index]!;
      if (current.start < previous.end) throw new RangeError(`Overlapping trading session segments on ${tradingDate}`);
    }
    const start = resolvedSegments[0]!.start;
    const end = resolvedSegments.at(-1)!.end;
    if (!(start < end)) throw new RangeError(`Trading session must have a positive interval on ${tradingDate}`);
    const breaks = resolvedSegments.slice(1).map((segment, index) => {
      const previous = resolvedSegments[index]!;
      return {
        id: `${sessionId}:break-${index + 1}`,
        sessionId,
        start: previous.end,
        end: segment.start,
      };
    }).filter((value) => value.start < value.end);
    const classification = exception?.classification ?? template?.classification ?? (exception === undefined ? "regular" : "holiday-adjusted");
    return {
      id: sessionId,
      tradingDate,
      calendarId: this.id,
      calendarVersion: this.version,
      timeZone: this.timeZone,
      start,
      end,
      segments: resolvedSegments,
      breaks,
      classification,
      ...(exception?.label === undefined ? {} : { label: exception.label }),
      coverage: "supported",
    };
  }

  public coverageForDate(tradingDate: TradingDate): TradingCalendarCoverage {
    parseTradingDate(tradingDate);
    if (!this.isDateInValidity(tradingDate)) return { tradingDate, status: "outside-validity", session: null };
    return { tradingDate, status: "supported", session: this.resolveSession(tradingDate) };
  }

  public findSessionContaining(timestamp: number): TradingSession | null {
    if (!Number.isFinite(timestamp)) throw new RangeError("Timestamp must be finite");
    const localDate = tradingDateForTimestamp(timestamp, this.timeZone);
    for (const candidate of [localDate, addTradingDays(localDate, -1), addTradingDays(localDate, 1)]) {
      const session = this.resolveSession(candidate);
      if (session !== null && timestamp >= session.start && timestamp < session.end) return session;
    }
    return null;
  }

  public findSegmentContaining(timestamp: number): { readonly session: TradingSession; readonly segment: TradingSessionSegment } | null {
    const session = this.findSessionContaining(timestamp);
    if (session === null) return null;
    const segment = session.segments.find((item) => timestamp >= item.start && timestamp < item.end);
    return segment === undefined ? null : { session, segment };
  }

  public enumerateSessions(from: number, to: number, options: TradingCalendarQueryOptions = {}): readonly TradingSession[] {
    if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) throw new RangeError("Session enumeration requires a finite ascending range");
    const maxSessions = positiveLimit(options.maxSessions, DEFAULT_MAX_SESSIONS, "maxSessions");
    const startDate = addTradingDays(tradingDateForTimestamp(from, this.timeZone), -1);
    const endDate = addTradingDays(tradingDateForTimestamp(to, this.timeZone), 1);
    const days = differenceInTradingDays(startDate, endDate);
    if (days > maxSessions * 8) throw new RangeError("Session enumeration range exceeds its bounded limit");
    const sessions: TradingSession[] = [];
    let date = startDate;
    for (let index = 0; index <= days; index += 1) {
      const session = this.resolveSession(date);
      if (session !== null && session.end > from && session.start < to) {
        sessions.push(session);
        if (sessions.length > maxSessions) throw new RangeError("Session enumeration exceeded maxSessions");
      }
      date = addTradingDays(date, 1);
    }
    return sessions;
  }

  public findPreviousCompletedSession(asOfTime: number, options: TradingCalendarQueryOptions = {}): TradingSession | null {
    if (!Number.isFinite(asOfTime)) throw new RangeError("asOfTime must be finite");
    const maxDays = positiveLimit(options.maxDays, DEFAULT_MAX_DAYS, "maxDays");
    let date = tradingDateForTimestamp(asOfTime, this.timeZone);
    for (let index = 0; index <= maxDays; index += 1) {
      const session = this.resolveSession(date);
      if (session !== null && session.end <= asOfTime) return session;
      date = addTradingDays(date, -1);
    }
    return null;
  }

  public findNextScheduledSession(afterTime: number, options: TradingCalendarQueryOptions = {}): TradingSession | null {
    if (!Number.isFinite(afterTime)) throw new RangeError("afterTime must be finite");
    const maxDays = positiveLimit(options.maxDays, DEFAULT_MAX_DAYS, "maxDays");
    let date = tradingDateForTimestamp(afterTime, this.timeZone);
    for (let index = 0; index <= maxDays; index += 1) {
      const session = this.resolveSession(date);
      if (session !== null && session.start > afterTime) return session;
      date = addTradingDays(date, 1);
    }
    return null;
  }

  /** Whether a source candle interval is wholly contained in one open segment. */
  public isExpectedSourceInterval(time: number, durationMs: number): boolean {
    if (!Number.isFinite(time) || !Number.isFinite(durationMs) || durationMs <= 0) return false;
    const match = this.findSegmentContaining(time);
    return match !== null && time + durationMs <= match.segment.end;
  }

  /** TimeframeCalendar compatibility adapter; callers with duration should use isExpectedSourceInterval. */
  public isExpectedSourceTime(time: number): boolean {
    return this.findSegmentContaining(time) !== null;
  }

  public getSessionBoundaries(tradingDate: TradingDate): { readonly start: number; readonly end: number } | null {
    const session = this.resolveSession(tradingDate);
    return session === null ? null : { start: session.start, end: session.end };
  }

  private resolveSegment(sessionId: string, tradingDate: TradingDate, definition: TradingSessionSegmentDefinition, index: number): TradingSessionSegment {
    const startTime = parseLocalTime(definition.start, false);
    const endTime = parseLocalTime(definition.end, true);
    const startDayOffset = definition.startDayOffset ?? 0;
    let endDayOffset = definition.endDayOffset;
    if (endDayOffset === undefined) endDayOffset = endTime.dayOffset + (endTime.totalMinutes <= startTime.totalMinutes ? 1 : 0);
    else endDayOffset += endTime.dayOffset;
    if (!Number.isInteger(startDayOffset) || startDayOffset < 0 || startDayOffset > 7 || !Number.isInteger(endDayOffset) || endDayOffset < startDayOffset || endDayOffset > 8) {
      throw new RangeError(`Invalid session day offsets on ${tradingDate}`);
    }
    const startDate = addTradingDays(tradingDate, startDayOffset);
    const endDate = addTradingDays(tradingDate, endDayOffset);
    const policy = this.definition.dstDisambiguation ?? "reject";
    const start = resolveTradingLocalDateTime({ date: startDate, time: formatLocalTime(startTime) }, this.timeZone, policy);
    const end = resolveTradingLocalDateTime({ date: endDate, time: formatLocalTime(endTime) }, this.timeZone, policy);
    if (!(start < end)) throw new RangeError(`Trading session segment must end after it starts on ${tradingDate}`);
    return { id: `${sessionId}:segment-${definition.id ?? index + 1}`, sessionId, start, end };
  }

  private isDateInValidity(date: TradingDate): boolean {
    const validity = this.definition.validity;
    return (validity?.from === undefined || date >= validity.from) && (validity?.to === undefined || date <= validity.to);
  }
}

export class TradingCalendarRegistry {
  private readonly calendars = new Map<string, TradingCalendarEngine>();

  public register(definition: TradingCalendarDefinition | TradingCalendarEngine): TradingCalendarEngine {
    const engine = definition instanceof TradingCalendarEngine ? definition : new TradingCalendarEngine(definition);
    const key = registryKey(engine.id, engine.version);
    if (this.calendars.has(key)) throw new Error(`Trading calendar already registered: ${engine.id}@${engine.version}`);
    this.calendars.set(key, engine);
    return engine;
  }

  public unregister(id: string, version: string): boolean {
    return this.calendars.delete(registryKey(id, version));
  }

  public get(id: string, version?: string): TradingCalendarEngine | undefined {
    if (version !== undefined) return this.calendars.get(registryKey(id, version));
    const matches = [...this.calendars.values()].filter((calendar) => calendar.id === id);
    matches.sort((left, right) => left.version.localeCompare(right.version));
    return matches.at(-1);
  }

  public list(): readonly TradingCalendarRegistryEntry[] {
    return [...this.calendars.values()]
      .map((calendar) => ({ id: calendar.id, version: calendar.version, timeZone: calendar.timeZone }))
      .sort((left, right) => `${left.id}@${left.version}`.localeCompare(`${right.id}@${right.version}`));
  }
}

/** Adapt a resolved calendar to the Phase 10 expected-slot contract. */
export function toTimeframeCalendar(calendar: TradingCalendarEngine): TimeframeCalendar & { readonly isExpectedSourceInterval: (time: number, durationMs: number) => boolean } {
  return {
    id: `${calendar.id}@${calendar.version}`,
    isExpectedSourceTime: (time) => calendar.isExpectedSourceTime(time),
    isExpectedSourceInterval: (time, durationMs) => calendar.isExpectedSourceInterval(time, durationMs),
  };
}

/** Clearly illustrative, offline weekday schedule for tests and Studio demos. */
export function createIllustrativeWeekdayCalendar(): TradingCalendarDefinition {
  return {
    id: "illustrative-weekday-market",
    version: "2026.1-demo",
    timeZone: "America/New_York",
    tradingDateConvention: "local-date",
    dstDisambiguation: "reject",
    weeklySchedule: [1, 2, 3, 4, 5].map((weekday) => ({
      weekday,
      segments: [{ start: "09:30", end: "16:00" }],
      classification: "regular",
    })),
    exceptions: [
      { date: "2026-01-01", kind: "closed", label: "Illustrative full-day closure" },
      { date: "2026-11-27", kind: "modified", classification: "early-close", label: "Illustrative early close", segments: [{ start: "09:30", end: "13:00" }] },
    ],
  };
}

function validateCalendarDefinition(definition: TradingCalendarDefinition): void {
  if (!isIdentifier(definition.id) || definition.version.trim().length === 0) throw new RangeError("Trading calendar id and version are required");
  validateTimeZone(definition.timeZone);
  const weekdays = new Set<number>();
  for (const template of definition.weeklySchedule) {
    if (!Number.isInteger(template.weekday) || template.weekday < 0 || template.weekday > 6 || weekdays.has(template.weekday)) throw new RangeError("Trading calendar weekdays must be unique integers from 0 to 6");
    weekdays.add(template.weekday);
    validateSegmentDefinitions(template.segments);
  }
  if (definition.weekStartsOn !== undefined && (!Number.isInteger(definition.weekStartsOn) || definition.weekStartsOn < 0 || definition.weekStartsOn > 6)) throw new RangeError("weekStartsOn must be a weekday from 0 to 6");
  validateValidity(definition.validity);
  const dates = new Set<string>();
  for (const exception of definition.exceptions ?? []) {
    parseTradingDate(exception.date);
    if (dates.has(exception.date)) throw new RangeError(`Duplicate trading calendar exception: ${exception.date}`);
    dates.add(exception.date);
    if (exception.kind === "modified") {
      if (exception.segments === undefined || exception.segments.length === 0) throw new RangeError(`Modified exception requires segments: ${exception.date}`);
      validateSegmentDefinitions(exception.segments);
    } else if (exception.kind !== "closed" || exception.segments !== undefined) {
      throw new RangeError(`Closed exception cannot contain segments: ${exception.date}`);
    }
  }
}

function validateSegmentDefinitions(segments: readonly TradingSessionSegmentDefinition[]): void {
  if (segments.length === 0) throw new RangeError("A trading session must contain at least one segment");
  const ids = new Set<string>();
  for (const segment of segments) {
    if (segment.id !== undefined && (!isIdentifier(segment.id) || ids.has(segment.id))) throw new RangeError("Trading session segment ids must be unique identifiers");
    if (segment.id !== undefined) ids.add(segment.id);
    parseLocalTime(segment.start, false);
    parseLocalTime(segment.end, true);
  }
}

function validateValidity(validity: TradingCalendarValidity | undefined): void {
  if (validity === undefined) return;
  if (validity.from !== undefined) parseTradingDate(validity.from);
  if (validity.to !== undefined) parseTradingDate(validity.to);
  if (validity.from !== undefined && validity.to !== undefined && validity.from > validity.to) throw new RangeError("Trading calendar validity range is inverted");
}

function parseTradingDate(value: string): { readonly year: number; readonly month: number; readonly day: number } {
  const match = DATE_PATTERN.exec(value);
  if (match === null) throw new RangeError(`Invalid trading date: ${value}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new RangeError(`Invalid trading date: ${value}`);
  return { year, month, day };
}

function parseLocalTime(value: string, allow24: boolean): { readonly hour: number; readonly minute: number; readonly second: number; readonly millisecond: number; readonly totalMinutes: number; readonly dayOffset: number } {
  const match = TIME_PATTERN.exec(value);
  if (match === null) throw new RangeError(`Invalid local session time: ${value}`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  const millisecond = Number((match[4] ?? "").padEnd(3, "0") || 0);
  if (minute > 59 || second > 59 || millisecond > 999 || hour > (allow24 ? 24 : 23) || (hour === 24 && (minute !== 0 || second !== 0 || millisecond !== 0))) throw new RangeError(`Invalid local session time: ${value}`);
  return { hour: hour === 24 ? 0 : hour, minute, second, millisecond, totalMinutes: hour * 60 + minute, dayOffset: hour === 24 ? 1 : 0 };
}

function formatLocalTime(value: { readonly hour: number; readonly minute: number; readonly second: number; readonly millisecond: number }): string {
  const two = (number: number): string => String(number).padStart(2, "0");
  const three = (number: number): string => String(number).padStart(3, "0");
  return `${two(value.hour)}:${two(value.minute)}:${two(value.second)}.${three(value.millisecond)}`;
}

function formatTradingDate(year: number, month: number, day: number): TradingDate {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addTradingDays(date: TradingDate, days: number): TradingDate {
  const parsed = parseTradingDate(date);
  const value = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days));
  return formatTradingDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
}

function differenceInTradingDays(from: TradingDate, to: TradingDate): number {
  const left = parseTradingDate(from);
  const right = parseTradingDate(to);
  return Math.round((Date.UTC(right.year, right.month - 1, right.day) - Date.UTC(left.year, left.month - 1, left.day)) / DAY_MS);
}

function dayOfTradingDate(date: TradingDate): number {
  const parsed = parseTradingDate(date);
  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).getUTCDay();
}

function validateTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
  } catch {
    throw new RangeError(`Invalid IANA timezone: ${timeZone}`);
  }
}

function formatParts(timestamp: number, timeZone: string): { year: number; month: number; day: number; hour: number; minute: number; second: number; millisecond: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(timestamp)).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    millisecond: new Date(timestamp).getUTCMilliseconds(),
  };
}

function sameLocalParts(parts: ReturnType<typeof formatParts>, date: { readonly year: number; readonly month: number; readonly day: number }, time: { readonly hour: number; readonly minute: number; readonly second: number; readonly millisecond: number; readonly dayOffset: number }): boolean {
  const expected = new Date(Date.UTC(date.year, date.month - 1, date.day + time.dayOffset));
  return parts.year === expected.getUTCFullYear()
    && parts.month === expected.getUTCMonth() + 1
    && parts.day === expected.getUTCDate()
    && parts.hour === time.hour
    && parts.minute === time.minute
    && parts.second === time.second
    && parts.millisecond === time.millisecond;
}

function positiveLimit(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${name} must be a positive safe integer`);
  return value;
}

function isIdentifier(value: string): boolean {
  return /^[a-z][a-z0-9._-]*$/i.test(value) && value.length <= 128;
}

function registryKey(id: string, version: string): string {
  return `${id}\u0000${version}`;
}

function cloneDefinition(definition: TradingCalendarDefinition): TradingCalendarDefinition {
  return {
    ...definition,
    weeklySchedule: definition.weeklySchedule.map(cloneTemplate),
    ...(definition.exceptions === undefined ? {} : { exceptions: definition.exceptions.map(cloneException) }),
    ...(definition.validity === undefined ? {} : { validity: { ...definition.validity } }),
  };
}

function cloneTemplate(template: TradingSessionTemplate): TradingSessionTemplate {
  return { ...template, segments: template.segments.map((segment) => ({ ...segment })) };
}

function cloneException(exception: TradingCalendarException): TradingCalendarException {
  return { ...exception, ...(exception.segments === undefined ? {} : { segments: exception.segments.map((segment) => ({ ...segment })) }) };
}
