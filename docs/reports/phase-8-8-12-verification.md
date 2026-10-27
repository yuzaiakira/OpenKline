# OpenKline Phase 8.8.12 Verification

Status: **OPEN — NOT RELEASE READY**

This report records the final-seven Studio investigation and local remediation
work. It does not turn local system-Chromium results into managed Firefox,
WebKit, or Mobile Safari evidence.

## Scope and provenance

Phase 8.8.11 trusted evidence tested source
`0e84d13ca83b81866900571ad798ca69de90911f` and recorded 70/70 standalone
passes plus 113/120 Studio passes. The seven remaining Studio failures were:

| Project | Test family | Recorded failure | Phase 8.8.12 status |
| --- | --- | --- | --- |
| `studio-firefox` | Drawing anchor, workspace reload, replay restore | `Drawings (1)` never appeared after the mouse placement path | Local stale CSS/logical resize race reproduced and repaired; official Firefox rerun pending |
| `studio-webkit` | Paper trading | Exact `pending` status text was not found | No official root cause established; defensive session/quantity handling added; official WebKit rerun pending |
| `studio-mobile-safari` | Paper trading | Exact `pending` status text was not found | No official root cause established; defensive session/quantity handling added; official Mobile Safari rerun pending |
| `studio-webkit` | Local alert | `Studio close alert` text was not found | No official root cause established; defensive current-input handling added; official WebKit rerun pending |
| `studio-mobile-safari` | Local alert | `Studio close alert` text was not found | No official root cause established; defensive current-input handling added; official Mobile Safari rerun pending |

The seven identities are the three Firefox drawing tests, two WebKit/Safari
paper tests, and two WebKit/Safari alert tests. The integrated evidence pack
is under `docs/evidence/browser/phase-8-8-11/`; its source and result remain
unchanged and are validated by the repository evidence checker.

| Item | Value |
| --- | --- |
| Integrated evidence commit | `63992bd` |
| Current implementation source | `6e4dd92fd08dc50c23fead4f9c3c69b311aeddf5` |
| Playwright | `1.64.1` |
| Official image | `mcr.microsoft.com/playwright:v1.64.1-noble` |
| Image digest | `sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea` |

## Investigation and changes

### Firefox drawing trio

The local regression reproduced a concrete interaction race: CSS layout had
the current canvas size while the chart's logical interaction dimensions still
held a stale value because resize delivery was deferred. A pointer placed on a
visible candle could therefore be rejected by pane hit testing before an anchor
was registered. The chart now synchronizes interaction dimensions from the
canvas DOM box at the pointer/touch interaction boundary through a shared
helper. This keeps the existing scale, viewport, and drawing architecture
intact and does not alter financial data or drawing semantics.

The regression test passes 1/1 in local system Chromium. This is a confirmed
local mechanism, not an official Firefox result; the three Firefox identities
must still be rerun in the pinned Playwright environment.

### Paper trading

The Phase 8.8.11 trusted diagnostics showed no page errors, console errors, or
overflow and did not prove an engine rejection or a ResizeObserver failure.
The panel now protects active session ownership from stale cleanup and reads
the current quantity input value as a DOM-authoritative fallback before using
the existing paper-trading engine/risk path. These are bounded defensive
changes; they do not claim that WebKit/Safari's original missing `pending`
text has a confirmed root cause.

The focused local paper test passes 1/1, and the full local React/Studio suite
passes. Official WebKit and Mobile Safari verification remains required.

### Local alerts

The trusted failure showed no page errors, console errors, overflow, or
ResizeObserver indication. The alert card count was visible, but the expected
close-control text was not found, so the official cause is unresolved. Alert
creation now reads the current alert-name input as a DOM-authoritative fallback
before calling the existing alert engine. No browser-specific hardcoding,
forced click, or semantic change to alert persistence was introduced.

The focused local alert test passes 1/1. Official WebKit and Mobile Safari
verification remains required.

## Diagnostics

`tests/react-browser/studio-test.ts` now captures bounded, failure-oriented
diagnostics for the seven target families: canvas CSS/backing dimensions,
visible drawing summaries, live polite status text, paper account/order state
and bounded row statuses, alert count/names/remove controls, viewport and
overflow state, page/console errors, and interaction traces. It does not record
credentials, full DOM snapshots, or browser storage.

The diagnostics are evidence collection only. They do not suppress errors or
turn a missing browser executable into a behavioral result.

## Verification results

| Check | Result |
| --- | --- |
| Evidence validator tests | PASS — 11/11 |
| Versioned evidence validation | PASS — all repository packs; Phase 8.8.11 remains 70/70 standalone and 113/120 Studio |
| Node unit/integration tests | PASS — 167/167 |
| TypeScript typecheck | PASS |
| Public API declaration check | PASS — no removed, changed, or additive exports |
| Package portability and smoke checks | PASS |
| Distribution audit | PASS — 394 files; package size 339237 bytes; unpacked 1944099 bytes; SHA-1 `357be28f06942e0691efb595c04cc7fb5b254713` |
| Studio architecture check | PASS |
| Local system-Chromium React/Studio suite | PASS — 26/26; system Chromium `154.0.8037.57` |
| CSS/logical resize drawing regression | PASS — 1/1 in local system Chromium |
| Focused local paper and alert tests | PASS — 2/2 |
| Local browser diagnostic | PASS — 30/30; system Chromium only, not managed-browser evidence |
| Canvas2D benchmark | PASS — local observation; no regression claim |
| Release readiness | NOT READY — managed-browser compatibility blocked and manual gates remain open |

The latest local diagnostic artifact is
`artifacts/browser-diagnostic/2026-10-27T14-54-36-540Z`. The latest release
readiness summary is
`artifacts/release-readiness/2026-10-27T14-55-19-892Z/summary.json`.

## Performance and cleanup observation

The latest local system-Chromium benchmark measured the following host-specific
observations:

| Dataset | RAF FPS | Frame median / p95 | Frame-work median / p95 | Load |
| ---: | ---: | ---: | ---: | ---: |
| 1,000 candles | 63.94 | 16.7 / 18.4 ms | 2.2 / 3.0 ms | 28.6 ms |
| 10,000 candles | 54.57 | 16.7 / 36.5 ms | 1.9 / 5.4 ms | 95.5 ms |
| 100,000 candles | 60.85 | 16.7 / 17.2 ms | 1.3 / 2.4 ms | 1830 ms |

The benchmark observed `583878105` bytes before destroy, `2809374` bytes after
destroy, and zero remaining canvases. These are local observations, not a
cross-browser performance guarantee. The O(1) append paths and financial-data
accuracy were not changed.

## Acceptance matrix

| Criterion | Status | Evidence or remaining action |
| --- | --- | --- |
| Seven-failure ledger and bounded diagnostics | Implemented / locally verified | Evidence remains reproducible and versioned |
| Firefox drawing repair | Implemented / local mechanism verified | Run the three exact `studio-firefox` identities in the official container |
| Paper-trading compatibility repair | Implemented defensively / local tests verified | Root cause and WebKit/Mobile Safari behavior remain unverified |
| Alert compatibility repair | Implemented defensively / local tests verified | Root cause and WebKit/Mobile Safari behavior remain unverified |
| Standalone library behavior | Verified by prior trusted 70/70 evidence | Current-source standalone trusted rerun is not performed here |
| Full Studio five-project matrix | Open | Prior trusted result is 113/120; targeted current-source rerun is required first |
| Accessibility and visual approval | Not tested | Separate approved audits are required |
| Physical-device compatibility | Not tested | Separate real-device verification is required |
| Effective license and third-party notices | Open | Legal/ownership review remains required |
| Release authorization | Open | No publication or release authorization inferred |

Phase 8.8.12 therefore remains open. It must not be described as complete,
fully cross-browser compatible, or release-ready until the official targeted
Firefox/WebKit/Mobile Safari rerun produces real evidence and the independent
release gates are resolved.

## Git and publication boundary

Implementation and evidence-integration commits use
`Akira Yuzai <yuzai.akira@gmail.com>`. No GitHub Actions, npm publication,
release tag, GitHub release, license change, force-push, or public evidence
archive publication was performed for this increment.
