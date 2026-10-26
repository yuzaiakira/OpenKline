import { CandleStore } from "../../dist/src/index.js";
import { WebSocketDatafeed } from "../../dist/src/index.js";

const DEFAULT_REST_BASE = "https://api.binance.com";
const DEFAULT_WS_BASE = "wss://stream.binance.com:9443/ws";

/** Normalize one Binance REST kline array without exposing Binance to the core package. */
export function normalizeBinanceKline(value) {
  if (!Array.isArray(value) || value.length < 6) throw new Error("Binance kline must be an array with six values");
  const [time, open, high, low, close, volume] = value;
  const candle = { time: Number(time), open: Number(open), high: Number(high), low: Number(low), close: Number(close), volume: Number(volume) };
  const store = new CandleStore();
  store.setData([candle]);
  return store.getAll()[0];
}

/** Create an opt-in public Binance adapter for the standalone example only. */
export function createBinanceDatafeed({ symbol = "BTCUSDT", interval = "1m", restBaseUrl = DEFAULT_REST_BASE, wsBaseUrl = DEFAULT_WS_BASE, fetcher = fetch, createSocket } = {}) {
  const normalizedSymbol = symbol.toUpperCase();
  const info = { symbol: normalizedSymbol, exchange: "BINANCE", currency: normalizedSymbol.endsWith("USDT") ? "USDT" : undefined, timezone: "UTC", pricePrecision: 8 };
  const symbols = { [normalizedSymbol]: info };
  const historical = {
    async resolveSymbol(requested, signal) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      if (requested !== normalizedSymbol) throw new Error(`Unknown Binance symbol: ${requested}`);
      return { ...info };
    },
    async getBars(query) {
      const url = new URL("/api/v3/klines", restBaseUrl);
      url.searchParams.set("symbol", normalizedSymbol);
      url.searchParams.set("interval", interval);
      url.searchParams.set("startTime", String(query.from));
      url.searchParams.set("endTime", String(query.to));
      url.searchParams.set("limit", "1000");
      const response = await fetcher(url.href, query.signal === undefined ? {} : { signal: query.signal });
      if (!response.ok) throw new Error(`Binance REST request failed: ${response.status}`);
      const payload = await response.json();
      if (!Array.isArray(payload)) throw new Error("Binance REST response must be an array");
      const store = new CandleStore();
      store.setData(payload.map(normalizeBinanceKline));
      return store.getAll().filter((candle) => candle.time >= query.from && candle.time < query.to);
    },
  };
  return new WebSocketDatafeed({
    url: `${wsBaseUrl.replace(/\/$/, "")}/${normalizedSymbol.toLowerCase()}@kline_${interval}`,
    symbols,
    historical,
    ...(createSocket === undefined ? {} : { createSocket }),
    createSubscribeMessage: () => ({ method: "SUBSCRIBE", params: [`${normalizedSymbol.toLowerCase()}@kline_${interval}`], id: 1 }),
    parseMessage: (data) => {
      const payload = typeof data === "string" ? JSON.parse(data) : data;
      const kline = payload?.k;
      if (kline === undefined || payload?.s !== normalizedSymbol) return null;
      return { symbol: normalizedSymbol, timeframe: interval, candle: { time: Number(kline.t), open: Number(kline.o), high: Number(kline.h), low: Number(kline.l), close: Number(kline.c), volume: Number(kline.v) } };
    },
  });
}
