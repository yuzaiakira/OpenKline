import { validateCandle } from "../core/candle-store.js";
import type { Candle } from "../types.js";
import { canonicalInstrumentIdentity } from "./identity.js";
import { createScreenerUniverse } from "./universe.js";
import type {
  ScreenerBar,
  ScreenerHistoryPage,
  ScreenerHistoryRequest,
  ScreenerInstrument,
  ScreenerMarketDataProvider,
  ScreenerUniverse,
} from "./types.js";

export interface DeterministicScreenerOptions {
  readonly symbolCount?: number;
  readonly barsPerInstrument?: number;
  readonly pageSize?: number;
  readonly startTime?: number;
  readonly intervalMs?: number;
}

const DEFAULT_START_TIME = Date.UTC(2025, 0, 1);

/** Creates a credential-free, repeatable universe for tests, examples, and local Studio development. */
export function createDeterministicScreenerUniverse(symbolCount = 8): ScreenerUniverse {
  if (!Number.isInteger(symbolCount) || symbolCount < 1) throw new RangeError("symbolCount must be a positive integer");
  return createScreenerUniverse(Array.from({ length: symbolCount }, (_, index) => ({
    symbol: `DEMO-${String(index + 1).padStart(3, "0")}`,
    provider: "OPENKLINE-DEMO",
    exchange: "DEMO",
    assetClass: "SAMPLE",
    quoteCurrency: "USD",
    instrumentId: `demo-${index + 1}`,
    name: `Deterministic Demo ${index + 1}`,
  })), "demo");
}

export class DeterministicScreenerMarketDataProvider implements ScreenerMarketDataProvider {
  public readonly id = "OPENKLINE-DEMO";
  private readonly options: Required<DeterministicScreenerOptions>;
  private readonly universe: ScreenerUniverse;

  public constructor(options: DeterministicScreenerOptions = {}) {
    this.options = {
      symbolCount: options.symbolCount ?? 8,
      barsPerInstrument: options.barsPerInstrument ?? 240,
      pageSize: options.pageSize ?? 100,
      startTime: options.startTime ?? DEFAULT_START_TIME,
      intervalMs: options.intervalMs ?? 60 * 60 * 1000,
    };
    for (const [name, value] of Object.entries(this.options)) {
      if (!Number.isInteger(value) || value < 1) throw new RangeError(`Deterministic ${name} must be a positive integer`);
    }
    this.universe = createDeterministicScreenerUniverse(this.options.symbolCount);
  }

  public getUniverse(): ScreenerUniverse {
    return { ...this.universe, instruments: this.universe.instruments.map((instrument) => ({ ...instrument })) };
  }

  public async resolveInstrument(instrument: ScreenerInstrument, signal?: AbortSignal): Promise<ScreenerInstrument> {
    throwIfAborted(signal);
    const resolved = this.universe.instruments.find((candidate) => canonicalInstrumentIdentity(candidate) === canonicalInstrumentIdentity(instrument));
    if (resolved === undefined) throw new Error(`Unknown deterministic instrument: ${instrument.symbol}`);
    return { ...resolved };
  }

  public async getHistory(request: ScreenerHistoryRequest): Promise<ScreenerHistoryPage> {
    throwIfAborted(request.signal);
    const instrument = await this.resolveInstrument(request.instrument, request.signal);
    if (request.from !== undefined && (!Number.isFinite(request.from) || request.from < 0)) throw new RangeError("History from must be a finite non-negative timestamp");
    if (request.to !== undefined && (!Number.isFinite(request.to) || request.to < 0)) throw new RangeError("History to must be a finite non-negative timestamp");
    if (request.from !== undefined && request.to !== undefined && request.to < request.from) throw new RangeError("History to must be greater than or equal to from");
    const limit = request.limit ?? this.options.pageSize;
    if (!Number.isInteger(limit) || limit < 1 || limit > this.options.pageSize) throw new RangeError(`History limit must be between 1 and ${this.options.pageSize}`);
    const all = createBars(instrument, this.options);
    const filtered = all.filter((bar) => (request.from === undefined || bar.candle.time >= request.from) && (request.to === undefined || bar.candle.time < request.to));
    const offset = parseCursor(request.cursor);
    const bars = filtered.slice(offset, offset + limit).map(cloneBar);
    const nextOffset = offset + bars.length;
    return {
      bars,
      nextCursor: nextOffset < filtered.length ? String(nextOffset) : null,
      complete: nextOffset >= filtered.length,
    };
  }
}

function createBars(instrument: ScreenerInstrument, options: Required<DeterministicScreenerOptions>): ScreenerBar[] {
  const seed = [...canonicalInstrumentIdentity(instrument)].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  const base = 80 + seed % 180;
  const bars: ScreenerBar[] = [];
  for (let index = 0; index < options.barsPerInstrument; index += 1) {
    const close = base + Math.sin((index + seed) / 11) * 4 + Math.cos(index / 23) * 2 + index * (0.02 + (seed % 5) / 500);
    const open = close - Math.sin(index / 7) * 0.6;
    const high = Math.max(open, close) + 0.8 + (index % 3) * 0.1;
    const low = Math.min(open, close) - 0.8 - (index % 2) * 0.1;
    const candle: Candle = {
      time: options.startTime + index * options.intervalMs,
      open,
      high,
      low,
      close,
      volume: 1_000 + seed * 2 + index * 7 + Math.abs(Math.sin(index / 5)) * 100,
    };
    validateCandle(candle, index);
    bars.push({ candle, finality: "confirmed", revision: 0, source: "OPENKLINE-DEMO", receivedAt: candle.time + options.intervalMs });
  }
  return bars;
}

function parseCursor(cursor: string | undefined): number {
  if (cursor === undefined) return 0;
  if (!/^\d+$/.test(cursor)) throw new Error("Deterministic history cursor must be a non-negative integer");
  const offset = Number(cursor);
  if (!Number.isSafeInteger(offset)) throw new Error("Deterministic history cursor is outside the safe integer range");
  return offset;
}

function cloneBar(bar: ScreenerBar): ScreenerBar {
  return { ...bar, candle: { ...bar.candle } };
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    const error = new Error("The operation was aborted");
    error.name = "AbortError";
    throw error;
  }
}

