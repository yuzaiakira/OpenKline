# Phase 16.5.12 — Mobile Studio Active-Panel UX & Responsive Workflow Completion

## 1. Executive summary

Phase 16.5.12 delivers a coherent mobile Studio active-panel workflow: sticky
mobile panel navigator, chart-first compact layout, activate-time chart resize
recovery, corrected mobile E2E assertions, and Chromium Mobile Chrome + Firefox
regression evidence. WebKit/Mobile Safari remain BLOCKED (ICU74/flite; Docker
unavailable). Phase 7.5.1 overall acceptance remains OPEN.

## 2. Starting repository state

- Branch: `main`
- Starting HEAD: `4dfe24531e8f4df5d52b9b398e582ab3fcc2d17b`
- `origin/main`: `d35e6720dbd39471f04832e5137feb901406cb61` (local ahead by 5)
- Working tree clean

## 3. Phase 16.5.11 findings carried forward

Mobile Chrome quarantine/panel selection worked; some desktop-oriented
visibility assertions were incorrect under active-panel-only presentation.
WebKit blocked on host deps / Docker.

## 4. Mobile architecture

Breakpoint: `max-width: 720px`. Inactive panels use `display: none` but remain
mounted Chart instances. Workspace panel count is independent of visible count.

## 5. Active-panel presentation contract

Exactly one chart panel is visible on compact viewports. Switching active panel
reveals that panel and hides others without destroying stored state.

## 6. Actual product gaps

- Compact panel switching relied mainly on a topbar `<select>`; no dedicated
  mobile navigator summarizing all panels.
- Object Tree ordered above the chart on mobile, distancing drawing properties
  from chart interaction.
- Hidden→visible panels needed an explicit resize pass after `display:none`.
- Several E2E assertions required simultaneous visibility of inactive panels.

## 7. Implemented mobile workflow improvements

- Mobile panel navigator (`aria-label="Mobile chart panels"`) with ordinal
  labels and pressed state.
- Chart-first mobile workspace order (chart → Object Tree → sidebars).
- Activate-time `Chart.resize` recovery for previously hidden panels.
- Viewport mode data attributes for tests (`data-studio-viewport-mode`,
  `data-studio-panel-count`, `data-studio-visible-panel-count`).
- Pure helpers in `src/studio/mobile-panels.ts`.

## 8–12. Workflows

Panel navigation, drawing/indicator/KlineScript ownership, Save/Restore, dirty
Cancel, and desktop↔mobile transitions covered by Chromium Mobile Chrome E2E.
Firefox covers navigator + ownership without relying on flaky narrow drawing
placement under managed Firefox mobile viewport.

## 13. Corrected mobile test assumptions

Inactive panels asserted via presence + switch, not simultaneous visibility.
KlineScript multi-panel test updated accordingly.

## 14. Accessibility

Navigator has accessible name, pressed states, and textual active-panel
description. Formal WCAG / physical AT remain OPEN.

## 15. Mobile Chrome E2E

`mobile Studio active-panel workflow…` and updated selector test: **PASS**.

## 16. Firefox regression

Focused subset including mobile navigator + ownership: **6/6 PASS**.

## 17–18. WebKit / Mobile Safari

**BLOCKED** — missing `libicu74`/`libflite1`; Docker daemon unavailable.

## 19–20. Tests and regressions

Unit: `studio-mobile-panels.test.ts`. See final report for gate table.

## 21. Imported-script security

Quarantine / Activate / Dismiss / forged-trust behavior preserved; no CSP or
Worker weakening.

## 22. API and CSP

Additive Studio helper exports only. Public Widget API not authorized.

## 23. Remaining Phase 7.5.1 gaps

WebKit/Mobile Safari execution; formal AT; physical devices. Phase 7.5.1
remains OPEN.

## 24. Recommended next milestone

Next concrete Phase 7/8 product feature, keeping WebKit as an explicit
acceptance gate when Docker/deps become available.

## 25. Git delivery

- Starting HEAD: `4dfe24531e8f4df5d52b9b398e582ab3fcc2d17b`
- Implementation: `1650bbe3bf5e6c2e05320e809dc8d62d67ef7276`
- Documentation tip: `docs(product): record phase 16.5.12 mobile Studio workflows`
- Local commits only. No push. No Cursor co-author attribution.
