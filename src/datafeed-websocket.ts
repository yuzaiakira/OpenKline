import { CandleStore } from "./core/candle-store.js";
import type { Candle, Datafeed, DatafeedRealtimeStatus, SubscribeBarsArgs, SymbolInfo } from "./types.js";

export interface WebSocketLike {
  readonly readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: (() => void) | null;
  send(data: string): void;
  close(): void;
}

export interface WebSocketMessage {
  symbol: string;
  timeframe: string;
  candle: Candle;
}

export interface WebSocketDatafeedOptions {
  url: string;
  symbols: Readonly<Record<string, SymbolInfo>>;
  historical: Datafeed;
  createSocket?: (url: string) => WebSocketLike;
  createSubscribeMessage?: (args: SubscribeBarsArgs) => unknown;
  parseMessage?: (data: unknown) => WebSocketMessage | null;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  maxReconnectAttempts?: number;
}

/** WebSocket subscription adapter with bounded exponential reconnect backoff. */
export class WebSocketDatafeed implements Datafeed {
  private readonly createSocket: (url: string) => WebSocketLike;
  private readonly initialBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly maxReconnectAttempts: number;

  public constructor(private readonly options: WebSocketDatafeedOptions) {
    this.createSocket = options.createSocket ?? defaultSocketFactory;
    this.initialBackoffMs = options.initialBackoffMs ?? 100;
    this.maxBackoffMs = options.maxBackoffMs ?? 5_000;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 5;
    if (this.initialBackoffMs < 0 || this.maxBackoffMs < this.initialBackoffMs || this.maxReconnectAttempts < 0) {
      throw new RangeError("Invalid WebSocket reconnect settings");
    }
  }

  public resolveSymbol(symbol: string, signal?: AbortSignal): Promise<SymbolInfo> {
    return this.options.historical.resolveSymbol(symbol, signal);
  }

  public getBars(query: Parameters<Datafeed["getBars"]>[0]): ReturnType<Datafeed["getBars"]> {
    return this.options.historical.getBars(query);
  }

  public subscribeBars(args: SubscribeBarsArgs): () => void {
    if (this.options.symbols[args.symbol] === undefined) {
      throw new Error(`Unknown symbol: ${args.symbol}`);
    }
    const subscription = new ManagedSubscription(this.options, this.createSocket, this.initialBackoffMs, this.maxBackoffMs, this.maxReconnectAttempts, args);
    subscription.start();
    return () => subscription.stop();
  }
}

class ManagedSubscription {
  private socket: WebSocketLike | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private stopped = false;
  private readonly candles = new CandleStore();
  private readonly lastByTime = new Map<number, Candle>();

  public constructor(
    private readonly options: WebSocketDatafeedOptions,
    private readonly createSocket: (url: string) => WebSocketLike,
    private readonly initialBackoffMs: number,
    private readonly maxBackoffMs: number,
    private readonly maxReconnectAttempts: number,
    private readonly args: SubscribeBarsArgs,
  ) {}

  public start(): void {
    this.connect();
  }

  public stop(): void {
    this.stopped = true;
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close();
    this.socket = null;
    this.args.onStatus?.("stopped");
  }

  private connect(): void {
    if (this.stopped) return;
    this.args.onStatus?.("connecting");
    try {
      const socket = this.createSocket(this.options.url);
      this.socket = socket;
      socket.onopen = () => {
        const status: DatafeedRealtimeStatus = this.attempts === 0 ? "connected" : "reconnected";
        this.attempts = 0;
        this.args.onStatus?.(status);
        const message = this.options.createSubscribeMessage?.(this.args);
        if (message !== undefined) socket.send(typeof message === "string" ? message : JSON.stringify(message));
      };
      socket.onmessage = (event) => {
        try {
          const parsed = this.options.parseMessage?.(event.data) ?? defaultParseMessage(event.data);
          if (parsed !== null && parsed.symbol === this.args.symbol && parsed.timeframe === this.args.timeframe) {
            this.candles.update(parsed.candle);
            const previous = this.lastByTime.get(parsed.candle.time);
            if (previous !== undefined && sameCandle(previous, parsed.candle)) return;
            this.lastByTime.set(parsed.candle.time, { ...parsed.candle });
            this.args.onBar({ ...parsed.candle });
          }
        } catch (error) {
          this.args.onError?.(error instanceof Error ? error : new Error(String(error)));
        }
      };
      socket.onerror = (event) => {
        this.args.onStatus?.("error");
        this.args.onError?.(new Error(`WebSocket error: ${String(event)}`));
      };
      socket.onclose = () => {
        if (this.stopped) return;
        this.args.onStatus?.("disconnected");
        this.scheduleReconnect();
      };
    } catch (error) {
      this.args.onStatus?.("error");
      this.args.onError?.(error instanceof Error ? error : new Error(String(error)));
      this.args.onStatus?.("disconnected");
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer !== null || this.attempts >= this.maxReconnectAttempts) return;
    const delay = Math.min(this.maxBackoffMs, this.initialBackoffMs * 2 ** this.attempts);
    this.attempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}

function sameCandle(left: Candle, right: Candle): boolean {
  return left.time === right.time
    && left.open === right.open
    && left.high === right.high
    && left.low === right.low
    && left.close === right.close
    && left.volume === right.volume;
}

function defaultSocketFactory(url: string): WebSocketLike {
  const Socket = (globalThis as { WebSocket?: new (url: string) => WebSocketLike }).WebSocket;
  if (Socket === undefined) throw new Error("No WebSocket implementation is available");
  return new Socket(url);
}

function defaultParseMessage(data: unknown): WebSocketMessage | null {
  const payload = typeof data === "string" ? JSON.parse(data) as WebSocketMessage : data as WebSocketMessage;
  if (payload === null || typeof payload !== "object" || !("symbol" in payload) || !("timeframe" in payload) || !("candle" in payload)) return null;
  return payload;
}

