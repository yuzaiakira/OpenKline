# Phase 5 production-readiness assessment

Date: 2026-10-25 (UTC)

Status: **Superseded by the Phase 5.1 release-readiness report; stable release
approval remains blocked.** This historical report records actual local
evidence and does not treat
untested browser engines, missing licensing decisions, or incomplete audit work
as complete. No package was published.

## Capability and readiness matrix

| Area | Status | Evidence / remaining work |
| --- | --- | --- |
| KlineScript compiler and restricted runtime | Implemented / Verified | Independent security audit, 48-test suite, bounded fuzz seeds, numerical fixtures, and runtime budget regressions. |
| P0/P1 security findings from this audit | Verified fixed | Parser stack exhaustion, under-counted window work, per-bar reset, series/scalar checker mismatch, and public AST metadata leak fixed in `54f4024`. |
| KlineScript hard sandbox | Not implemented | Synchronous interpreter has no hard wall-clock interruption or JS heap cap; trusted plugins remain in-process. |
| TypeScript declarations | Verified | `typecheck`, root declarations, declaration maps, and package dry-run pass. |
| ESM package consumption | Verified | Clean local tarball installation and public ESM import smoke test pass, including KlineScript compile/execute. |
| Package exports | Verified | Root `.` export exposes ESM/types; internal `executeKlineScript` is not exported. |
| Source maps and tree-shaking metadata | Verified locally | Build emits source/declaration maps; package declares `sideEffects: false`. This is not a bundler compatibility guarantee for every consumer. |
| React integration | Verified locally | React TypeScript build, SSR-safe Node test, and Next.js production example pass. The React package is a local workspace package, not published. |
| Next.js App Router | Verified locally | `next build --webpack` passes with Next.js 16.4.3 and the packaged core build. |
| Vanilla integration | Verified locally | Public root package smoke and standalone browser examples pass in Chromium. |
| Plugin SDK | Implemented / Verified in existing suite | Trusted in-process extension API and lifecycle tests pass; no remote loader or sandbox is claimed. |
| Workspace script state | Implemented / Verified | Only source/program-id references are persisted; restore tests pass. |
| Open-source maintainer docs | Implemented | README, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, CHANGELOG, API/architecture docs, and local release-check instructions exist. |
| LICENSE and package license metadata | Blocked | No project-owner license choice has been supplied; no license file or `package.json` license field was invented. Stable release cannot be approved. |
| Third-party license/attribution inventory | Verified for metadata; legal review open | See `docs/audits/license-inventory.md` and `docs/audits/dependency-security.md`. Actual license/notice review remains required before release. |
| GitHub Actions policy | Verified | No `.github/workflows` directory; checks are local only. |

## Verification results

These commands were run locally on 2026-10-25:

| Command | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm test` | Pass: 48 Node tests |
| `npm run test:browser` | Pass: 3 Chromium tests |
| `npx playwright test --project=mobile-chrome` | Pass: 3 tests |
| `npm run test:browser:compat` | 3 Mobile Chrome tests passed; 9 launches blocked: 3 Firefox, 3 WebKit, 3 Mobile Safari |
| `npm run package:check` | Pass: ESM package, declarations, maps, and 142 packed files listed |
| `npm run package:smoke` | Pass: clean local tarball install and ESM/KlineScript consumer |
| `cd examples/nextjs-app-router && npm run build` | Pass: Next.js 16.4.3 |
| focused KlineScript/fuzz tests | Pass: 14 tests |
| `npm run benchmark:klinescript` | Pass; measurements below |
| `npm run benchmark:browser` | Pass; measurements below; repeated run variance is reported honestly |
| `npm run release:check` | Blocked as designed at the official compatibility gate: all earlier checks passed; 3 Mobile Chrome passed and 9 Firefox/WebKit/Mobile Safari launches were blocked |

## Browser compatibility evidence

Playwright is `1.64.1`. Chromium uses the available Headless Chromium
`154.0.0.0`; Chromium and Pixel 7 Mobile Chrome behavior passed, including
rendering, indicators, filled bands, interaction, touch drawing, cleanup, and
KlineScript playground flows covered by the suite.

Firefox requires the official Playwright Firefox 157 / build 1555 executable,
which is absent at `/home/agent/.cache/ms-playwright/firefox-1555/firefox/firefox`.
WebKit and Mobile Safari require the official WebKit 27.2 / build 2370
executable, absent at `/home/agent/.cache/ms-playwright/webkit-2370/pw_run.sh`.
The prior supported Docker attempt using
`mcr.microsoft.com/playwright:v1.64.1-noble` failed while downloading an image
layer with `Forbidden`. No system Firefox/Safari or arbitrary binary was used,
and TLS verification was not disabled.

The external verification checklist is:

1. Use a trusted environment with network access to the official Playwright
   artifact repository or the exact pinned official Docker image.
2. Confirm `npx playwright --version` is `1.64.1` and inspect the managed
   browser executable versions before running tests.
3. Run `npm run test:browser:compat` without changing projects or substituting
   system browsers.
4. Record all five project results, browser user agents/versions, and the
   exact artifact source. Keep this report open until all mandatory projects
   pass.

## Performance and memory observations

KlineScript benchmark environment: Node.js `v24.19.0`, Linux `x64`, three
samples per historical size:

| Candles | Median/p95 execution (ms) | Counted operations | Output points |
| ---: | ---: | ---: | ---: |
| 1,000 | 1.524 / 1.524 | 26,794 | 1,000 |
| 10,000 | 4.910 / 4.910 | 269,794 | 10,000 |
| 100,000 | 52.608 / 52.608 | 2,699,794 | 100,000 |

Additional observed KlineScript values: compile `3.255 ms`, ten lifecycle
updates `8.055 ms`, four concurrent 10k executions `26.077 ms` with 1,079,176
combined operations, pre-cancelled execution raised `KlineScriptRuntimeError`,
and indicator disposal completed. These are directional local observations,
not release budgets or cross-machine guarantees.

Latest Canvas2D benchmark run used Headless Chromium `154.0.0.0`,
`--disable-gpu`, and the deterministic repository fixture:

| Candles | rAF FPS | Frame interval p50/p95 (ms) | Frame-work p50/p95 (ms) | 100 updates (ms) | 5 corrections (ms) |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 64.10 | 16.6 / 17.2 | 1.0 / 1.3 | 114.6 | 39.1 |
| 10,000 | 61.68 | 16.7 / 16.8 | 0.8 / 3.1 | 59.0 | 460.2 |
| 100,000 | 62.29 | 16.7 / 16.9 | 0.7 / 1.2 | 65.2 | 6,168.3 |

Separate immediately preceding runs observed 54.51 FPS and 31.2 ms
frame-interval p95 at 100k, demonstrating host variability. No chart renderer
change was made in this audit, so these observations are not presented as a
universal regression or guarantee. In the release-check run, browser heap was
observed at 620.65 MB before destruction and 1.90 MB after destruction;
remaining canvas count was zero. Heap readings are engine/workload
observations, not a heap cap or proof of absence of every leak. Historical
corrections intentionally remain more expensive than newer-bar updates.

## Local release-check behavior

`npm run release:check` is implemented in `scripts/release-check.mjs` and
documented in `docs/development/release-check.md`. It runs type checks, full
tests, available browser tests, both benchmark suites, package checks/smoke,
the Next.js build, repository/document validation, and the full compatibility
gate. It is designed to exit non-zero when official Firefox/WebKit artifacts
are missing, so a blocked environment cannot be reported as a successful
release check. It never publishes and never invokes GitHub Actions.

## Explicit Phase 5 acceptance matrix

| Mandatory gate | Status |
| --- | --- |
| Independent security audit completed with verified regression tests | **Verified** |
| No unresolved verified P0/P1 defect in the audited implementation | **Verified for audited scope** |
| Full local Node/TypeScript/integration test suite | **Verified** |
| Chromium and Mobile Chrome behavior | **Verified** |
| Firefox behavior | **Blocked by official binary availability** |
| WebKit behavior | **Blocked by official binary availability** |
| Mobile Safari behavior | **Blocked by official WebKit binary availability** |
| Package install and public ESM/KlineScript consumption | **Verified locally** |
| React and Next.js local consumption | **Verified locally** |
| Documentation and local release-check foundation | **Verified** |
| Owner-approved license and package license metadata | **Open / release blocker** |
| Third-party license and attribution inventory | **Open / release blocker** |
| Stable release approval | **Open** |

## Phase 5 readiness assessment

The Phase 5.1 report supersedes this matrix for current package and license
evidence. OpenKline is ready for continued engineering and controlled local integration,
not for stable open-source release approval. The security audit found and fixed
the verified P1 issues listed in its report, while preserving the explicit
limitations of a synchronous in-process DSL. Phase 5 remains open until the
project owner selects and records a license, the dependency/asset attribution
inventory is completed, and the official Firefox/WebKit/Mobile Safari gate is
run successfully or an owner-approved documented exception changes the
milestone criteria. This report does not authorize Phase 3/next-milestone work
to bypass those gates.
