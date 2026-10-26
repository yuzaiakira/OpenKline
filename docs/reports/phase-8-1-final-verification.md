# OpenKline Phase 8.1 Final Verification

Date: 2026-10-26  
Branch: `work`  
Scope: Phase 8.1.0 through Phase 8.1.6

## Result

The Phase 8.1 implementation is present and locally verified for its
framework-neutral account, deterministic market source, reference transports,
risk controls, recovery boundary, Studio consumer, and Node benchmark. The
milestone is **not closed**: Firefox, WebKit, Mobile Safari, physical-device,
and formal accessibility gates remain open. No live broker or real-money path
is claimed.

## Implemented and verified

- Versioned `src/paper-trading/` contracts for a single-symbol, long-only,
  non-leveraged virtual spot account.
- Market buy/sell lifecycle with submitted, accepted, pending, filled,
  rejected, and cancelled states. A fill requires a later eligible fresh event.
- Shared commission and adverse-slippage mathematics with the backtest engine.
- Cash, reserved cash, available cash, position basis, realized/unrealized
  P&L, equity, fees, high-water drawdown, order/trade/journal audit, and
  idempotency.
- Duplicate, stale, disconnected, out-of-order, invalid-symbol, and replay
  event isolation.
- Deterministic credential-free market stream with pause/resume, manual step,
  speed, disconnect/reconnect, and disposal.
- Injected REST pagination and WebSocket reference adapters with timestamp
  normalization, validation, bounded retries/backoff, stale-response
  protection, duplicate handling, cancellation, and cleanup.
- Quantity/notional/exposure/session-loss/drawdown/pending-order risk limits
  and a journaled/restorable operator risk halt. Short selling and leverage
  are not supported.
- Versioned JSON serialization/deserialization, accounting integrity checks,
  restored source sequence, pending reserves, halt state, and no-auto-fill
  recovery behavior.
- Public root exports, non-persistent paper markers isolated from strategy
  markers, and a Next.js Studio paper ticket/dashboard/history consumer with
  prominent `SIMULATED · NO REAL MONEY` messaging.
- Deterministic 1k/10k/100k event benchmark with append/order latency and
  post-dispose heap observations.

## Verification commands and results

| Command | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm test` | Pass: 121 tests |
| `npm run benchmark:paper-trading` | Pass: 1k/10k/100k deterministic scenarios |
| `npm run package:check` | Pass: package contents and dry-run tarball |
| `npm run package:smoke` | Pass: installed `openkline-0.1.0.tgz` as an ESM consumer |
| `npm run build --prefix examples/nextjs-app-router` | Pass: Next.js 16.4.3 production build |
| `npm run test:react:browser` | Pass: 13 Chromium tests, including responsive/mobile viewport coverage |

The package smoke test was local and did not publish to npm. No GitHub Actions
were used.

## Browser and device matrix

| Target | Status | Evidence / remaining gate |
| --- | --- | --- |
| Chromium desktop | Verified | 13 Playwright tests pass |
| Chromium narrow viewport | Verified locally | Existing responsive tests and paper Studio flow pass; not a physical device |
| Firefox | Not tested / open | Managed-browser environment gate remains unresolved |
| WebKit | Not tested / open | Managed-browser environment gate remains unresolved |
| Mobile Chrome emulation | Not tested in the Phase 8.1 command | Do not infer from narrow Chromium viewport |
| Mobile Safari emulation | Not tested / open | Managed WebKit gate remains unresolved |
| Physical mobile devices | Not tested / open | No device lab evidence |
| Formal accessibility audit | Not tested / open | Automated labels/status checks are not a complete audit |

## Performance and memory observations

Recorded with Node `v24.19.0`, deterministic UTC clock, `--expose-gc`,
long-only spot, and zero commission/slippage:

| Events | Append median ms | Append p95 ms | Max append ms | Submit p95 ms | Total ms | Retained heap delta MB |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 0.0034 | 0.0117 | 0.5439 | 0.0349 | 9.789 | 0.13 |
| 10,000 | 0.0014 | 0.0035 | 0.7994 | 0.0378 | 38.030 | 0.00 |
| 100,000 | 0.0010 | 0.0027 | 9.1480 | 0.0497 | 258.012 | 0.01 |

These are observations from one local Node run, not FPS, Canvas2D, browser
memory, exchange latency, or production-capacity guarantees. The account
retains processed event ids by design for idempotency and replay safety.
Detailed benchmark notes are in
[`phase-8-1-performance.md`](phase-8-1-performance.md).

## Public API and documentation

The root package exports the account, stream, REST/WebSocket adapters,
persistence helpers, risk types, marker conversion, and lifecycle errors. The
API reference and architecture documents describe the causal fill boundary,
transport contracts, persistence rules, Studio usage, and explicit simulation
limitations. The Studio example intentionally keeps paper state in memory;
durable hosts must call the persistence API rather than assuming workspace
export includes it.

## Acceptance matrix

| Criterion | Status | Evidence / reason |
| --- | --- | --- |
| Framework-independent account | Verified | Typecheck, 121 Node tests |
| Long-only spot/no leverage/no shorts | Verified | Account implementation and risk tests |
| Market-order lifecycle and causal fill | Verified | Paper account tests and Chromium Studio flow |
| P&L/equity/cash/fees/drawdown/audit | Verified | Accounting tests and public snapshots |
| Historical REST pagination | Verified | Deterministic fake-fetch adapter tests |
| Streaming, reconnect, duplicate, cleanup | Verified locally | Deterministic fake-socket tests; no vendor endpoint |
| Invalid/stale/out-of-order/replay isolation | Verified | Node event-order tests |
| Risk controls and kill switch | Verified | Quantity, loss, drawdown, halt tests |
| Versioned persistence/recovery | Verified | JSON round-trip, corruption, reserve, sequence tests |
| No auto-fill on restore/history | Verified | Recovery test requires a later fresh event |
| Studio ticket/dashboard/history/labels | Verified in Chromium | 13 Playwright tests pass |
| Chart-scoped simulated markers | Verified in Chromium | Marker overlay path and Studio flow |
| Multi-chart isolation | Partially verified | Existing Chromium multi-chart suite passes; persistence across active-panel remount is not a release claim |
| 1k/10k/100k benchmark | Observed | Deterministic Node benchmark report |
| Package installation | Verified locally | Tarball smoke consumer passed |
| Firefox/WebKit/Mobile Safari | Open | Browser environment not available/verified |
| Physical devices/accessibility audit | Open | Not tested |
| Live broker/real money | Not implemented | Explicitly out of scope; no claim made |

## Git and release verification

Phase commits were created with `Akira Yuzai <yuzai.akira@gmail.com>` as both
author and committer, using Conventional Commit messages, and each was pushed
immediately to `origin/work` without force-push:

| Milestone | Commit |
| --- | --- |
| 8.1.0 | `a2b7c857329f460b259810f8e3c775329f851c23` |
| 8.1.1 | `bbfb7aa1c3b84f34a65a281ac670a4751465cd9b` |
| 8.1.2 | `03ffd1abdbe88fe3c0f981c0ae61f48e0eca0bb8` |
| 8.1.3 | `c5e6931e4d1921137f61638db2c325f5364a9c74` |
| 8.1.4 | `b18e90e067281d78ca644b07a3c34e73e7a6799c` |
| 8.1.5 | `e94f6871fad27d9f86158f8d580f0f8632e53670` |

The 8.1.6 verification report is the next documentation-only commit. Before
that commit, the working tree is required to be clean and `work` must match
`origin/work`.

## Next-phase readiness assessment

The Phase 8.1 implementation is ready for owner review and for the next
engineering planning step, but not for a claim of broad browser compatibility
or live trading. Phase 2 / subsequent work must keep the open browser and
accessibility gates visible, decide whether paper state should be integrated
into workspace persistence, and add any real vendor integration only behind a
separate reviewed safety boundary. No Phase 3 or live-execution authorization
is implied by this report.

## Phase 8.2.0 follow-up

The Studio now provides explicit `Save account locally` and `Restore account
locally` actions. These actions serialize and restore the validated account
document using the public persistence API, with a key scoped to the chart panel
and symbol. They do not silently restore state, serialize chart workspaces, or
permit concurrent-tab conflict resolution; the example remains a deliberate
single-writer local-storage demonstration. Chromium coverage for the causal
fill, save, restore, and account isolation flow is part of the Phase 8.2
verification increment.

