# OpenKline Phase 8.9.1 — Cross-Browser Regression After Datafeed Lifecycle Fix

## Final technical verdict

**`BLOCKED — OFFICIAL BROWSER ENVIRONMENT UNAVAILABLE`**

The digest-pinned Playwright container could not be executed on this Manjaro
host, and host WebKit cannot launch without container/`install-deps` libraries.
Therefore this phase **does not** establish independent five-browser
compatibility for the post-fix source and **must not** reuse Phase 8.8.16
200/200 totals against `02e9287` / later tips.

Provisional Chromium / Firefox / Mobile Chrome lifecycle evidence and full
Node/package checks did pass against the product fix ancestry. They are
supporting diagnostics only.

## 1. Exact tested source

| Role | SHA |
| --- | --- |
| Historical browser-verified baseline | `bb3f1cad028b126920fa26a75f7ec158ebc56e3c` |
| Phase 8.9.0 product fix | `02e92874fa60e176099acb3eb96953858e31e87e` |
| Phase 8.9.0 reported tip (docs only after fix) | `4ce730111904ad011ecdbebe84f109cdc9a4f674` |
| Product behavior under test | **identical to `02e9287`** (tip commits after the fix are documentation / regression harness only until this phase’s commits) |

Branch at phase start: `qa/phase-8-9-0-functional-verification` @ `4ce7301`  
Work branch: `qa/phase-8-9-1-cross-browser-regression` (tip pinned in following docs commit)

Ancestry checks:

- `02e9287` ∈ ancestry of tested tip: **YES**
- `bb3f1ca` ∈ ancestry: **YES**
- Diff `02e9287..4ce7301`: documentation only
  (`docs/reports/phase-8-9-0-functional-verification.md`)
- Working tree at start: clean; no unrelated uncommitted work

Git identity for commits: `Akira Yuzai <yuzai.akira@gmail.com>`

## 2. P0 fix review findings

Inspected `Chart.setDatafeed` / `clearManagedIndicators` /
`disposeManagedIndicator` in `src/chart.ts`.

Intended contract after the fix:

1. `stopDatafeed()` increments the request id and unsubscribes.
2. Managed indicators are cleared via `disposeManagedIndicator`, which:
   - cancels/disposes Worker sessions (`disposeWorkerIndicator`)
   - removes indicator output series from the model
   - disposes the indicator instance
   - deletes the managed map entry
3. Drawings and unrelated primary/user series are **not** cleared by
   `setDatafeed` (confirmed by regression: drawing id survives).
4. Stale in-flight `getBars` responses are ignored via `datafeedRequestId`.
5. Re-adding a previously used indicator id succeeds after cleanup.

Review conclusion: the patch addresses the confirmed orphan-series / incomplete
Worker cleanup defect and matches the public lifecycle semantics exercised by
the regressions. Chromium/Firefox/Mobile Chrome evidence supports correctness;
WebKit/Mobile Safari official launch was unavailable here.

## 3. Targeted lifecycle verification

Expanded browser coverage in `tests/browser/datafeed-lifecycle.spec.ts`:

| Step | Result (Chromium / Firefox / Mobile Chrome) |
| --- | --- |
| Create chart + Datafeed A + SMA/RSI + Worker script + drawing | PASS |
| Output series present for indicators | PASS |
| Switch / in-flight replacement clears indicators + series immediately | PASS |
| No orphan `life-*` series; B data applied | PASS |
| Drawing preserved across feed replacement | PASS |
| Re-add prior indicator / worker ids | PASS |
| Rapid feed replacement under live updates | PASS |
| stopDatafeed + destroy → 0 subscriptions, 0 canvases | PASS |
| Stale historical response discarded | PASS |

Packed-package consumer (`scripts/phase-8-9-1-packed-datafeed-lifecycle.mjs`):
**PASS** — install `openkline-0.1.0.tgz`, replace datafeed, clear orphan series,
re-add id, destroy → 0 canvases.

## 4. Targeted five-browser matrix

Playwright `1.64.1`, config `playwright.portable.config.ts`,
`PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright`.

| Project | Lifecycle suite (4 tests) | Notes |
| --- | --- | --- |
| chromium | **4/4 PASS** | Playwright-managed Chromium on host |
| firefox | **4/4 PASS** | Playwright-managed Firefox on host |
| mobile-chrome | **4/4 PASS** | Pixel 7 emulation |
| webkit | **BLOCKED** | `browserType.launch` — missing host deps (`libicu74`, `libflite1`) |
| mobile-safari | **BLOCKED** | same WebKit dependency failure |

Official container status:

| Check | Result |
| --- | --- |
| `mcr.microsoft.com/playwright:v1.64.1-noble@sha256:47b510dd…` | **UNAVAILABLE** — `/var/run/docker.sock` missing; Docker daemon not running; no sudo |
| `/ms-playwright` | **ABSENT** |
| Host `~/.cache/ms-playwright` | Present (chromium-1248, firefox-1555, webkit-2370) but WebKit cannot launch without deps |

Because the digest-locked container could not be verified, these three-project
passes are **provisional host evidence**, not official five-browser acceptance.

## 5. Historical positive controls

Run on Chromium + Firefox (managed host binaries):

| Suite | Result |
| --- | --- |
| `chart.spec.ts` (interaction, series types, drawing resize) | PASS |
| `custom-datafeed.spec.ts` | PASS |
| `replay.spec.ts` (isolation + datafeed suspend/resubscribe) | PASS |
| `klinescript.spec.ts` (sync + Worker lifecycle) | PASS |
| React `lifecycle.spec.ts` (StrictMode / workspace / remount) | PASS (Playwright react config / system Chromium lane) |

WebKit/Studio positive controls: **NOT EXECUTED** (environment blocked).

## 6. Full official matrices

| Matrix | Status |
| --- | --- |
| `npm run browser:verify` | **NOT EXECUTED** — official container unavailable; host WebKit blocked |
| `npm run studio:browser:verify` | **NOT EXECUTED** — same |

Historical Phase 8.8.16 totals (75 standalone / 125 Studio) remain attached
**only** to baseline `bb3f1ca` and must not be cited for `02e9287+`.

## 7. Node and package regression

| Command | Result |
| --- | --- |
| `npm test` | **184/184 PASS** |
| `npm run typecheck` | **PASS** |
| `npm run api:check` | **PASS** (no removals/signature changes) |
| `npm run package:smoke` | **PASS** |
| `npm run package:portability` | **PASS** |
| `npm run distribution:check` | **PASS** |
| Packed datafeed lifecycle consumer | **PASS** |
| `scripts/consumer-preview-smoke.mjs` | FAIL locally — npm offline cache miss for locked `typescript@5.9.3` (environment), not a product API failure |

## 8. Performance regression

`npm run benchmark:browser` on the fix ancestry (local Chromium lane):

| Candles | Update frame ms | rAF FPS | Frame-work p95 ms | Remaining canvases |
| ---: | ---: | ---: | ---: | ---: |
| 1,000 | 1.057 | 63.94 | 1.7 | — |
| 10,000 | 0.695 | 62.80 | 1.3 | — |
| 100,000 | 0.646 | 61.86 | 1.2 | **0** after destroy |

Phase 8.9.0 observation (~0.72 ms append, ~62 FPS, 0 canvases): **no meaningful
append/FPS regression** under comparable local conditions. Correction-heavy
100k path remains expensive (~3.7 s for the benchmark’s correction batch) and
is unchanged in character from prior phases.

## 9. New defects

No new product defects confirmed.

Environment defects / blockers:

1. Docker daemon / socket unavailable → cannot verify required image digest.
2. Host WebKit missing shared libraries → cannot complete five-browser matrix
   outside the official container.

## 10. Final functional compatibility verdict

**`BLOCKED — OFFICIAL BROWSER ENVIRONMENT UNAVAILABLE`**

Conditions for upgrading to `FUNCTIONALLY VERIFIED — FULL FIVE-BROWSER PASS`:

1. Run on a host with
   `mcr.microsoft.com/playwright:v1.64.1-noble@sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea`.
2. Set `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`.
3. Pass targeted `tests/browser/datafeed-lifecycle.spec.ts` on all five
   portable projects.
4. Independently pass `npm run browser:verify` and
   `npm run studio:browser:verify` against the same exact product SHA.
5. Record expected/unexpected/flaky/skipped counts from those runs (do not
   hardcode 75/125).

See companion handoff:
`docs/reports/phase-8-9-1-trusted-browser-handoff.md`.
