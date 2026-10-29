import { CandleStore } from "../../dist/src/index.js";
import { WebSocketDatafeed } from "../../dist/src/index.js";

const DEFAULT_REST_BASE = "https://api.binance.com";
const DEFAULT_WS_BASE = "wss://stream.binance.com:9443/ws";
const BINANCE_INTERVALS = new Set(["1s", "1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h", "1d", "3d", "1w", "1M"]);

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
  if (!BINANCE_INTERVALS.has(interval)) throw new Error(`Unsupported Binance interval: ${interval}`);
  const info = { symbol: normalizedSymbol, exchange: "BINANCE", currency: normalizedSymbol.endsWith("USDT") ? "USDT" : undefined, timezone: "UTC", pricePrecision: 8 };
  const symbols = { [normalizedSymbol]: info };
  const historical = {
    async resolveSymbol(requested, signal) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      if (requested !== normalizedSymbol) throw new Error(`Unknown Binance symbol: ${requested}`);
      return { ...info };
    },
    async getBars(query) {
      if (query.timeframe !== interval) throw new Error(`Binance adapter is configured for ${interval}, received ${query.timeframe}`);
      if (!Number.isFinite(query.from) || !Number.isFinite(query.to) || query.to < query.from) throw new Error("Binance bar query requires a finite ascending time range");
      const byTime = new Map();
      let startTime = query.from;
      for (let page = 0; page < 100 && startTime < query.to; page += 1) {
        if (query.signal?.aborted) throw abortError();
        const url = new URL("/api/v3/klines", restBaseUrl);
        url.searchParams.set("symbol", normalizedSymbol);
        url.searchParams.set("interval", interval);
        url.searchParams.set("startTime", String(startTime));
        url.searchParams.set("endTime", String(query.to));
        url.searchParams.set("limit", "1000");
        const response = await fetcher(url.href, query.signal === undefined ? {} : { signal: query.signal });
        if (!response.ok) throw new Error(`Binance REST request failed: ${response.status}`);
        const payload = await response.json();
        if (!Array.isArray(payload)) throw new Error("Binance REST response must be an array");
        const pageBars = payload.map(normalizeBinanceKline);
        for (const bar of pageBars) byTime.set(bar.time, bar);
        const last = pageBars.at(-1);
        if (last === undefined || pageBars.length < 1000 || last.time < startTime || last.time >= query.to) break;
        startTime = last.time + 1;
      }
      const store = new CandleStore();
      store.setData([...byTime.values()].sort((left, right) => left.time - right.time));
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

function abortError() {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}
