# OpenKline Phase 8.11 — Cloud Initialization and Chart UX Verification

## Verdict

**Engineering branch ready for review; release and cross-browser gates remain
open.** A focused core interaction defect was reproduced and fixed. The cloud
environment verified Node, package, distribution, system-Chromium, React/Studio,
stress, and benchmark workflows. The official Playwright-managed five-browser
suite could not be run because the pinned Docker image was unavailable in this
restricted environment.

No release, npm publication, license change, GitHub Actions workflow, or merge
was performed.

## Source and environment

| Item | Result |
| --- | --- |
| Starting branch | `main` |
| Starting SHA | `4325884b9b3364201cb28ab9adbf652bcbeffbf4` |
| Feature branch | `phase-8.11-ux` |
| Source change commit | `83a1a93b72c0d24bcd98e30c918d2bc18ebbd101` |
| Git identity | `Akira Yuzai <yuzai.akira@gmail.com>` |
| Node / npm | `v24.19.0` / `11.9.0` |
| Playwright package | `1.64.1` |
| Available browser | system Chromium `154.0.8037.57` |
| Network policy | restricted/enforced cloud egress |
| Docker daemon | available; Docker-in-Docker `28.4.0` |

The repository was fetched from `origin/main`, verified at the expected SHA,
and the feature branch was created from that exact commit. No obsolete branch
was restored or used.

The first root `npm ci` attempt used the host default cache and failed because
`/home/agent/.npm` was unavailable. Re-running with
`NPM_CONFIG_CACHE=/tmp/openkline-npm-cache` passed. Root and
`examples/nextjs-app-router` lockfile installs completed with that cache.

## Verification matrix

| Area | Command / evidence | Result |
| --- | --- | --- |
| TypeScript | `npm run typecheck` | PASS |
| Node and integration tests | `npm test` | **186/186 PASS** |
| Public API | `npm run api:check` | PASS; no removed/changed exports |
| Package portability | `npm run package:portability` | PASS; zero runtime dependencies |
| Package consumer | `npm run package:smoke` | PASS; local tarball ESM consumer |
| Distribution audit | `npm run distribution:check` | PASS; 394 files, no problems |
| Studio separation | `npm run studio:check` | PASS; Studio remains private |
| Vanilla browser | `npm run test:browser` | **20/20 PASS**, system Chromium |
| React/Studio browser | `npm run test:react:browser` | **27/27 PASS**, system Chromium |
| Phase 8.10 CI stress | `npm run stress:ci` | PASS; Node and browser portions |
| Browser benchmark | `npm run benchmark:browser` | PASS; observations below |

The standalone browser tests include the new RTL regression. The React tests
cover lifecycle, workspace, touch-sized responsive layout, drawings,
indicators, replay, paper trading, screener, optimization, accessibility
smoke, and visual-review workflows. These are Chromium engineering results,
not certification of other engines or physical devices.

## Confirmed defect and focused fix

### P1 core defect: RTL wheel-zoom anchor

The chart wheel handler previously divided the page-relative `offsetX` by the
full canvas width and passed that value directly to the logical time viewport.
With `direction: "rtl"`, a wheel zoom at the same pointer moved the crosshair
time by approximately 10.08 hours in the reproducible Chromium regression
(before `1767277462495`, after `1767313758699`). This was a core-library
interaction defect, not a private Studio-only issue.

`Chart` now derives the anchor from the primary plot bounds and converts the
visual fraction to a logical RTL fraction before calling the existing viewport
zoom path. The change preserves the shared viewport architecture and does not
alter financial data or public API shape.

Regression command:

```text
npx playwright test --config playwright.config.ts --project=chromium tests/browser/rtl.spec.ts
```

Result: **1/1 PASS**. The same pointer remains within one hour of its prior
crosshair time after zoom; the tolerance accounts for discrete candle
viewport rounding.

### Stress harness race

The Phase 8.10 browser stress harness could race the vanilla example module:
the example attempted to mount against a document whose `#chart` had already
been replaced, producing `clientWidth` on `null`. The harness now commits a
same-origin navigation before replacing the document, so dynamic imports keep
a valid origin without executing the example's initial mount. This is a test
harness correction, not a product defect.

The final CI stress run reported 4,000 realtime events, 311 rejected invalid
events, 40/40 KlineScript, replay, backtest-cancellation, and paper-trading
rounds, zero page errors, zero worker orphans, and zero canvases after cleanup.

## Performance and cleanup

The cloud system-Chromium benchmark measured:

| Candles | FPS | frame interval p95 | frame work p95 | update frame |
| ---: | ---: | ---: | ---: | ---: |
| 1,000 | 63.36 | 18.9 ms | 4.7 ms | 1.997 ms |
| 10,000 | 61.54 | 20.0 ms | 2.3 ms | 1.534 ms |
| 100,000 | **62.47** | 17.1 ms | 5.5 ms | 1.242 ms |

At 100,000 candles, the observed heap was 615,304,115 bytes before destroy
and 2,812,212 bytes after destroy; remaining canvas count was **0**. Heap
values are cloud/browser observations and are not equivalent to the previous
Manjaro official-container measurements. The approximately 62 FPS result is
consistent with the preserved baseline; no measurable regression requiring
new optimization work was found. O(1) append paths were not changed.

Historical evidence remains the source of truth for the prior official
five-browser and sustained stress baselines, including the approximately
62 FPS / zero-canvas baseline in the Phase 8.9.2 and Phase 8.10 reports.

## Browser and device limitations

The project uses Playwright `1.64.1` and requires the official image
`mcr.microsoft.com/playwright:v1.64.1-noble` for managed Firefox, WebKit,
and mobile emulation. The cloud Docker daemon was available, but pulling the
image failed after supported retries with:

```text
error pulling image configuration: download failed after attempts=6: Forbidden
```

The image was not installed in the cloud environment. No TLS verification was
disabled, no arbitrary browser binary was substituted, and no endless CDN
retry was attempted. Therefore these remain **not tested in this
environment**:

- Playwright-managed Firefox;
- Playwright-managed WebKit;
- Mobile Safari emulation;
- the exact official five-browser matrix on this source commit;
- physical Android/iOS devices;
- native assistive-technology review;
- formal Persian/RTL visual and device review.

Core locale/timezone/direction APIs are present, and RTL wheel behavior is now
covered. Existing Chromium Studio tests verify responsive and touch-sized
behavior, but they do not close the blocked browser or physical-device gates.

## Acceptance status

| Criterion | Status | Evidence / remaining action |
| --- | --- | --- |
| Start from consolidated `main` | VERIFIED | expected starting SHA |
| P0/P1 core defect investigation | VERIFIED | RTL wheel anchor fixed and covered |
| Studio workflow smoke | VERIFIED locally | 27/27 Chromium; other engines open |
| Node/API/package/distribution checks | VERIFIED | all listed commands pass |
| Sustained lifecycle stress | VERIFIED locally | Phase 8.10 CI profile passes |
| Performance regression check | VERIFIED locally | ~62.47 FPS at 100k; zero canvases |
| Official Firefox/WebKit/mobile browser gate | OPEN | Docker image pull forbidden |
| Physical-device compatibility | NOT TESTED | no devices in cloud |
| Release/publication/legal gates | OPEN | explicitly out of scope |

The branch is reviewable and pushed to `origin/phase-8.11-ux`; it must not be
merged without owner approval. Full cross-browser compatibility and final
release readiness are not claimed.
