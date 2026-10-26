# Accessibility audit status

Status: **Automated review prepared; formal conformance gate open**

The local React/Next test
[`tests/react-browser/accessibility.spec.ts`](../../tests/react-browser/accessibility.spec.ts)
checks visible interactive controls for accessible names, keyboard focus, live
status attachment, and dialog semantics. The existing UI tests also exercise
touch-sized layouts, accessible selectors, confirmation dialogs, and page-error
cleanup.

This is not an WCAG conformance claim. The repository has not completed a
manual keyboard audit across all workflows, screen-reader verification,
reduced-motion review, color-contrast measurement, or physical-device touch
target review. No `axe` dependency was added merely to imply conformance.

## Review checklist

| Area | Status | Evidence / next action |
| --- | --- | --- |
| Accessible control names | PASS locally | Automated visible-control audit and existing labels. |
| Keyboard focus smoke | PASS locally | Tab focus and dialog controls are exercised. |
| Dialog semantics | PASS locally | Rename dialog role/name/input/cancel behavior. |
| Live status/error semantics | PASS locally | Existing `aria-live` and page-error assertions. |
| Screen reader behavior | NOT TESTED | Manual NVDA/JAWS/VoiceOver review required. |
| Reduced motion | NOT TESTED | Review animation/timer behavior with prefers-reduced-motion. |
| Color contrast | NOT TESTED | Measure representative themes and states. |
| Physical touch targets | NOT TESTED | Validate on authorized devices, not emulation alone. |

Any formal support statement requires owner-approved criteria and review of
manual evidence; automated checks must not silently close this gate.
