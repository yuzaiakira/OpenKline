export const OPENKLINE_WATCHLIST_VERSION = 1 as const;

export interface WatchlistSymbol {
  readonly id: string;
  readonly displaySymbol: string;
  readonly name: string;
  readonly exchange?: string;
  readonly assetCategory?: string;
  readonly quoteCurrency?: string;
  readonly favorite: boolean;
}

export interface Watchlist {
  readonly id: string;
  readonly name: string;
  readonly symbols: readonly WatchlistSymbol[];
}

export interface WatchlistDocument {
  readonly version: typeof OPENKLINE_WATCHLIST_VERSION;
  readonly selectedWatchlistId: string | null;
  readonly lists: readonly Watchlist[];
}

export type QuoteStatus = "loading" | "ready" | "stale" | "error";

export interface WatchlistQuote {
  readonly symbolId: string;
  readonly last: number | null;
  readonly change: number | null;
  readonly changePercent: number | null;
  readonly timestamp: number | null;
  readonly status: QuoteStatus;
  readonly error?: string;
  readonly demo: boolean;
}

export interface QuoteProvider {
  subscribe(symbolIds: readonly string[], onUpdate: (quotes: readonly WatchlistQuote[]) => void): () => void;
}

export class WatchlistValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "WatchlistValidationError";
  }
}

export type WatchlistIdFactory = (prefix: "watchlist" | "symbol") => string;

export class WatchlistModel {
  private document: WatchlistDocument;
  private readonly idFactory: WatchlistIdFactory;
  private readonly listeners = new Set<(document: WatchlistDocument) => void>();

  public constructor(document: WatchlistDocument = { version: 1, selectedWatchlistId: null, lists: [] }, idFactory: WatchlistIdFactory = defaultIdFactory) {
    this.document = parseWatchlistDocument(document);
    this.idFactory = idFactory;
  }

  public subscribe(listener: (document: WatchlistDocument) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public getDocument(): WatchlistDocument {
    return parseWatchlistDocument(this.document);
  }

  public create(name: string): Watchlist {
    const trimmed = requireName(name, "Watchlist name");
    const list: Watchlist = { id: this.idFactory("watchlist"), name: trimmed, symbols: [] };
    this.commit({ version: 1, selectedWatchlistId: this.document.selectedWatchlistId ?? list.id, lists: [...this.document.lists, list] });
    return list;
  }

  public rename(id: string, name: string): void {
    const trimmed = requireName(name, "Watchlist name");
    this.requireList(id);
    this.commit({ ...this.document, lists: this.document.lists.map((list) => list.id === id ? { ...list, name: trimmed } : list) });
  }

  public delete(id: string): void {
    this.requireList(id);
    const lists = this.document.lists.filter((list) => list.id !== id);
    const selectedWatchlistId = this.document.selectedWatchlistId === id ? lists[0]?.id ?? null : this.document.selectedWatchlistId;
    this.commit({ version: 1, selectedWatchlistId, lists });
  }

  public select(id: string): void {
    this.requireList(id);
    this.commit({ ...this.document, selectedWatchlistId: id });
  }

  public addSymbol(listId: string, symbol: Omit<WatchlistSymbol, "favorite"> & { favorite?: boolean }): WatchlistSymbol {
    const list = this.requireList(listId);
    if (list.symbols.some((item) => item.id === symbol.id)) throw new WatchlistValidationError(`Duplicate watchlist symbol: ${symbol.id}`);
    const next: WatchlistSymbol = { ...symbol, favorite: symbol.favorite ?? false };
    this.commit({ ...this.document, lists: this.document.lists.map((item) => item.id === listId ? { ...item, symbols: [...item.symbols, next] } : item) });
    return next;
  }

  public removeSymbol(listId: string, symbolId: string): void {
    const list = this.requireList(listId);
    if (!list.symbols.some((symbol) => symbol.id === symbolId)) throw new WatchlistValidationError(`Unknown watchlist symbol: ${symbolId}`);
    this.commit({ ...this.document, lists: this.document.lists.map((item) => item.id === listId ? { ...item, symbols: item.symbols.filter((symbol) => symbol.id !== symbolId) } : item) });
  }

  public reorderSymbol(listId: string, symbolId: string, targetIndex: number): void {
    const list = this.requireList(listId);
    if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= list.symbols.length) throw new WatchlistValidationError("Watchlist target index is out of range");
    const sourceIndex = list.symbols.findIndex((symbol) => symbol.id === symbolId);
    if (sourceIndex < 0) throw new WatchlistValidationError(`Unknown watchlist symbol: ${symbolId}`);
    const symbols = [...list.symbols];
    const [moved] = symbols.splice(sourceIndex, 1);
    if (moved === undefined) throw new WatchlistValidationError(`Unknown watchlist symbol: ${symbolId}`);
    symbols.splice(targetIndex, 0, moved);
    this.commit({ ...this.document, lists: this.document.lists.map((item) => item.id === listId ? { ...item, symbols } : item) });
  }

  public setFavorite(listId: string, symbolId: string, favorite: boolean): void {
    const list = this.requireList(listId);
    if (!list.symbols.some((symbol) => symbol.id === symbolId)) throw new WatchlistValidationError(`Unknown watchlist symbol: ${symbolId}`);
    this.commit({ ...this.document, lists: this.document.lists.map((item) => item.id === listId ? { ...item, symbols: item.symbols.map((symbol) => symbol.id === symbolId ? { ...symbol, favorite } : symbol) } : item) });
  }

  private requireList(id: string): Watchlist {
    const list = this.document.lists.find((item) => item.id === id);
    if (list === undefined) throw new WatchlistValidationError(`Unknown watchlist: ${id}`);
    return list;
  }

  private commit(document: WatchlistDocument): void {
    this.document = parseWatchlistDocument(document);
    for (const listener of this.listeners) listener(this.getDocument());
  }
}

export function parseWatchlistDocument(value: unknown): WatchlistDocument {
  if (!isPlainObject(value) || value.version !== OPENKLINE_WATCHLIST_VERSION || (value.selectedWatchlistId !== null && typeof value.selectedWatchlistId !== "string") || !Array.isArray(value.lists)) {
    throw new WatchlistValidationError("Invalid watchlist document");
  }
  const listIds = new Set<string>();
  const lists = value.lists.map((item) => {
    if (!isPlainObject(item) || typeof item.id !== "string" || item.id.length === 0 || listIds.has(item.id) || typeof item.name !== "string" || item.name.trim().length === 0 || !Array.isArray(item.symbols)) {
      throw new WatchlistValidationError("Invalid watchlist");
    }
    listIds.add(item.id);
    const symbolIds = new Set<string>();
    const symbols = item.symbols.map((raw) => {
      if (!isPlainObject(raw) || typeof raw.id !== "string" || raw.id.length === 0 || symbolIds.has(raw.id) || typeof raw.displaySymbol !== "string" || raw.displaySymbol.trim().length === 0 || typeof raw.name !== "string" || raw.name.trim().length === 0 || (raw.exchange !== undefined && typeof raw.exchange !== "string") || (raw.assetCategory !== undefined && typeof raw.assetCategory !== "string") || (raw.quoteCurrency !== undefined && typeof raw.quoteCurrency !== "string") || typeof raw.favorite !== "boolean") {
        throw new WatchlistValidationError(`Invalid symbol in watchlist ${item.id}`);
      }
      symbolIds.add(raw.id);
      return {
        id: raw.id,
        displaySymbol: raw.displaySymbol,
        name: raw.name,
        ...(raw.exchange === undefined ? {} : { exchange: raw.exchange }),
        ...(raw.assetCategory === undefined ? {} : { assetCategory: raw.assetCategory }),
        ...(raw.quoteCurrency === undefined ? {} : { quoteCurrency: raw.quoteCurrency }),
        favorite: raw.favorite,
      };
    });
    return { id: item.id, name: item.name, symbols };
  });
  if (value.selectedWatchlistId !== null && !listIds.has(value.selectedWatchlistId)) throw new WatchlistValidationError("Selected watchlist does not exist");
  return { version: 1, selectedWatchlistId: value.selectedWatchlistId, lists };
}

export function createDeterministicDemoQuoteProvider(now: () => number = Date.now): QuoteProvider {
  return {
    subscribe(symbolIds, onUpdate) {
      const publish = (): void => onUpdate(symbolIds.map((symbolId) => {
        const seed = [...symbolId].reduce((total, character) => total + character.charCodeAt(0), 0);
        const last = 50 + (seed % 500) + Math.sin(now() / 60_000 + seed) * 2;
        return { symbolId, last, change: Math.sin(seed) * 0.5, changePercent: Math.sin(seed) * 0.5 / last * 100, timestamp: now(), status: "ready", demo: true };
      }));
      publish();
      const timer = globalThis.setInterval(publish, 30_000);
      return () => globalThis.clearInterval(timer);
    },
  };
}

function requireName(value: string, label: string): string {
  if (value.trim().length === 0) throw new WatchlistValidationError(`${label} must not be empty`);
  return value.trim();
}

function defaultIdFactory(prefix: "watchlist" | "symbol"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
