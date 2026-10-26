# OpenKline Phase 8.7 Verification

Date: 2026-10-26  
Branch: `work`  
Status: **NOT RELEASE READY**

Phase 8.7 hardens accessibility and prepares visual review evidence. It does
not add charting, trading, backend, provider, or release scope. No GitHub
Actions, npm publication, release tag, GitHub release, license adoption, or
public baseline publication was performed.

## Scope and provenance

The starting checkout was clean on `work` at
`7fefa3060727beacb237cc2b66d4ec631dd528f8`, synchronized with `origin/work`.
The trusted five-project browser evidence remains the compact 70/70 pack for
source commit `19c86987453e2f5ae5572c4028ba9cb2e1f2f4aa`. Its consistency
validator passes, but that result predates Phase 8.7 and is not evidence that
the current revision ran in Firefox, WebKit, or mobile projects.

## Findings and fixes

| ID | Severity | Area | Reproduction / observation | Resolution | Regression evidence |
| --- | --- | --- | --- | --- | --- |
| A11Y-8.7-001 | Moderate | Studio modal keyboard navigation | Open Rename watchlist and press Tab repeatedly. Before the fix, focus could leave the `aria-modal="true"` dialog. | Added enabled-control focus containment in `61beddb1a0d25e466b05e70123ce76b62ad8f557`. | React Chromium accessibility suite: 3/3, including forward and reverse cycling, Escape, and restoration. |
| VIS-8.7-001 | Low | Visual review fixture | Repeated captures differed because demo quote labels used `Date.now()`. | Freeze `Date.now()` in the visual harness before app startup in `cf806cba1fdcabfc46ab16ef79353b6f97dedacd`; runtime provider behavior unchanged. | Visual review suite 2/2 on repeated runs with identical candidate hashes. |

No additional reproducible defect was found in the audited standalone Canvas
semantics, visible control names, live regions, focus-visible styling, chart
summary, empty state, touch-sized layout smoke, or dialog descriptions.

## Accessibility audit

Automated local coverage verifies:

- Canvas `role="img"`, `tabindex="0"`, data summary, and empty state;
- visible interactive controls have an accessible name;
- Studio status/live regions are attached;
- dialog role, name, description, input, Escape dismissal, focus trapping,
  and trigger-focus restoration;
- mobile-sized Studio interaction smoke.

The audit did not claim screen-reader output, a WCAG conformance level,
measured contrast ratios, physical-device touch targets, or complete manual
keyboard coverage. Reduced-motion is set to `reduce` for visual capture and
the Studio stylesheet contains no CSS animation/transition path found by the
audit; formal reduced-motion review remains open.

## Visual review

The existing review test uses locale `en-US`, UTC, device scale factor `1`,
reduced motion `reduce`, fixed viewports, disabled screenshot animations, the
private deterministic Studio fixture, and a fixed clock. It generated these
local Chromium candidates:

| Candidate | Browser | Viewport | Bytes | SHA-256 | Status |
| --- | --- | ---: | ---: | --- | --- |
| `studio-dark.png` | Chromium 154.0.8037.57 | 1280×900 | 477,760 | `8e90174eaf37fd5d165f43af4f19ade77e4b01df998a9de7dafa2609e87a0f92` | SCREENSHOT GENERATED |
| `studio-light.png` | Chromium 154.0.8037.57 | 1280×900 | 477,136 | `e34a3a6e96c150821a06e63c39ee8beb5cf0603a9dd7cdbb38762d4aa8f12712` | SCREENSHOT GENERATED |
| `studio-mobile.png` | Chromium 154.0.8037.57 | 390×844 | 481,421 | `39b272cca9c03005292c6a4aa6df6c297c2df7ebf1823b44f69d0e528a9797cf` | SCREENSHOT GENERATED |

The three files are ignored local artifacts. No visual baseline was approved,
committed, or compared. Owner/designated-reviewer inspection is required.

## Automated verification

| Check | Result |
| --- | --- |
| `npm run evidence:browser:check` | **PASS** — 70 records, 14 per trusted project, sanitization PASS |
| `npm run typecheck` | **PASS** |
| `npm test` | **PASS — 156/156** |
| `npm run api:check` | **PASS** — no removed or changed signatures |
| `npm run test:browser` | **PASS — 14/14 local system Chromium** |
| `npm run test:react:browser` | **PASS — 21/21 local system Chromium** |
| `npm run browser:diagnostic` | **PASS — 28/28 local system Chromium + Mobile Chrome emulation** |
| Visual review tests | **PASS — 2/2; repeated hashes stable; baseline pending** |
| `npm run benchmark:browser` | **PASS diagnostic** — results below |

`npm run release:readiness` completed at
`artifacts/release-readiness/2026-10-26T16-34-52-909Z/summary.json` with
`NOT READY`. Its serial Chromium diagnostic gate recorded a transient 2/28
timeout failure, while the managed-browser gate was correctly `BLOCKED` and
the manual/legal/owner gates remained open. The independent diagnostic rerun
then passed 28/28; the transient failure is retained in the readiness
artifact and is not reclassified as a code failure.

The local browser suites use system Chromium and do not replace the trusted
Playwright-managed evidence. No current-revision Firefox, WebKit, Mobile
Chrome, or Mobile Safari execution was performed in this environment.

## Canvas2D performance diagnostic

The latest local benchmark run used system Chromium `154.0.8037.57` with
1,000, 10,000, and 100,000 candles:

| Candles | RAF FPS | Frame interval median / p95 | Frame work median / p95 | Update-frame ms |
| ---: | ---: | ---: | ---: | ---: |
| 1,000 | 64.35 | 16.6 / 16.9 ms | 1.9 / 3.3 ms | 1.921 |
| 10,000 | 63.20 | 16.6 / 17.4 ms | 1.3 / 2.1 ms | 1.213 |
| 100,000 | 58.08 | 16.6 / 24.6 ms | 1.3 / 22.8 ms | 1.328 |

Heap was 161,334,475 bytes before destroy and 2,815,976 bytes after destroy;
remaining Canvas elements: `0`. A second run produced an anomalous 700 MB
pre-destroy sample, demonstrating host/runtime variability; it is retained as
an observation rather than treated as a code regression. These measurements
are diagnostic for this environment, not a universal FPS or memory claim.
No chart optimization was introduced because the Phase 8.7 changes do not
touch the O(1) append paths and the benchmark variance is not sufficient to
attribute a regression to them.

## Gate matrix

| Gate | Status | Evidence / owner action |
| --- | --- | --- |
| Automated accessibility smoke | **PASS locally** | Chromium tests cover names, canvas summary, focus, dialogs, live status. |
| Manual keyboard workflow | **PARTIAL / NOT FORMALLY ACCEPTED** | Targeted dialog cycle is automated; full workflow review remains open. |
| Screen-reader review | **NOT TESTED** | Requires authorized NVDA/JAWS/VoiceOver review. |
| Formal WCAG conformance | **NOT TESTED** | No owner-approved conformance target or qualified review. |
| Visual candidates | **PASS GENERATED** | Three stable local candidates; hashes above. |
| Approved visual baseline | **NOT TESTED / OWNER REVIEW** | No baseline was approved or committed. |
| Current managed five-browser matrix | **NOT TESTED / BLOCKED HERE** | Trusted 70/70 pack targets pre-Phase-8.7 source. |
| Physical Android/iOS devices | **NOT TESTED** | Emulation is not physical-device evidence. |
| Trusted evidence consistency | **PASS, HISTORICAL SCOPE** | Validator passes for source `19c8698…`; not current-revision evidence. |
| Legal/license and third-party notices | **OPEN** | Requires qualified counsel and owner approval. |
| Owner release authorization | **OPEN** | No release channel/version/publication authorized. |

## Required owner decisions

1. Approve a formal accessibility target and manual screen-reader procedure.
2. Review the three visual candidates and decide whether/where baselines may be
   stored; no baseline is approved by this report.
3. Decide whether physical-device testing is mandatory and name authorized
   devices/OS versions.
4. Authorize a trusted environment to rerun the current Phase 8.7 revision in
   Playwright-managed Firefox, WebKit, and mobile projects if required.
5. Obtain legal approval for the effective license and third-party notices.
6. Authorize release version, channel, and publication actions separately.

## Git and final decision

Phase 8.7 engineering commits were created with
`Akira Yuzai <yuzai.akira@gmail.com>` as author and committer and pushed to
`origin/work`:

- `61beddb1a0d25e466b05e70123ce76b62ad8f557` — dialog focus containment;
- `cf806cba1fdcabfc46ab16ef79353b6f97dedacd` — deterministic visual clock;
- `cb06f0c8f79428184a646dc14d63f1d371ebff03` — Phase 8.7 verification and
  audit documentation.

The listed commits were pushed to `origin/work`; no history was rewritten and
no force-push was used.

**Phase 8.7 is not release-ready.** The local engineering checks and targeted
accessibility/visual hardening are complete, but current-revision managed
cross-browser evidence, manual/formal accessibility, visual approval,
physical-device, legal, and owner-release gates remain open.
