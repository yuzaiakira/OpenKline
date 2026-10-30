# Phase 12.5 Runtime Hardening

Status: in progress. This report records verified work only; unresolved acceptance gates remain open.

## Baseline

- Required starting revision: `3415f6e5bfc41106380c38ecbc49089451c980c7`
- Current revision: `7d66c1a7d5fb1f1d04c3e5d2c1263b186a8d8306`
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

### Scalable result transport and production/package consumers

Large-result handling now has a public JSON chunk iterator that preserves the
compatibility serializer's bytes without requiring stream-capable consumers to
create a second monolithic string. The Worker runtime clones structured options
field-by-field rather than creating a temporary JSON document. Studio equity
visualization samples at most 800 points while keeping the complete result
available for export; tabular views remain bounded to 100 rows.

Verified:

- `npm run benchmark:portfolio-result`
- `npm run package:smoke` (packed package installed offline; public Worker
  handler consumer completed a run)
- `npm run test:react:production` (Next 16.4.3 production build and one real
  Chromium Worker E2E test passed)

Observed result transport benchmark on Node v24.19.0:

| Candles × instruments | JSON bytes | Serialize ms | Parse/validate ms | Chunk count | Heap delta MB |
|---:|---:|---:|---:|---:|---:|
| 1,000 × 2 | 1,141,844 | 4.559 | 9.109 | 12,231 | 1.55 |
| 10,000 × 3 | 15,304,453 | 53.476 | 88.088 | 162,943 | 17.75 |
| 100,000 × 1 | 82,196,144 | 359.934 | 471.791 | 809,719 | 119.91 |

These are reproducible cloud observations, not browser-wide memory or capacity
guarantees.

The existing synchronous portfolio benchmark was also rerun with the prior
1,000/10,000/100,000-candle workloads. On Node v24.19.0 its median/p95 run
times were `42.468/54.191 ms`, `369.227/414.640 ms`, and
`6051.472/6637.138 ms`; median export times were `4.338 ms`, `48.069 ms`, and
`1091.502 ms`. The corresponding observed heap deltas were `0.46 MB`, `0.17
MB`, and `0.22 MB`. The 100,000 × 5 result was `226,583,453` bytes. The
protocol-handler benchmark measured `64.172 ms` for 1,000 × 2 and `405.296 ms`
for 10,000 × 3, with disposal acknowledgements under `0.15 ms`. These are
Node/handler measurements, not browser Worker or Canvas2D claims.

### Lifecycle, package, and browser verification

Worker lifecycle coverage includes cancellation, supersession, and disposal
rejection of stale runs. The production Next.js check constructs the
host-owned Worker through the production bundle, and the package smoke imports
and executes the public Worker handler from an offline packed installation.
Result import validation covers normal results plus malformed, duplicate,
oversized, and non-finite input cases.

Verified local command matrix:

| Command | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm test` | 270 passed, 0 failed |
| `npm run api:inventory` | pass; 266 runtime and 600 type exports |
| `npm run api:diagnostics` | `PASS_ADDITIVE_REVIEW_REQUIRED`; no removals or findings |
| `npm run studio:check` | pass |
| `npm run package:check` | pass; 474 files, 484,560-byte tarball |
| `npm run package:smoke` | pass; offline package and Worker-handler consumer |
| `npm run package:audit` | pass; license remains `pending-owner-approval` |
| `npm run package:portability` | pass |
| `npm run distribution:check` | pass; SHA-1 `80777464b9750b4f1961ab14407a949c1a1c72b0` |
| `npm run test:browser` | 30/30 pass in local Chromium |
| `npm run test:react:browser` | 35/35 pass in local Chromium |
| `npm run test:react:production` | pass; Next 16.4.3 production build and 1/1 Worker E2E |
| `npm run benchmark:browser` | pass; 61.49 FPS at 100,000 candles, 0 canvas after destroy |
| `npm run benchmark:portfolio` | pass; status completed before disposal and disposed after each workload |
| `npm run benchmark:portfolio-worker` | pass; disposal acknowledgements under 0.15 ms |
| `npm run benchmark:portfolio-result` | pass; chunked bytes matched full serializer for all workloads |
| `npm run stress:ci` | pass; 0 orphan failures, 0 Worker orphans, 0 remaining canvases |

The Chromium runs used the environment's `/usr/bin/chromium` and reported
`HeadlessChrome/154.0.0.0`. They are local Chromium evidence, not evidence for
Playwright-managed Firefox/WebKit or mobile engines.

The protected historical API gate remains intentionally open:
`npm run api:check` exits 1 because the baseline at
`3e7a889a94c40255bbcce210a672856cfc98b32b` predates approved additive API
changes. It reported no removals, three changed declaration hashes, and 243
additive exports. The baseline was not rewritten.

## Open work

The following Phase 12.5 requirements are not yet marked complete:

- external Firefox/WebKit/mobile/physical-device/accessibility/visual gates.
- owner approval for the additive public API baseline and the corresponding
  `npm run api:check` gate.
- formal release/licensing approval; no release or publication was attempted.

No release, npm publication, license change, force-push, or GitHub Actions workflow was performed.
