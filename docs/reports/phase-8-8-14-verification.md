# OpenKline Phase 8.8.14 Verification

Status: **OPEN — NOT RELEASE READY**

This report records the Phase 8.8.14 root-cause investigation and local
remediation work for the seven targeted Studio failures. It does not convert
system Chromium results into Firefox, WebKit, or Mobile Safari evidence.

## Scope and provenance

The sanitized Phase 8.8.13 evidence pack was integrated from the trusted
evidence branch and validated before implementation work. It records this
actual result against source `5062735097301ce22dd50f1f78f7f84cf96394e1`:

| Group | Browser/project | Records | Passed | Failed |
| --- | --- | ---: | ---: | ---: |
| F1 | `studio-firefox` drawing trio | 3 | 0 | 3 |
| F2 | `studio-webkit` paper + alert | 2 | 1 | 1 |
| F3 | `studio-mobile-safari` paper + alert | 2 | 0 | 2 |
| **Total** | | **7** | **1** | **6** |

The positive control is the Phase 8.8.13 `studio-webkit` paper-trading
identity. The six remaining failures were three Firefox drawing identities,
Mobile Safari paper trading, and WebKit plus Mobile Safari local alerts. The
full Studio and standalone matrices were intentionally not run because the
targeted failures remained.

Evidence provenance:

- Integrated Phase 8.8.13 evidence commit: `6438640`
- Evidence validator commit: `8022eba1978bae3d74b396481d5716bdf037b9c3`
- Phase 8.8.13 behavioral source: `6e4dd92fd08dc50c23fead4f9c3c69b311aeddf5`
- Phase 8.8.13 trusted archive SHA-256: `5da3924bf93794cfe641dff4854c32de8b43f6a7240c99e449922f5467c5721c`
- Official Playwright: `1.64.1`
- Official image: `mcr.microsoft.com/playwright:v1.64.1-noble`
- Official image digest: `sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea`
- Prior managed browser versions: Chromium `156.0.8078.4`, Firefox `157.0`, WebKit `27.2`

The Phase 8.8.14 implementation is commit
`8f845f6c0370d43744294f4c22301666d8257766` and was pushed to `origin/work`.

## Root-cause findings and changes

### Firefox drawing trio

The trusted diagnostics showed a canvas approximately 726 CSS pixels wide by
1,000 CSS pixels high in a 1280×720 viewport. The recorded pointer events
landed on controls, while no canvas placement was recorded and the drawing
summary remained `Drawings (0)`. There were no page or console errors. This
made the original Firefox failure consistent with an interaction-coordinate
and visibility problem in the test path, not proof of a chart-engine failure.

The drawing test harness now uses a shared `placeVisibleChartPoint` helper. It
reacquires the canvas rectangle after scrolling, clamps the requested point to
the visible viewport, verifies that `elementFromPoint` resolves to the canvas,
records bounded CSS/backing/viewport coordinates, and then uses native
Playwright mouse or touchscreen input. The existing touch-only fallback test
remains separate. The helper's `insidePrimaryPaneCandidate` flag is a bounded
test-harness guard, not a claim that a managed Firefox pane was verified.

This is a local harness correction, not an official Firefox result. The three
exact `studio-firefox` identities must still be executed against the pinned
Playwright-managed Firefox binary.

### WebKit and Mobile Safari alert input

Phase 8.8.13 showed `Alerts (1)` but the created name remained `Close crosses
threshold` after the trusted run attempted to fill `Studio close alert`.
There were no page or console errors. The alert form previously used a
controlled value and a document-wide query during submission, which left a
browser/form-state lifecycle ambiguity.

The form now uses a local input ref and native `onInput` plus React
`onChange` synchronization. Submission reads the active input ref, preserves
the existing alert-engine call and validation semantics, and exposes bounded
diagnostic data attributes for the input value, created name, and outcome.
No browser-specific name, forced click, or alert-engine bypass was added.

The local lifecycle regression passes in system Chromium. WebKit and Mobile
Safari behavior remain unverified until the trusted targeted rerun.

### Mobile Safari paper quantity

The Phase 8.8.13 Mobile Safari paper identity was rejected with
`Order exceeds the configured maximum notional`, while the WebKit desktop
paper identity passed. The evidence did not establish whether the cause was a
form value lifecycle issue, a fresh market-price/notional calculation, or a
real risk rejection.

The paper ticket now owns a local quantity ref, reads the current DOM value at
submission, captures bounded quantity/market-price/notional/outcome diagnostics,
and retains the existing risk engine and rejection semantics. It does not
raise limits, bypass validation, or manufacture a pending order.

The local paper lifecycle regression passes in system Chromium. The actual
Mobile Safari risk outcome remains unverified and must be observed in the
official managed environment.

## Verification results

| Check | Result |
| --- | --- |
| Phase 8.8.13 evidence validator tests | PASS — 13/13 |
| Versioned browser evidence validation | PASS — all repository packs, including 8.8.13's 1/7 result |
| Node unit/integration tests | PASS — 169/169 |
| TypeScript typecheck | PASS |
| Public API compatibility | PASS — no removed or changed exports |
| Package portability | PASS |
| Package smoke install | PASS — local tarball installed as ESM consumer |
| Distribution audit | PASS — 394 files; 339,237 bytes packed; 1,944,099 bytes unpacked; SHA-1 `357be28f06942e0691efb595c04cc7fb5b254713` |
| Studio separation check | PASS |
| Full local React/Studio Chromium suite | PASS — 27/27 |
| Focused drawing/paper/alert regressions | PASS — 6/6 |
| Current local diagnostic | PASS — 30/30, commit `8f845f6`, system Chromium only |
| Release-readiness workflow | NOT READY — managed-browser compatibility blocked; manual/legal/release gates remain open |
| Trusted managed Firefox/WebKit/Mobile Safari targeted rerun | NOT RUN in this cloud environment |
| Full five-project Studio matrix | NOT RUN; targeted gate remains open |
| Physical-device compatibility | NOT TESTED |
| Formal accessibility and visual approval | NOT TESTED by this phase |
| Legal, owner, and release authorization | OPEN |

The current local diagnostic used system Chromium `154.0.8037.57` through the
explicit system executable and Playwright `1.64.1`, plus Mobile Chrome
emulation. It is engineering evidence only. The local Canvas2D benchmark also
passed with these host observations:

The final local release-readiness run completed with all executable local
engineering gates passing, but reported `NOT READY` because the cloud cannot
provide the official managed-browser executables and because formal
accessibility, visual, physical-device, legal, third-party-notice, owner, and
release-authorization gates remain open. Its untracked local summary was
written under `artifacts/release-readiness/2026-10-27T17-21-11-259Z/`; it was
not added to the repository.

| Dataset | Load | RAF FPS | Frame median / p95 | Update-frame |
| ---: | ---: | ---: | ---: | ---: |
| 1,000 candles | 24.3 ms | 63.94 | 16.7 / 17.0 ms | 2.23 ms |
| 10,000 candles | 96.8 ms | 61.89 | 16.7 / 17.6 ms | 1.19 ms |
| 100,000 candles | 1,414.5 ms | 62.33 | 16.7 / 16.8 ms | 1.121 ms |

The benchmark observed 634,930,889 bytes before destruction, 2,810,326 bytes
after destruction, and zero remaining canvases. These are host-specific
observations, not cross-browser performance guarantees. No O(1) append path,
financial calculation, or risk semantic was changed.

## Acceptance matrix

| Criterion | Status | Required next action |
| --- | --- | --- |
| Integrate and validate prior targeted evidence | Verified | Preserve the 1/7 result and archive checksum |
| Firefox drawing root-cause remediation | Implemented / locally verified | Run the three exact `studio-firefox` identities in the official container |
| WebKit paper positive control | Previously verified | Preserve as the Phase 8.13 positive control; rerun current source for acceptance |
| Mobile Safari paper remediation | Implemented defensively / locally verified | Observe actual risk outcome in managed Mobile Safari |
| WebKit alert remediation | Implemented defensively / locally verified | Verify input lifecycle and alert removal in managed WebKit |
| Mobile Safari alert remediation | Implemented defensively / locally verified | Verify input lifecycle and alert removal in managed Mobile Safari |
| Full Studio five-project matrix | Open | Do not run/claim it until all six targeted failures pass |
| Physical-device compatibility | Open | Perform separately on approved physical devices |
| Accessibility and visual approval | Open | Complete approved manual/automated gates |
| Legal and release authorization | Open | Obtain required owner/legal approvals |

Phase 8.8.14 remains open. It must not be described as full cross-browser
compatibility or release-ready. No npm package, tag, GitHub release, license,
or GitHub Actions workflow was changed.

## Git verification

The implementation commit was created and pushed with
`Akira Yuzai <yuzai.akira@gmail.com>` as both author and committer. The
documentation commit will be recorded separately after this report and its
handoff are verified. No force-push or history rewrite was used.
