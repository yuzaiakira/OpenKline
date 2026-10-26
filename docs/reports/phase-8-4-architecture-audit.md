# Phase 8.4.0 Library-first architecture audit

Audit baseline: branch `work`, commit `abf8f10aee328984696d9900a53edb97c201db22`,
2026-10-26. This is an engineering audit, not a license or legal approval.

## Findings

| Area | Finding | State / action |
| --- | --- | --- |
| Core vendor coupling | `src/` contains no Binance, Alpaca, OANDA, hosted API, or provider-specific endpoint import. | Pass; preserve this boundary. |
| Network side effects | REST and WebSocket requests are created only by explicit adapter construction/use. The root module imports do not invoke them. | Pass; add regression tests for import/no-network behavior. |
| Browser side effects | `Chart` touches DOM/canvas in its constructor, while model and non-rendering modules remain import-safe. | Pass; keep chart construction in browser/client lifecycle. |
| Framework coupling | React is isolated under `packages/react`; Next.js is isolated under `examples/nextjs-app-router`. | Pass; package consumer checks remain required. |
| Direct data input | `Chart.setData`, `Chart.update`, and series `setData`/`update` already support local arrays, corrections, empty input, and custom symbols. | Implemented; add a standalone offline consumer scenario. |
| Datafeed lifecycle | The public contract is provider-neutral and adapters are generic. The audit found that `Chart.setDatafeed` did not explicitly call `resolveSymbol`. | Fixed in 8.4.2; regression coverage is in the custom-exchange consumer scenario. |
| Optional providers | No provider adapter is required by the package. The repository has no Binance example yet. | Add isolated examples/docs; do not export provider code from the core. |
| Advanced features | Indicators, drawings, replay, screener, backtesting, optimization, paper trading, and workspaces consume supplied data or explicit host adapters. | Pass from source audit; test consumer boundaries. |
| Package exports | Root exports are ESM/types and include framework-neutral modules; React remains a separate package. | Pass; verify installed ESM/TS/React/Next consumers. |
| Licensing/release | Package audit intentionally reports pending owner/legal approval. | Preserve; no license metadata or publication changes. |

## Side-effect conclusion

No mandatory provider, backend, cloud service, credential, or network request
was found in the core architecture. The remaining work is integration proof
and one lifecycle correctness fix, not a rewrite of the chart engine.

## Required follow-up

1. Make `setDatafeed` perform symbol resolution before historical acquisition
   while retaining stale-request cancellation.
2. Add direct/offline and custom-exchange consumers with network-deny tests.
3. Add generic REST/WebSocket and optional Binance examples outside `src/`.
4. Verify package and framework boundaries with independent consumers.
5. Record local benchmark and unverified browser/device gates in the Phase 8.4
   verification report.

## 8.4.4 portability evidence

The local `npm run package:portability` gate passed on Node.js v24.19.0 and
npm 11.9.0. It found zero runtime dependencies in the core and React packages,
`sideEffects: false` in both manifests, usable public ESM/type exports, and
the KlineScript/Screener worker entry artifacts. The core build contained no
Binance, Alpaca, OANDA, or hosted-provider strings.

The independent consumer smoke test passed for Vanilla ESM and TypeScript
React. `npm run package:check` and `npm run package:smoke` passed, the Next.js
App Router TypeScript check passed, and the Next.js 16.4.3 production build
passed. These checks do not replace a bundler-specific tree-shaking analysis,
Firefox/WebKit verification, or a physical-device test.

## 8.4.5 Studio separation evidence

`npm run studio:check` passed after auditing 98 core source files and 13 Studio
application files. The root package has no React or Next runtime dependency,
the Next.js example remains private, and the Studio imports public package
entry points rather than private `src/` paths. Local Chromium regression tests
for the multi-chart Studio and the Market Screener passed after resolving a
unique accessible-label collision. The full React-browser suite also scopes
chart and Strategy Tester assertions to their owning regions so the Screener's
same-purpose controls cannot create false strict-mode failures. Studio remains a reference application;
this does not claim formal accessibility or non-Chromium compatibility.
