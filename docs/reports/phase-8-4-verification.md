# OpenKline Phase 8.4 Verification

Date: 2026-10-26  
Branch: `work`  
Scope: universal data integration and library-first architecture hardening

## Status

The Phase 8.4 implementation is complete for the independently executable
local engineering scope. The milestone remains open for final acceptance
because managed Firefox, WebKit, Mobile Safari, physical-device, formal
accessibility, visual-regression, and real external-provider gates were not
verified in this environment.

This report distinguishes implemented behavior from evidence and from tests
that are blocked or intentionally not run. It does not claim universal browser
compatibility, package compatibility with every bundler, or production capacity
from one local machine.

## Implemented capabilities

- Library-first core boundary: `src/` has no mandatory provider, backend,
  cloud, account, credential, React, Next.js, or network dependency.
- Direct local data remains the primary integration path through `Chart.setData`,
  `Chart.update`, and series data APIs. A consumer can render, correct, analyze,
  and destroy a chart without constructing a Datafeed.
- The provider-neutral Datafeed lifecycle now resolves the symbol before
  history acquisition and preserves cancellation, stale-response protection,
  streaming corrections, append updates, and disposal.
- Standalone Vanilla examples cover direct data, local JSON, a custom exchange,
  generic REST, generic WebSocket, and an explicitly opt-in Binance adapter.
  Binance is example-only and never imported by the core package.
- Package portability checks cover public ESM/type exports, worker artifacts,
  zero runtime dependencies, `sideEffects: false`, and provider-neutral core
  output. React remains a separate optional package.
- The private Next.js Studio remains a reference application. Its core
  boundary is audited and its public-package consumption is tested; Studio
  functionality is not a prerequisite for using the charting library.

## Milestone evidence

| Milestone | Result | Commit |
| --- | --- | --- |
| 8.4.0 library-first audit | Implemented and verified | `5178e7760fc09c3e098633b1d9d8b6fd60f6ed09` |
| 8.4.1 direct/offline data | Implemented and browser-verified in Chromium | `5665636dd05382a804f500b30dd1ed95b3228add` |
| 8.4.2 custom Datafeed lifecycle | Implemented and browser-verified with local exchange fixtures | `d8579f684b9aa4f00bfed3e1861c052e902dcc9c` |
| 8.4.3 universal integration examples | Implemented; fixture-based browser verification passed | `1c48567c3b3ed52ccf2b574cae726c06cdf3e721` |
| 8.4.4 package portability | Implemented and locally verified | `ae1a5d4a6d1fcc01b5a8eb51a5c4ef1b2681a0d6` |
| 8.4.5 Studio separation | Implemented and locally verified | `8522b709964961b9a77d19c83fd32c9b690cf0fa` |
| Generated Next type-reference synchronization | Pushed separately after Next tooling updated the generated file | `d0ff19da447b25c2ed3e483e42334c2dd9140139` |
| Studio assertion regression hardening | Verified after full React-browser rerun | `609087d` |
| 8.4.6 final local verification | This report and status updates | final report commit recorded in the handoff |

The final report commit hash is intentionally supplied after the commit is
created so this file does not claim a self-referential hash.

## Test results

Environment: Node.js v24.19.0, npm 11.9.0, Linux x64, Playwright 1.64.1,
configured local Chromium `HeadlessChrome/154.0.0.0` at `/usr/bin/chromium`.

| Command or scenario | Result | Evidence |
| --- | --- | --- |
| `npm test` | Pass | 151 tests passed, 0 failed |
| `npm run typecheck` | Pass | Root and React TypeScript checks passed |
| `npm run test:browser -- --project=chromium` | Pass | 12/12 local Vanilla browser tests |
| `npm run test:browser -- --project=mobile-chrome` | Pass | 24/24 total: Chromium and Pixel 7 emulation, 12 each |
| `npx playwright test --config playwright.react.config.ts --project=chromium` | Pass | 16/16 React/Next Studio tests |
| `npm run package:portability` | Pass | Zero core/React runtime dependencies; public exports and workers verified |
| `npm run package:audit` | Pass with policy state | Package audit passes; license remains `pending-owner-approval` |
| `node scripts/consumer-preview-smoke.mjs` | Pass | Independent Vanilla ESM and TypeScript/React consumer checks |
| `npm run package:smoke` | Pass | Packed `openkline@0.1.0` installed into a clean ESM consumer |
| `npm run studio:check` | Pass | Core/Studio import and dependency boundary audit |
| Next.js `tsc --noEmit` | Pass | App Router consumer typecheck |
| Next.js `next build --webpack` | Pass | Next.js 16.4.3 production build |
| Direct-data network-deny scenario | Pass | Local data, correction, indicators, drawings, and cleanup |
| Custom exchange Datafeed scenario | Pass | Resolve, history, correction, append, stop, disposal, and no external network |
| Offline JSON/generic REST/WebSocket/Binance fixture scenarios | Pass | Local fixtures only; no real provider claim |

The Studio suite initially exposed selector ambiguity after the Screener was
added. The assertions were scoped to the owning Chart/Strategy Tester regions;
the complete 16-test suite then passed. No product behavior was rewritten for
that test fix.

## Browser compatibility matrix

| Target | State | Details |
| --- | --- | --- |
| Chromium | Verified locally | 12 Vanilla tests and 16 React/Next tests passed |
| Mobile Chrome emulation | Verified locally | Pixel 7 emulation passed all 12 Vanilla tests |
| Firefox | Blocked by environment | Playwright 1.64.1 requires managed Firefox 157.0 build 1555; executable absent at `/home/agent/.cache/ms-playwright/firefox-1555/firefox/firefox` |
| WebKit | Blocked by environment | Managed WebKit 27.2 build 2370 executable absent |
| Mobile Safari emulation | Blocked by environment | Uses the unavailable managed WebKit artifact |
| Physical mobile devices | Not tested | No device farm or physical device was in scope |
| Formal accessibility audit | Not tested | Interaction assertions are not an accessibility conformance audit |
| Visual-regression screenshots | Not tested | No screenshot baseline gate was claimed |

The managed browser cache was absent. Playwright's supported dry-run URLs
resolved to the official CDN entries, but no trusted compatible Firefox/WebKit
binary was available locally. System Chromium is used only by the repository's
existing Chromium projects; system Firefox, Safari, or arbitrary browser
artifacts were not substituted.

## Performance and memory measurements

`npm run benchmark` passed with the following Node model observations:

| Candles | Load (ms) | Navigation (ms) | Update (ms) |
| ---: | ---: | ---: | ---: |
| 1,000 | 3.915 | 0.112 | 0.995 |
| 10,000 | 13.635 | 0.013 | 0.031 |
| 100,000 | 111.977 | 0.017 | 0.033 |

`npm run benchmark:browser` passed with real Canvas2D work in local headless
Chromium. The benchmark's correction column is the measured five-correction
workload; it is intentionally separate from the append path.

| Candles | Load (ms) | Update-frame (ms) | Correction (ms) | Frame-work p95 (ms) | rAF FPS |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 21.6 | 1.991 | 50.4 | 3.0 | 63.40 |
| 10,000 | 102.0 | 1.086 | 437.1 | 1.8 | 61.86 |
| 100,000 | 2,214.9 | 1.028 | 8,992.2 | 3.3 | 61.98 |

At 100,000 candles, the measured browser heap was 592,758,198 bytes before
destroy and 2,794,943 bytes after the explicit cleanup/GC opportunity. Remaining
canvas count was 0. These are local observations, not memory limits or
universal FPS guarantees. The benchmark preserves financial correctness by
keeping historical corrections distinct from newer-timestamp append updates.

The deterministic screener benchmark remains a Node-only observation and is
not treated as a browser capacity claim. Real Binance latency, exchange
capacity, and external provider reliability were not measured.

## Public API and package verification

The library's public boundary is the root ESM/type package. React is an
optional peer-based package, and Next.js is only an example consumer. The
portability gate reported:

- core runtime dependencies: `0`
- React runtime dependencies: `0`
- `sideEffects: false` on both package manifests
- `dist/src/index.js`: 6,093 bytes
- `dist/src/index.d.ts`: 16,102 bytes
- KlineScript worker and Screener worker artifacts present
- no provider-specific strings in the core build

The package was packed and installed into a clean ESM consumer. The Next.js
consumer was typechecked and built with Next.js 16.4.3. This does not verify
every bundler, browser engine, or external provider.

## Acceptance matrix

| Criterion | State | Notes |
| --- | --- | --- |
| No mandatory provider/backend/cloud/framework/network | Verified | Source audit and package boundary checks pass |
| Direct local data without Datafeed | Verified | Offline browser scenario passes |
| Optional provider-neutral Datafeed | Verified | Custom exchange and adapter tests pass |
| Offline JSON and generic REST/WebSocket examples | Verified | Local fixtures pass |
| Optional Binance integration isolated from core | Implemented; fixture verified | Real Binance network path not tested |
| Portable Vanilla/TypeScript/React/Next consumption | Verified locally | Independent package and Next checks pass |
| Studio remains reference-only | Verified | Executable separation audit passes |
| Core/unit/integration/browser local tests | Verified for available targets | 151 Node, 12 Vanilla Chromium, 12 Mobile Chrome, 16 React Chromium |
| Firefox | Blocked by environment | Managed artifact unavailable |
| WebKit and Mobile Safari | Blocked by environment | Managed artifact unavailable |
| Physical-device/accessibility/visual gates | Not tested | Acceptance remains open |
| Licensing/publication | Not changed | Owner/legal approval remains pending; no npm/release publication |

## Remaining technical debt and blockers

1. Acquire the exact Playwright 1.64.1 managed Firefox and WebKit artifacts
   through an approved, trusted, reproducible environment, then run the full
   compatibility matrix.
2. Run the same tests on physical mobile devices and complete the project's
   formal accessibility and visual-regression gates.
3. Verify the optional Binance path against a controlled, authorized test
   environment; fixture tests are not external-provider verification.
4. Continue bundler-specific portability checks if a release gate requires
   them; the current gate intentionally avoids universal tree-shaking claims.
5. Keep package licensing in its existing owner/legal-review state. No root
   `LICENSE`, npm license metadata, tags, releases, or publication were
   changed by Phase 8.4.

## Git and synchronization verification

All Phase 8.4 commits were made on `work` with author and committer
`Akira Yuzai <yuzai.akira@gmail.com>`, using Conventional Commit messages.
Each successful commit was pushed immediately to `origin/work`. The branch was
clean and `HEAD` matched `origin/work` after the last verification commit;
the final report commit hash is supplied in the delivery handoff.

No GitHub Actions, force-push, history rewrite, npm publication, release tag,
GitHub release, or cloud-environment publication was performed.

## Phase 2 readiness assessment

OpenKline's library-first architecture is ready for independent consumer
integration and further product work. Phase 8.4 itself must remain open until
the environment-blocked browser targets and explicitly untested acceptance
gates are completed or the project owner authorizes a documented exception.
This report does not authorize beginning a future phase by silently waiving
those gates.
