# OpenKline Phase 8.0 Verification

Date: 2026-10-26  
Branch: `work`  
Latest verified commit: `7adad590aefce7a0955326c9121f5da84601ce98`  
Commit identity: `Akira Yuzai <yuzai.akira@gmail.com>`

## Gate conclusion

The Phase 8.0 strategy/backtesting implementation and Studio integration are
implemented and locally verified for the available Node.js and Chromium
environments. The formal milestone remains open. Inherited Firefox, WebKit,
Mobile Safari, and formal accessibility gates are not satisfied, and a
dedicated Strategy Worker has not been implemented. The synchronous reference
engine's defensive historical-prefix design also has a measured 100k-bar
latency cost that remains technical debt.

No live trading, broker execution, portfolio-wide multi-asset simulation,
profitability guarantee, npm publication, release tag, GitHub release, or
GitHub Actions workflow was created.

## Implemented capabilities

- Versioned, validated `StrategyRegistry` with isolated evaluator instances,
  causal historical prefixes, deterministic signal IDs, progress, cancellation,
  and disposal.
- Built-in EMA crossover, RSI reversal, Donchian breakout, and EMA trend
  strategies backed by the existing Indicator Engine.
- Deterministic single-symbol backtesting with completed-bar signals,
  next-bar-open market fills, submitted/pending/filled/rejected/cancelled order
  states, long positions, explicitly enabled short limits, explicit reversal
  policy, fixed quantity/notional/equity sizing, commission, slippage, cash,
  equity, open-position mark-to-market, and no fabricated final-bar fills.
- Independently calculated metrics, drawdown/equity snapshots, deterministic
  input fingerprints, JSON result export, and CSV completed-trade export.
- Non-persistent signal/fill markers through the existing Chart overlay path;
  markers are replay-aware and do not enter workspace series or drawing data.
- A functional chart-scoped Studio Strategy Tester using the public APIs. It
  provides strategy selection and descriptions, parameter/cost/capital/sizing
  controls, running/cancel state, validation feedback, generated metrics,
  trade history, equity/drawdown visualization, settings and diagnostics tabs,
  JSON/CSV export, marker visibility, responsive layout, and per-panel result
  isolation.
- A deterministic `benchmark:strategies` command covering 1k/10k/100k bars,
  two strategies, repeated runs, deterministic exports, cancellation, result
  sizes, and post-disposal heap observations.

## Verification results

All commands below were run locally on 2026-10-26 unless noted otherwise.

| Check | Result | Evidence |
| --- | --- | --- |
| TypeScript typecheck | Pass | `npm run typecheck` |
| Node unit/integration suite | Pass | `npm test`: 102 passed, 0 failed |
| Core Chromium browser suite | Pass | `npm run test:browser`: 8 passed |
| React/Studio Chromium suite | Pass | `npm run test:react:browser`: 11 passed |
| Mobile Chrome emulation | Pass | `npx playwright test --project=mobile-chrome`: 8 passed |
| Next.js production build | Pass | Next.js 16.4.3 `next build --webpack` |
| Package dry-run | Pass | `npm run package:check`; 254 package files, no publication |
| Installed-package ESM smoke | Pass | `npm run package:smoke` |
| Core Node benchmark | Pass | 1k/10k/100k model benchmark |
| Canvas2D benchmark | Pass | 1k/10k/100k in headless Chromium 154 |
| Multi-chart Studio benchmark | Pass | 1/2/2/4 layouts; cleanup canvas count 0 |
| Strategy benchmark | Pass | `npm run benchmark:strategies`; results below |
| Git verification | Pass | commit identity and remote SHA match |

The core Chromium browser test reported no page errors. The React/Studio suite
also passed the new real-backtest E2E test, including chart-scope isolation.

## Financial and lifecycle acceptance matrix

| Acceptance criterion | Status | Verification or limitation |
| --- | --- | --- |
| Framework-independent strategy engine | Implemented / Verified | Node strategy tests and public exports |
| Typed, validated, reproducible strategies | Implemented / Verified | Metadata validation, isolated instances, fingerprints |
| No future-data leakage | Implemented / Verified | Causal-prefix and built-in tests |
| Next-bar execution policy | Implemented / Verified | Independent next-bar fixtures |
| Deterministic order lifecycle | Implemented / Verified | State transition and rejection tests |
| Cash, position, and equity accounting | Implemented / Verified | Long/short and identity fixtures |
| Commission and slippage | Implemented / Verified | Cost and adverse-slippage fixtures |
| Validated trade ledger | Implemented / Verified | Completed and open position separation |
| Performance statistics | Implemented / Verified | Independent metric formula tests |
| Replay integration and anchored markers | Implemented / Verified | Core replay tests and Chromium replay marker test |
| Alert semantics remain separate | Implemented / Verified | Existing alert Node/browser regression suites |
| KlineScript security boundary | Preserved / Verified | Existing KlineScript tests pass; no executable strategy source accepted |
| Studio Strategy Tester | Implemented / Verified | 11 React/Chromium tests, including real backtest |
| Results/equity/trades visible | Implemented / Verified | Studio dashboard and responsive UI test |
| JSON/CSV export | Implemented / Verified | Public export tests, E2E controls, package smoke |
| Multi-chart isolation | Implemented / Verified | Studio E2E switches chart scopes without result leakage |
| Cancellation and cleanup | Implemented / Verified | Node cancellation, unmount disposal, zero Canvas cleanup |
| Performance evidence | Implemented / Verified | Node, Canvas2D, Studio, and strategy benchmarks |
| Worker-based strategy execution | Not implemented | Synchronous reference path is documented; no Worker claim |
| Multi-asset portfolio simulation | Deferred | Outside the single-symbol milestone |
| Protective orders/intrabar fills | Deferred | Not part of this execution model |

## Performance and memory observations

### Canvas2D regression check

Environment: Node.js v24.19.0, headless Chromium 154.0.0.0 at
`/usr/bin/chromium`, Playwright 1.64.1, 1,200 × 520 benchmark viewport.
Values are observations, not universal targets.

| Candles | Load (ms) | Append/update (ms) | Correction (ms) | Frame-work p50/p95 (ms) | FPS observation | Heap before destroy | Heap after destroy | Canvas after destroy |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 20.5 | 1.943 | 45.9 | 1.6 / 3.4 | 64.29 | 20.2 MB | — | — |
| 10,000 | 89.9 | 1.016 | 391.7 | 1.2 / 1.8 | 62.51 | 53.5 MB | — | — |
| 100,000 | 1,613.4 | 1.105 | 7,311.8 | 1.4 / 3.0 | 61.51 | 657.4 MB | 2.42 MB | 0 |

The benchmark preserves the optimized append path and keeps historical
corrections separate. No constant-time claim is made for corrections.

### Strategy benchmark

Environment: Node.js v24.19.0 with `--expose-gc`.

| Candles | Strategy | Run 1 / Run 2 (ms) | Signals | Trades | JSON bytes | Heap after disposal (MB) |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 1,000 | EMA trend | 16.381 / 8.330 | 14 | 6 | 299,561 | 6.61 |
| 1,000 | RSI reversal | 6.597 / 6.534 | 14 | 7 | 301,782 | 6.65 |
| 10,000 | EMA trend | 81.169 / 75.025 | 138 | 68 | 3,099,840 | 17.30 |
| 10,000 | RSI reversal | 52.782 / 79.825 | 138 | 69 | 3,106,795 | 17.38 |
| 100,000 | EMA trend | 14,764.750 / 15,454.231 | 1,384 | 691 | 31,121,935 | 123.22 |
| 100,000 | RSI reversal | 13,910.764 / 13,680.679 | 1,384 | 692 | 31,186,136 | 123.35 |

The cancellation run reached 1,024/100,000 bars and ended with
`BacktestCancellationError` in 43.371 ms; final state was `cancelled`.
Repeated fingerprints and JSON exports were deterministic. The 100k latency
is materially higher than Canvas append work because each evaluator receives a
defensive historical prefix. This is a known optimization/design follow-up,
not a hidden performance guarantee.

### Studio lifecycle observation

Headless Chromium 154 measured layout transitions of 461.1ms (single),
347.8ms (two horizontal), 326.0ms (two vertical), and 394.9ms (four-grid).
The four-grid observation had four visible canvases; after navigating away,
zero canvases remained. The explicit-GC heap observation changed from 62.43MB
to 53.03MB. These values are workload- and environment-specific.

## Browser compatibility and inherited gates

| Target | Status | Evidence |
| --- | --- | --- |
| Chromium 154 | Verified | 8 core + 11 React/Studio tests passed |
| Mobile Chrome emulation | Verified | 8 core tests passed |
| Firefox Playwright-managed browser | Blocked by environment | Official artifact download previously returned HTTP 403 `Domain forbidden`; no compatible executable was available |
| WebKit Playwright-managed browser | Blocked by environment | Official artifact download previously returned HTTP 403; no compatible executable was available |
| Mobile Safari emulation | Blocked by environment | Requires the unavailable Playwright WebKit binary |
| Physical mobile devices | Not tested | No device lab was available |
| Formal keyboard/assistive-technology audit | Not tested | Automated labels and responsive checks pass, but a formal audit is still open |

Firefox, WebKit, and Mobile Safari are explicitly open acceptance rows. No
system browser or untrusted binary was substituted, TLS verification was not
disabled, and the acceptance gate was not unilaterally relaxed.

## Documentation and package status

Updated canonical PDR, roadmap, benchmark documentation, and the new
`docs/guides/studio-strategy-tester.md`. Existing strategy, backtesting,
portfolio-accounting, replay-integration, API, and testing documents remain
the source of detailed contracts. The package exports the strategy,
backtesting, marker, and export APIs and passed dry-run installation/smoke
verification. The effective root license and npm license metadata were not
changed.

## Git and release verification

- Commit: `7adad590aefce7a0955326c9121f5da84601ce98`
- Author: `Akira Yuzai <yuzai.akira@gmail.com>`
- Committer: `Akira Yuzai <yuzai.akira@gmail.com>`
- Push: `origin/work` advanced from `29e03f4` to `7adad59`.
- Remote verification: `git ls-remote origin refs/heads/work` returned
  `7adad590aefce7a0955326c9121f5da84601ce98`.
- No force push, history rewrite, GitHub Actions workflow, npm publication,
  release tag, or public release was performed.

## Phase 8.0 readiness decision

The strategy/backtesting foundation is ready for continued engineering review
and controlled local use. Phase 8.0 must remain open for formal acceptance until
the owner provides an environment with official Playwright Firefox/WebKit
artifacts and the project completes the inherited browser/device and formal
accessibility gates. Before calling the milestone complete, the project should
also decide whether the synchronous 100k strategy cost is acceptable or should
be addressed by a versioned, cancellation-aware Strategy Worker. That decision
must preserve deterministic output and reject stale results; it must not be
papered over by changing the acceptance criteria.
