# Accessibility audit status

Status: **Automated review improved; formal conformance gate open**

The local React/Next test
[`tests/react-browser/accessibility.spec.ts`](../../tests/react-browser/accessibility.spec.ts)
checks visible interactive controls for accessible names, keyboard focus, live
status attachment, and dialog semantics. The existing UI tests also exercise
touch-sized layouts, accessible selectors, confirmation dialogs, and page-error
cleanup.

Phase 8.6 adds regression coverage for dialog focus restoration and Escape
closure, a keyboard-focusable chart canvas with a dynamic text summary, and an
empty-chart summary (`Financial price chart; no data loaded`). The core chart
keeps the Canvas2D surface as `role="img"` and updates its summary with visible
bars/time points, latest close when available, visible series, and pane count.
This is an overview for assistive technology, not a full data-table
replacement.

This is not an WCAG conformance claim. The repository has not completed a
manual keyboard audit across all workflows, screen-reader verification,
reduced-motion review, color-contrast measurement, or physical-device touch
target review. No `axe` dependency was added merely to imply conformance.

## Phase 8.7 audit and remediation

The Phase 8.7 audit identified one reproducible Studio issue in the custom
modal implementation. Before remediation, the dialog used `aria-modal="true"`
and restored focus on close but allowed Tab and Shift+Tab to move focus behind
the modal. This was a moderate keyboard-accessibility finding because it could
expose controls outside the active task to keyboard users.

Commit `61beddb1a0d25e466b05e70123ce76b62ad8f557` adds a local focus trap for
enabled dialog controls while preserving Escape dismissal and trigger-focus
restoration. The React browser suite now verifies the full input → Cancel →
Apply → input cycle in both directions. No additional reproducible defect was
found in the audited Canvas summary, named controls, live status regions,
dialog semantics, touch-sized layout smoke, or visible focus treatment.

The visual-review harness also pins the clock used by the deterministic demo
quote provider. This is a test-fixture correction, not a runtime behavior
change; without it, quote labels could vary between screenshots.

## Phase 8.8 contrast and reduced-motion audit

The Phase 8.8 audit measures rendered Studio colors in Chromium rather than
inferring ratios from screenshots. WCAG 2.2 AA values below are technical
reference thresholds only; the owner has not adopted a formal conformance
target.

| Element / state | Foreground | Effective background | Measured ratio | Reference |
| --- | --- | --- | ---: | --- |
| Primary button text | `#e7eef9` | `#132138` | 13.82:1 | Normal text 4.5:1 |
| Muted header text | `#9eb0c9` | `#0d192b` | 7.98:1 | Normal text 4.5:1 |
| Live status text | `#9eb0c9` | `#0b1525` | 8.28:1 | Normal text 4.5:1 |
| Placeholder text | `#9eb0c9` | `#132138` | 7.30:1 | Normal text 4.5:1 |
| Disabled button text | `#e7eef9` | `#132138` | 13.82:1 | Reference only; disabled-state interpretation applies |
| Control border | `#53729a` | `#111c2f` | 3.56:1 | Essential non-text UI 3:1 |
| Focus outline | `#fbbf24` | `#132138` | 9.66:1 | Essential non-text UI 3:1 |

Two real Studio findings were fixed in commit
`f44e1b8011ced9eb7c04eb74c0f653a99897cadb`: the browser-default placeholder
color measured approximately 3.50:1 before correction, and the prior shared
border `#2d405d` measured 1.54:1 against the control fill. The updated
placeholder and border tokens are covered by
`tests/react-browser/contrast-audit.spec.ts`. No user-configured chart series,
indicator, drawing, or theme colors were changed.

The public Canvas themes were measured separately from their direct rendered
colors. Light-theme text is 6.46:1 on white; light up/down candle colors are
3.30:1 and 4.83:1, and the light crosshair is 4.76:1. Dark-theme text,
up/down candles, and crosshair are 8.68:1, 7.79:1, 4.71:1, and 6.92:1 on
the dark background. Light/dark band fills composited at their configured
opacities measure 1.25:1 and 1.42:1; grid and border strokes are decorative
chart structure rather than text and require human interpretation. These
measurements do not override consumer-supplied financial colors.

With `prefers-reduced-motion: reduce`, Chromium observed zero document
animations and no non-zero CSS transition durations in the Studio. Necessary
data updates, replay timers, and Worker progress are not disabled. Manual
observation of live updates, replay, and assistive-technology behavior
remains open.

## Phase 8.6.1 browser evidence

The compact trusted-machine evidence pack records the accessibility test
scenario on all five Playwright-managed projects for source commit
`19c86987453e2f5ae5572c4028ba9cb2e1f2f4aa`: Chromium, Firefox, WebKit,
Mobile Chrome emulation, and Mobile Safari emulation each contain 14/14
passing records. The cloud validator confirms the records are complete,
unique, and internally consistent; it did not execute those browsers or
recompute the original archive.

This is stronger automated browser evidence for the chart empty-state and
interaction assertions, but it remains an automated behavior result. It does
not establish a formal WCAG target, screen-reader output, contrast ratio,
reduced-motion conformance, native pinch behavior, or physical-device support.
Those decisions and manual checks remain explicit owner gates.

## Review checklist

| Area | Status | Evidence / next action |
| --- | --- | --- |
| Accessible control names | PASS locally | Automated visible-control audit and existing labels. |
| Keyboard focus smoke | PASS locally | Tab focus, canvas focus, and dialog controls are exercised. |
| Dialog semantics | PASS locally | Rename dialog role/name/description/input/cancel behavior. |
| Dialog focus restoration | PASS locally | Cancel, confirm, and Escape return focus to the triggering control. |
| Dialog focus containment | PASS locally | React browser coverage verifies Tab and Shift+Tab remain inside the modal. |
| Canvas text alternative | PASS locally | Data and empty-chart summaries are tested in Chromium. |
| Live status/error semantics | PASS locally | Existing `aria-live` and page-error assertions. |
| Screen reader behavior | NOT TESTED | Manual NVDA/JAWS/VoiceOver review required. |
| Reduced motion | NOT TESTED | Review animation/timer behavior with prefers-reduced-motion. |
| Color contrast | NOT TESTED | Measure representative themes and states. |
| Physical touch targets | NOT TESTED | Validate on authorized devices, not emulation alone. |

Phase 8.8 updates the local automated contrast status to **PASS for the
measured Studio samples**, while the overall formal accessibility gate remains
**NOT TESTED** because manual keyboard, screen-reader, physical-device, and
owner conformance decisions are still outstanding.

## Phase 8.8.2 Studio viewport and compatibility investigation

The trusted supplemental aggregate was not promoted to a Studio compatibility
claim: it recorded 75 expected functional cases with 30 failures (WebKit 3,
Mobile Chrome 16, Mobile Safari 11), but the compact evidence contains no
failure names, errors, or traces. The available cloud diagnostic reproduced a
different but concrete environment condition: Playwright reported a 390/412px
device viewport while system Chromium exposed an 870px layout viewport. This
made responsive CSS breakpoints and pointer hit-testing unsuitable for
classifying the managed mobile failures.

The private Next.js Studio now declares `width=device-width` and
`initial-scale=1` through the App Router viewport contract. The existing
touch-sized Studio test asserts the metadata, and the local Chromium suite
passes 23/23. The focused cloud diagnostic confirmed the metadata is rendered,
but the system browser still exposes the non-device layout viewport; no full
post-fix mobile compatibility claim is made. The formal accessibility gate,
physical-device review, and trusted managed-browser Studio rerun remain open.

The trusted 70/70 five-project evidence pack predates Phase 8.7 and targets
source commit `19c86987453e2f5ae5572c4028ba9cb2e1f2f4aa`; it must not be used
to claim that the Phase 8.7 fix was executed in Firefox, WebKit, or mobile
projects. Current Phase 8.7 browser verification is local system Chromium.

Any formal support statement requires owner-approved criteria and review of
manual evidence; automated checks must not silently close this gate.
