import { normalizePaperEvent, PaperMarketDataValidationError } from "./rest.js";
import type { PaperRestEventPayload } from "./rest.js";
import type { PaperMarketEvent } from "./types.js";

export interface PaperWebSocketLike {
  readonly readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: (() => void) | null;
  send(data: string): void;
  close(): void;
}

export interface PaperWebSocketScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface PaperWebSocketMarketAdapterOptions {
  readonly url: string;
  readonly symbol: string;
  readonly source?: string;
  readonly createSocket?: (url: string) => PaperWebSocketLike;
  readonly createSubscribeMessage?: (symbol: string) => unknown;
  readonly parseMessage?: (data: unknown) => unknown;
  readonly initialBackoffMs?: number;
  readonly maxBackoffMs?: number;
  readonly maxReconnectAttempts?: number;
  readonly scheduler?: PaperWebSocketScheduler;
}

export type PaperMarketEventListener = (event: PaperMarketEvent) => void;
export type PaperMarketErrorListener = (error: Error) => void;

export interface PaperWebSocketSubscriptionStatus {
  readonly connected: boolean;
  readonly reconnectAttempts: number;
  readonly stopped: boolean;
  readonly diagnostic: string | null;
}

export interface PaperWebSocketSubscription {
  getStatus(): PaperWebSocketSubscriptionStatus;
  stop(): void;
}

const defaultScheduler: PaperWebSocketScheduler = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** WebSocket quote adapter with bounded reconnect and duplicate-event filtering. */
export class PaperWebSocketMarketAdapter {
  private readonly createSocket: (url: string) => PaperWebSocketLike;
  private readonly scheduler: PaperWebSocketScheduler;
  private readonly source: string;
  private readonly initialBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly maxReconnectAttempts: number;
  private disposed = false;

  public constructor(private readonly options: PaperWebSocketMarketAdapterOptions) {
    if (options.symbol.trim().length === 0 || options.url.trim().length === 0) throw new PaperMarketDataValidationError("Paper WebSocket url and symbol are required");
    this.createSocket = options.createSocket ?? defaultSocketFactory;
    this.scheduler = options.scheduler ?? defaultScheduler;
    this.source = options.source ?? "paper-websocket";
    this.initialBackoffMs = options.initialBackoffMs ?? 100;
    this.maxBackoffMs = options.maxBackoffMs ?? 5_000;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 5;
    if (!Number.isFinite(this.initialBackoffMs) || this.initialBackoffMs < 0 || !Number.isFinite(this.maxBackoffMs) || this.maxBackoffMs < this.initialBackoffMs || !Number.isInteger(this.maxReconnectAttempts) || this.maxReconnectAttempts < 0) throw new RangeError("Invalid Paper WebSocket reconnect settings");
  }

  public subscribe(onEvent: PaperMarketEventListener, onError?: PaperMarketErrorListener): PaperWebSocketSubscription {
    if (this.disposed) throw new PaperMarketDataValidationError("Paper WebSocket adapter has been disposed");
    const subscription = new ManagedPaperSubscription(this.options, this.createSocket, this.scheduler, this.source, this.initialBackoffMs, this.maxBackoffMs, this.maxReconnectAttempts, onEvent, onError);
    subscription.start();
    return subscription;
  }

  public dispose(): void {
    this.disposed = true;
  }
}

class ManagedPaperSubscription implements PaperWebSocketSubscription {
  private socket: PaperWebSocketLike | null = null;
  private reconnectTimer: unknown;
  private attempts = 0;
  private stopped = false;
  private connected = false;
  private diagnostic: string | null = null;
  private readonly lastById = new Map<string, PaperMarketEvent>();

  public constructor(
    private readonly options: PaperWebSocketMarketAdapterOptions,
    private readonly createSocket: (url: string) => PaperWebSocketLike,
    private readonly scheduler: PaperWebSocketScheduler,
    private readonly source: string,
    private readonly initialBackoffMs: number,
    private readonly maxBackoffMs: number,
    private readonly maxReconnectAttempts: number,
    private readonly onEvent: PaperMarketEventListener,
    private readonly onError?: PaperMarketErrorListener,
  ) {}

  public getStatus(): PaperWebSocketSubscriptionStatus {
    return { connected: this.connected, reconnectAttempts: this.attempts, stopped: this.stopped, diagnostic: this.diagnostic };
  }

  public start(): void { this.connect(); }

  public stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.connected = false;
    if (this.reconnectTimer !== undefined) this.scheduler.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    const socket = this.socket;
    this.socket = null;
    if (socket !== null) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      socket.close();
    }
  }

  private connect(): void {
    if (this.stopped) return;
    try {
      const socket = this.createSocket(this.options.url);
      this.socket = socket;
      socket.onopen = () => {
        if (this.socket !== socket || this.stopped) return;
        this.connected = true;
        this.attempts = 0;
        this.diagnostic = null;
        const message = this.options.createSubscribeMessage?.(this.options.symbol);
        if (message !== undefined) socket.send(typeof message === "string" ? message : JSON.stringify(message));
      };
      socket.onmessage = (message) => {
        if (this.socket !== socket || this.stopped) return;
        try {
          const raw = this.options.parseMessage?.(message.data) ?? parseDefaultMessage(message.data);
          if (raw === null) return;
          const event = normalizePaperEvent(raw as PaperRestEventPayload, this.source);
          if (event.symbol !== this.options.symbol) return;
          const previous = this.lastById.get(event.id);
          if (previous !== undefined && sameEvent(previous, event)) return;
          this.lastById.set(event.id, event);
          this.onEvent({ ...event });
        } catch (error) {
          this.report(error);
        }
      };
      socket.onerror = (event) => this.report(new Error(`Paper WebSocket error: ${String(event)}`));
      socket.onclose = () => {
        if (this.socket !== socket || this.stopped) return;
        this.socket = null;
        this.connected = false;
        this.diagnostic = "DISCONNECTED";
        this.scheduleReconnect();
      };
    } catch (error) {
      this.report(error);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer !== undefined || this.attempts >= this.maxReconnectAttempts) return;
    const delay = Math.min(this.maxBackoffMs, this.initialBackoffMs * 2 ** this.attempts);
    this.attempts += 1;
    this.reconnectTimer = this.scheduler.setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, delay);
  }

  private report(error: unknown): void {
    const normalized = error instanceof Error ? error : new Error(String(error));
    this.diagnostic = normalized.message;
    this.onError?.(normalized);
  }
}

function normalizeRawMessage(data: unknown): Record<string, unknown> | null {
  const value = typeof data === "string" ? JSON.parse(data) as unknown : data;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseDefaultMessage(data: unknown): PaperMarketEvent | null {
  const value = normalizeRawMessage(data);
  if (value === null || typeof value.id !== "string" || typeof value.symbol !== "string" || (typeof value.time !== "number" && typeof value.time !== "string") || typeof value.price !== "number") return null;
  return { id: value.id, symbol: value.symbol, time: value.time as number, price: value.price, source: typeof value.source === "string" ? value.source : "paper-websocket", quoteStatus: value.quoteStatus === "stale" || value.quoteStatus === "disconnected" ? value.quoteStatus : "fresh", mode: value.mode === "live" || value.mode === "replay" ? value.mode : "simulated", ...(typeof value.sourceSequence === "number" ? { sourceSequence: value.sourceSequence } : {}) };
}

function sameEvent(left: PaperMarketEvent, right: PaperMarketEvent): boolean {
  return left.id === right.id && left.symbol === right.symbol && left.time === right.time && left.price === right.price && left.quoteStatus === right.quoteStatus && left.sourceSequence === right.sourceSequence;
}

function defaultSocketFactory(url: string): PaperWebSocketLike {
  const Socket = (globalThis as { WebSocket?: new (url: string) => PaperWebSocketLike }).WebSocket;
  if (Socket === undefined) throw new Error("No WebSocket implementation is available");
  return new Socket(url);
}
