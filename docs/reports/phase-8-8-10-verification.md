# OpenKline Phase 8.8.10 Verification

Status: **OPEN — NOT RELEASE READY**

This report records the engineering work completed for Phase 8.8.10. It does
not turn local system-Chromium checks into managed Firefox, WebKit, or mobile
browser evidence.

## Provenance

| Item | Value |
| --- | --- |
| Current behavioral source | `e03d93722d743fda0c00e860ac1b41d07187214e` |
| Integrated Phase 8.8.9 evidence commit | `c5362f20544b09fefde41a78ec6b21a0aa64a34d` |
| Phase 8.8.9 tested source | `112213abb8383e78511b63de2f891a8a49e97536` |
| Playwright | `1.64.1` |
| Official image | `mcr.microsoft.com/playwright:v1.64.1-noble` |
| Image digest | `sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea` |

The trusted Phase 8.8.9 focused pack contains six records: one expected pass
and five unexpected failures. Its evidence remains preserved and validated;
the current cloud environment does not contain the managed Playwright
executables needed to rerun those projects.

## Implemented remediation

| Area | Change | Local evidence | Trusted-browser status |
| --- | --- | --- | --- |
| Touch harness | Removed `new Touch`/`new TouchEvent` construction. The fallback dispatches generic `touchstart`/`touchend` events with touch-list-shaped properties. The real Playwright touchscreen path remains intact. | Dedicated fallback test: 1/1; full React/Studio suite includes it. | WebKit rerun not available here. |
| Responsive controls | Bounded and wrapped `.topActions`; narrow multi-chart controls use a two-column layout with bounded controls and no page-wide overflow suppression. | Width assertions pass at 390, 412, 640, 800, and 1280 CSS pixels. | Managed Mobile Chrome rerun not available here. |
| Indicator transition | Added a stateful assertion for the active panel, notice, and `3 indicators` after Add. | Dedicated mobile transition test: 1/1. | No independent managed Mobile Chrome result claimed. |
| ResizeObserver | Coalesces observed dimensions and applies resize on the next animation frame (timeout fallback where needed), outside the observer callback; pending work is cancelled on destroy. | Typecheck, Node suite, and local Studio suite pass. Strict page-error assertions remain. | Trusted WebKit page-error confirmation remains required. |

No blanket page-error suppression, forced click, browser substitution, or
unrelated chart rewrite was introduced.

## Verification results

| Check | Result |
| --- | --- |
| Evidence validator tests | PASS — 9/9 |
| Versioned browser evidence validation | PASS — six packs; Phase 8.8.9 has 6 records, 1 expected, 5 unexpected |
| TypeScript typecheck | PASS |
| Node unit/integration tests | PASS — 165/165 |
| Focused React/Studio tests in local system Chromium | PASS — 14/14 |
| Generic touch fallback test | PASS — 1/1 |
| Responsive width test | PASS — 1/1 across five representative widths |
| Mobile indicator transition trace | PASS — 1/1 |
| Local browser diagnostic | PASS — 28/28 using system Chromium 154.0.8037.57; diagnostic only |
| API, package portability, package smoke, distribution, Next production build | PASS |
| Distribution check | PASS — 394 files; package size 339012 bytes; unpacked 1942793 bytes; SHA-1 `34ee154a3b1ac4c92f1507b5adda1184efe61bc0` |
| Release readiness | NOT READY — managed-browser compatibility blocked and manual gates open |

The release-readiness artifact is at
`artifacts/release-readiness/2026-10-27T10-21-52-514Z/summary.json`.
The managed-browser block is an executable-availability limitation, not a
passing or failing behavior result.

## Performance observation

The latest local Canvas2D benchmark used system Chromium 154:

| Dataset | FPS | Frame median / p95 | Frame-work median / p95 | Load |
| ---: | ---: | ---: | ---: | ---: |
| 1,000 candles | 64.16 | 16.7 / 17.1 ms | 1.7 / 3.8 ms | 19.4 ms |
| 10,000 candles | 61.98 | 16.6 / 16.9 ms | 1.5 / 1.8 ms | 134 ms |
| 100,000 candles | 63.33 | 16.7 / 16.9 ms | 1.2 / 1.6 ms | 1368.8 ms |

Heap observation was 711,211,692 bytes before destroy and 2,822,377 bytes after
destroy, with zero remaining canvases. An earlier release-readiness run was
noisier (52.82 FPS and 47.3 ms frame p95 at 100,000 candles), so these are
host-dependent observations, not a performance improvement claim. O(1)
append paths and financial-data behavior were not changed.

## Acceptance matrix

| Criterion | Status | Evidence or blocker |
| --- | --- | --- |
| WebKit-safe touch harness | Implemented / locally verified | Generic fallback 1/1; managed WebKit rerun open |
| Responsive multi-chart controls | Implemented / locally verified | Five-width test 1/1; managed Mobile Chrome rerun open |
| ResizeObserver causal repair | Implemented / locally verified | Deferred/coalesced resize path; trusted confirmation open |
| Mobile indicator flow | Locally verified | 1/1 transition trace; no trusted target result |
| Chromium current-source behavior | Verified locally | System Chromium only, not managed artifact |
| Firefox/WebKit/Mobile Chrome/Mobile Safari current-source behavior | Not tested here | Managed executables unavailable |
| Full cross-browser matrix | Open | Must run in the pinned official container |
| Physical-device compatibility | Not tested | Owner/trusted-device handoff required |
| Formal accessibility and visual approval | Not tested | Separate gates remain open |
| Legal and release authorization | Open | No authorization inferred |

Phase 8.8.10 therefore remains open and must not be described as full
cross-browser compatibility or release readiness.

## Git and publication policy

All implementation commits for this increment use
`Akira Yuzai <yuzai.akira@gmail.com>`. No GitHub Actions, npm publication,
release tag, GitHub release, license change, or force-push was performed.
