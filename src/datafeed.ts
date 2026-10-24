import { CandleStore } from "./core/candle-store.js";
import type { Candle, Datafeed, GetBarsQuery, SubscribeBarsArgs, SymbolInfo } from "./types.js";

export class InMemoryDatafeed implements Datafeed {
  private readonly store = new CandleStore();
  private readonly subscribers = new Set<SubscribeBarsArgs>();

  public constructor(
    private readonly symbolInfo: SymbolInfo,
    candles: readonly Candle[] = [],
  ) {
    this.store.setData(candles);
  }

  public async resolveSymbol(symbol: string, signal?: AbortSignal): Promise<SymbolInfo> {
    throwIfAborted(signal);
    if (symbol !== this.symbolInfo.symbol) {
      throw new Error(`Unknown symbol: ${symbol}`);
    }
    return { ...this.symbolInfo };
  }

  public async getBars(query: GetBarsQuery): Promise<readonly Candle[]> {
    throwIfAborted(query.signal);
    if (query.symbol !== this.symbolInfo.symbol) {
      throw new Error(`Unknown symbol: ${query.symbol}`);
    }
    if (!Number.isFinite(query.from) || !Number.isFinite(query.to) || query.to < query.from) {
      throw new Error("Bar query requires a finite ascending time range");
    }
    return this.store.getAll().filter((candle) => candle.time >= query.from && candle.time < query.to);
  }

  public subscribeBars(args: SubscribeBarsArgs): () => void {
    if (args.symbol !== this.symbolInfo.symbol) {
      throw new Error(`Unknown symbol: ${args.symbol}`);
    }
    this.subscribers.add(args);
    return () => this.subscribers.delete(args);
  }

  public pushBar(candle: Candle): void {
    try {
      this.store.update(candle);
      for (const subscriber of this.subscribers) {
        if (subscriber.symbol === this.symbolInfo.symbol) {
          subscriber.onBar({ ...candle });
        }
      }
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      for (const subscriber of this.subscribers) {
        subscriber.onError?.(normalized);
      }
      throw normalized;
    }
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    const error = new Error("The operation was aborted");
    error.name = "AbortError";
    throw error;
  }
}
