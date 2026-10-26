# OpenKline Phase 8.8 Verification

Date: 2026-10-26  
Branch: `work`  
Implementation source commit: `64ddc323b8626cc6c74e38c78b58ab2a73dd124f`  
Status: **NOT RELEASE READY**

Phase 8.8 completes the cloud-verifiable accessibility, contrast, reduced-
motion, browser-reliability, and visual-review work. It does not add product
scope, change the public API, alter financial chart color contracts, or publish
anything.

## Findings and remediation

| ID | Severity | Finding / reproduction | Resolution | Verification |
| --- | --- | --- | --- | --- |
| CONTRAST-8.8-001 | Moderate | Default placeholder text measured about 3.50:1 on `#132138`, below the 4.5:1 normal-text reference. | Studio placeholders now use the existing `--muted` token with explicit opacity. | Rendered contrast test measures 7.30:1. |
| CONTRAST-8.8-002 | Moderate | Studio control border `#2d405d` measured 1.54:1 against the control fill, below the 3:1 essential non-text reference. | Studio border token changed to `#53729a`; financial chart themes were not changed. | Rendered contrast test measures 3.56:1 against panel background. |
| VIS-8.8-001 | Low | Dark/light review captures could occur before initial Canvas/theme repaint. | Review harness waits for actual Canvas pixels, dynamic data summary, deterministic quote state, theme repaint, and two animation frames. | Two consecutive runs produced identical hashes for all candidates. |
| REL-8.8-001 | Observed | One prior release-readiness run recorded 2/28 local Chromium diagnostic timeouts. | Repeated current-revision diagnostics; no reproducible root cause and no blanket timeout or skipped coverage added. | Two sequential runs each passed 28/28. |

No additional reproducible keyboard, Canvas semantics, cleanup, mobile-layout,
or public-API defect was found. The Phase 8.7 modal focus trap remains intact.

## Measured contrast audit

Measurements were taken from rendered Chromium computed styles and effective
ancestor backgrounds. Ratios are technical WCAG 2.2 AA reference measurements,
not an owner-approved conformance commitment.

| Sample | Foreground | Effective background | Ratio | Reference interpretation |
| --- | --- | --- | ---: | --- |
| Studio primary button text | `#e7eef9` | `#132138` | 13.82:1 | Normal text reference 4.5:1: measured pass |
| Studio muted header text | `#9eb0c9` | `#0d192b` | 7.98:1 | Normal text reference: measured pass |
| Studio live status | `#9eb0c9` | `#0b1525` | 8.28:1 | Normal text reference: measured pass |
| Studio placeholder | `#9eb0c9` | `#132138` | 7.30:1 | Normal text reference: measured pass |
| Studio disabled button text | `#e7eef9` | `#132138` | 13.82:1 | Disabled-state interpretation remains human-reviewed |
| Studio control border | `#53729a` | `#111c2f` | 3.56:1 | Essential non-text reference 3:1: measured pass |
| Studio focus outline | `#fbbf24` | `#132138` | 9.66:1 | Essential non-text reference: measured pass |

Direct public Canvas theme measurements are recorded separately because the
chart is rendered by Canvas2D and accepts consumer styles:

| Theme | Text | Up candle | Down candle | Crosshair | Background |
| --- | ---: | ---: | ---: | ---: | --- |
| Light | 6.46:1 | 3.30:1 | 4.83:1 | 4.76:1 | `#ffffff` |
| Dark | 8.68:1 | 7.79:1 | 4.71:1 | 6.92:1 | `#111827` |

Light/dark band fills composited at configured opacity measured 1.25:1 and
1.42:1 respectively. Grid and border strokes measured 1.21/1.33 (light) and
1.37/1.71 (dark). They are decorative chart structure rather than text; the
owner/designated reviewer must decide whether any are essential non-text
indicators. Consumer-supplied financial series, indicator, and drawing colors
were not rewritten to satisfy an arbitrary global palette.

## Reduced motion and keyboard audit

With `prefers-reduced-motion: reduce`, the automated Studio test observed:

- the media query active;
- zero document animations;
- no non-zero CSS transition durations.

Required market updates, replay timers, and Worker progress were not disabled.
Manual observation of those workflows and screen-reader output remains open.

Keyboard coverage remains:

- named controls and Tab focus;
- Canvas focus and text summary;
- dialog initial focus, Tab/Shift+Tab containment, Escape dismissal, and
  trigger-focus restoration;
- disabled controls and mobile-sized Studio selectors.

The automated checks do not constitute a full manual keyboard audit, screen-
reader test, physical-device test, or formal WCAG assessment.

## Browser diagnostic reliability

The prior transient event was recorded in the Phase 8.7 readiness artifact:
`artifacts/release-readiness/2026-10-26T16-34-52-909Z/summary.json`. Its
serial local Chromium diagnostic had 2 unexpected timeouts while the later
independent run passed 28/28. Phase 8.8 ran the same current-revision
diagnostic twice sequentially:

| Run | Timestamp | Projects | Result |
| --- | --- | --- | --- |
| 1 | `2026-10-26T16-49-23Z` | Chromium + Mobile Chrome emulation | 28/28, 0 unexpected |
| 2 | `2026-10-26T16-49-51Z` | Chromium + Mobile Chrome emulation | 28/28, 0 unexpected |

Both used system Chromium `154.0.8037.57`, Playwright `1.64.1`, the existing
web-server readiness URL, isolated diagnostic output, and normal cleanup. The
timeout was not reproducible; resource/startup contention is a plausible
hypothesis but not an established root cause. No timeout blanket, sleep,
skipped assertion, or reduced coverage was introduced.

## Visual stability

The review harness controls locale `en-US`, UTC, device scale factor `1`,
reduced motion `reduce`, fixed viewports, fixed clock, deterministic fixture,
and disabled screenshot animations. It additionally waits for rendered Canvas
state and data readiness. Latest candidates from the stable repeated run:

| Candidate | Browser | Viewport | Bytes | SHA-256 | Status |
| --- | --- | ---: | ---: | --- | --- |
| `studio-dark.png` | Chromium 154.0.8037.57 | 1280×900 | 480,055 | `108319e9cf360101acad551f054fd3b71ff549f81e892853e28e49fa2aa822c3` | SCREENSHOT GENERATED |
| `studio-light.png` | Chromium 154.0.8037.57 | 1280×900 | 479,262 | `dffa0bd473509a9e2db87806a9a6f473a30949b361c961ea35e1a47dd9aae6c1` | SCREENSHOT GENERATED |
| `studio-mobile.png` | Chromium 154.0.8037.57 | 390×844 | 483,813 | `bdbc524c044e4624440c088d3335486866b928be8fe8bb46a7d0243d76d802c5` | SCREENSHOT GENERATED |

The files are ignored local artifacts. No baseline was approved, committed,
published, or used to weaken a diff.

## Performance and cleanup

Two identical-workload local system-Chromium runs showed expected host noise:

| Run | 1k FPS | 10k FPS | 100k FPS | Heap before destroy | Heap after destroy | Canvases left |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A | 63.69 | 62.95 | 48.43 | 166,295,011 | 2,815,560 | 0 |
| B | 63.57 | 62.83 | 60.90 | 161,226,662 | 2,816,320 | 0 |

The 100k frame-work p95 was 3.8 ms in run A and 27.4 ms in run B. These
measurements are retained as diagnostic observations, not universal claims or
proof of a code regression. Phase 8.8 did not touch chart append/update paths;
no optimization was justified by this variance. Cleanup remains verified.

## Verification matrix

| Check | Result |
| --- | --- |
| `npm run typecheck` | **PASS** |
| `npm test` | **PASS — 156/156** |
| `npm run api:check` | **PASS — no removed or changed signatures** |
| `npm run package:portability` | **PASS — zero core/React runtime dependencies** |
| `npm run package:smoke` | **PASS — packed ESM consumer** |
| `npm run distribution:check` | **PASS — 394 files, no problems** |
| `npm run studio:check` | **PASS — Studio remains private** |
| `npm run test:browser` | **PASS — 14/14 local system Chromium** |
| `npm run test:react:browser` | **PASS — 23/23 local system Chromium** |
| `npm run browser:diagnostic` | **PASS — 28/28, repeated twice** |
| Contrast audit | **PASS — measured Studio samples** |
| Reduced-motion audit | **PASS — automated smoke; manual review open** |
| Visual review | **PASS — 2/2; repeated hashes stable; baseline pending** |
| `npm run evidence:browser:check` | **PASS — historical 70 records; source remains 19c8698…** |
| Next.js production build | **PASS when run by release readiness** |

The local browser results use system Chromium. The compact trusted 70/70
Playwright-managed matrix remains historical evidence for source commit
`19c86987453e2f5ae5572c4028ba9cb2e1f2f4aa`; it was not relabeled for Phase
8.8 and no current-revision Firefox, WebKit, or mobile Safari execution was
performed in this cloud environment.

## Release gate matrix

| Gate | Status | Notes |
| --- | --- | --- |
| Automated accessibility tests | **PASS locally** | 23 React/Studio tests include contrast and reduced-motion checks. |
| Measured Studio contrast | **PASS for sampled elements** | Ratios above; not a formal conformance claim. |
| Reduced-motion automation | **PASS locally** | No decorative animation/transition path observed. |
| Manual keyboard testing | **PARTIAL / OPEN** | Modal workflows automated; full manual workflow remains. |
| Screen-reader testing | **NOT TESTED** | Authorized NVDA/JAWS/VoiceOver review required. |
| Formal WCAG conformance | **NOT TESTED** | No owner-approved target or qualified sign-off. |
| Visual candidates | **PASS GENERATED** | Stable candidates; no approved baseline. |
| Current-revision five-browser verification | **NOT TESTED / BLOCKED HERE** | Trusted 70/70 is historical. |
| Physical devices | **NOT TESTED** | Emulation is not physical-device evidence. |
| Legal/license/third-party notices | **OPEN** | Requires qualified counsel and owner approval. |
| Publication authorization | **OPEN** | No npm, tag, release, or public publication authorized. |

## Handoff and owner decisions

The next trusted-machine task must check out the final Phase 8.8 `origin/work`
commit, not `19c8698…`, and rerun the five Playwright-managed projects. It must
preserve historical evidence and must not claim physical-device compatibility.

Owner decisions still required:

1. Approve a formal accessibility target and manual screen-reader procedure.
2. Review candidate screenshots and decide whether/where a baseline may be
   stored.
3. Decide whether physical Android/iOS testing is mandatory.
4. Authorize current-revision trusted-machine browser verification.
5. Obtain legal and third-party-notice approval.
6. Authorize release version, channel, and publication separately.

## Git and final decision

The implementation and visual-reliability commits use
`Akira Yuzai <yuzai.akira@gmail.com>` as both author and committer:

- `f44e1b8011ced9eb7c04eb74c0f653a99897cadb` — Studio contrast and
  reduced-motion coverage;
- `64ddc323b8626cc6c74e38c78b58ab2a73dd124f` — deterministic Canvas readiness
  waits.

Documentation changes are committed and pushed separately after the final
readiness run. No force-push, GitHub Actions, tag, release, npm publication,
license activation, or external evidence transfer was performed.

**Phase 8.8 remains NOT RELEASE READY.** Cloud-verifiable engineering work is
complete, but current-revision trusted five-browser verification, manual and
formal accessibility, visual baseline approval, physical-device evidence,
legal approval, and publication authorization remain open.
