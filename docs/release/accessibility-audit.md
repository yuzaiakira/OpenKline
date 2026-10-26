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

The trusted 70/70 five-project evidence pack predates Phase 8.7 and targets
source commit `19c86987453e2f5ae5572c4028ba9cb2e1f2f4aa`; it must not be used
to claim that the Phase 8.7 fix was executed in Firefox, WebKit, or mobile
projects. Current Phase 8.7 browser verification is local system Chromium.

Any formal support statement requires owner-approved criteria and review of
manual evidence; automated checks must not silently close this gate.
