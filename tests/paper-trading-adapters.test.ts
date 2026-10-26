import assert from "node:assert/strict";
import test from "node:test";
import {
  PaperMarketDataStaleResponseError,
  PaperRestMarketAdapter,
  PaperWebSocketMarketAdapter,
  type PaperWebSocketLike,
  type PaperWebSocketScheduler,
} from "../src/index.js";

test("PaperRestMarketAdapter paginates, normalizes, filters, and last-writes duplicate ids", async () => {
  const pages = [
    { events: [{ id: "e-1", symbol: "BTCUSD", time: 1_700_000_000, price: 100 }], next: "page-2" },
    { events: [{ id: "e-1", symbol: "BTCUSD", time: 1_700_000_000_000, price: 101 }, { id: "e-2", symbol: "BTCUSD", time: 1_700_000_001_000, price: 102 }], next: null },
  ];
  const requests: string[] = [];
  let page = 0;
  const adapter = new PaperRestMarketAdapter({
    baseUrl: "https://paper.example.test",
    fetcher: async (input) => {
      requests.push(input);
      return new Response(JSON.stringify(pages[page++] ?? { events: [], next: null }), { status: 200 });
    },
  });
  const events = await adapter.loadHistory({ symbol: "BTCUSD", from: 1_700_000_000_000, to: 1_700_000_002_000 });
  assert.deepEqual(events.map((event) => [event.id, event.time, event.price]), [["e-1", 1_700_000_000_000, 101], ["e-2", 1_700_000_001_000, 102]]);
  assert.equal(requests.length, 2);
  assert.match(requests[1] ?? "", /cursor=page-2/);
});

test("PaperRestMarketAdapter marks an ignored late response stale", async () => {
  let resolveFirst: ((response: Response) => void) | undefined;
  let resolveSecond: ((response: Response) => void) | undefined;
  let calls = 0;
  const adapter = new PaperRestMarketAdapter({
    baseUrl: "https://paper.example.test",
    fetcher: async () => new Promise<Response>((resolve) => {
      if (calls++ === 0) resolveFirst = resolve;
      else resolveSecond = resolve;
    }),
  });
  const first = adapter.loadHistory({ symbol: "BTCUSD" });
  const second = adapter.loadHistory({ symbol: "BTCUSD" });
  resolveSecond?.(new Response(JSON.stringify({ events: [], next: null }), { status: 200 }));
  resolveFirst?.(new Response(JSON.stringify({ events: [{ id: "late", symbol: "BTCUSD", time: 1, price: 1 }], next: null }), { status: 200 }));
  await second;
  await assert.rejects(first, PaperMarketDataStaleResponseError);
});

test("PaperWebSocketMarketAdapter reconnects with bounded scheduling and cleans up", () => {
  const sockets: FakeSocket[] = [];
  const timers: Array<() => void> = [];
  const scheduler: PaperWebSocketScheduler = { setTimeout: (callback) => { timers.push(callback); return callback; }, clearTimeout: (handle) => { const index = timers.indexOf(handle as () => void); if (index >= 0) timers.splice(index, 1); } };
  const received: number[] = [];
  const errors: Error[] = [];
  const adapter = new PaperWebSocketMarketAdapter({
    url: "wss://paper.example.test",
    symbol: "BTCUSD",
    initialBackoffMs: 10,
    maxBackoffMs: 20,
    maxReconnectAttempts: 2,
    scheduler,
    createSocket: () => { const socket = new FakeSocket(); sockets.push(socket); return socket; },
    createSubscribeMessage: (symbol) => ({ subscribe: symbol }),
  });
  const subscription = adapter.subscribe((event) => received.push(event.price), (error) => errors.push(error));
  sockets[0]!.open();
  assert.deepEqual(sockets[0]!.sent, [JSON.stringify({ subscribe: "BTCUSD" })]);
  const event = JSON.stringify({ id: "q-1", symbol: "BTCUSD", time: 1_700_000_000_000, price: 100 });
  sockets[0]!.message(event);
  sockets[0]!.message(event);
  sockets[0]!.message(JSON.stringify({ id: "q-1", symbol: "BTCUSD", time: 1_700_000_000_000, price: 101 }));
  sockets[0]!.close();
  assert.equal(subscription.getStatus().connected, false);
  timers.shift()?.();
  sockets[1]!.open();
  sockets[1]!.message(JSON.stringify({ id: "q-2", symbol: "BTCUSD", time: 1_700_000_001_000, price: 102 }));
  assert.deepEqual(received, [100, 101, 102]);
  assert.equal(errors.length, 0);
  subscription.stop();
  assert.equal(subscription.getStatus().stopped, true);
  assert.equal(sockets[1]!.closeCount, 1);
});

class FakeSocket implements PaperWebSocketLike {
  public readonly readyState = 0;
  public onopen: (() => void) | null = null;
  public onmessage: ((event: { data: unknown }) => void) | null = null;
  public onerror: ((event: unknown) => void) | null = null;
  public onclose: (() => void) | null = null;
  public readonly sent: string[] = [];
  public closeCount = 0;

  public send(data: string): void { this.sent.push(data); }
  public close(): void { this.closeCount += 1; this.onclose?.(); }
  public open(): void { this.onopen?.(); }
  public message(data: unknown): void { this.onmessage?.({ data }); }
}
