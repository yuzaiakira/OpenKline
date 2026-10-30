# Phase 12.5 Runtime Hardening

Status: in progress. This report records verified work only; unresolved acceptance gates remain open.

## Baseline

- Required starting revision: `3415f6e5bfc41106380c38ecbc49089451c980c7`
- Current revision: `0094f50d0cbf7e58a2b8562f9039fb1af602d638`
- Branch: `main`
- Git identity for Phase 12.5 commits: `Akira Yuzai <yuzai.akira@gmail.com>`

## Verified milestones

### Provider-neutral package portability

The Studio workspace document continues to accept and preserve legacy `dataSource` values, including `binance`, without exposing a vendor-specific union in the compiled core public type. The package portability scanner remains strict and is now covered by a standalone negative fixture test.

Verified:

- `npm run build`
- `node --test scripts/package-portability-policy.test.mjs`
- `npm run package:portability`

Result: pass. The portability gate reports provider-neutral core text and the package artifacts are present.

### Real Next.js portfolio Worker

The Next.js example now owns a dedicated `portfolio-backtest-worker.ts` entry. It bundles the public Worker handler through the supported Next webpack path instead of relying on the package's relative worker asset. The Studio uses that factory and marks execution as `worker` only for the Worker path.

Synchronous fallback is bounded to small demonstrations (`3,000` total candles). Larger runs receive an explicit Worker-unavailable error and are never executed synchronously by the Studio.

Verified:

- `npm --prefix examples/nextjs-app-router run build`
- `npm run test:react:browser -- --grep 'Studio runs a deterministic multi-instrument portfolio backtest'`

The focused Chromium test instrumented the browser `Worker` constructor and passed after observing a real Worker construction. The result remained deterministic and the existing portfolio assertions passed.

### Causal as-of result presentation and import hardening

The public `projectPortfolioBacktestAsOf()` projection now gives Studio and
other consumers an explicit historical presentation boundary. Signals are
limited by availability, future fills remain pending, completed trades require
an exit at or before the boundary, and open positions/metrics use the causal
account snapshot. Deep result import validation rejects non-finite values,
duplicate ledger identities, unknown instrument references, unsupported enums,
and arrays beyond the documented import bound.

Verified:

- `npm run build`
- `./node_modules/.bin/tsc -p tsconfig.test.json`
- `node --test test-dist/tests/portfolio-backtesting.test.js` (7 passed)
- `npm --prefix examples/nextjs-app-router run build`
- focused Chromium Studio test (1 passed, including full/as-of/full switching)

## Open work

The following Phase 12.5 requirements are not yet marked complete:

- bounded large-result serialization/import benchmarks;
- full lifecycle, cancellation, supersession, unmount, production-start, and package-consumer Worker tests;
- complete local verification matrix and performance evidence;
- external Firefox/WebKit/mobile/physical-device/accessibility/visual gates.

No release, npm publication, license change, force-push, or GitHub Actions workflow was performed.
