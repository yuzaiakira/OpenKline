# WCAG 2.2 AA & Assistive-Technology Manual Protocol

Target: **WCAG 2.2 Level AA** for applicable Studio / Widget web surfaces.

Automated axe-core and keyboard Playwright checks are necessary but **not
sufficient** for formal conformance. This protocol records the manual and
assistive-technology (AT) evidence required before the WCAG/AT release gate
may move from OPEN.

## Environment prerequisites

| Environment | Prerequisites |
| --- | --- |
| Keyboard-only | Desktop Chromium or Firefox; no pointing device for the session |
| NVDA | Windows 10/11 + NVDA + Chromium or Firefox |
| VoiceOver macOS | macOS + Safari + VoiceOver |
| VoiceOver iOS | Physical iPhone/iPad + Safari |
| TalkBack | Physical Android + Chrome |

Record OS version, browser version, AT version, build SHA, and date for every run.

## Keyboard procedure (minimum)

1. Load Studio production build; confirm chart canvas and Object Tree are present.
2. Tab through toolbar, Object Tree, watchlist, and settings without traps.
3. Confirm visible focus indicators on every interactive control.
4. Activate Trend drawing, place anchors, Hide/Show/Lock via keyboard.
5. Open Rename watchlist dialog; confirm focus moves into dialog; Escape restores focus.
6. Toggle reduced-motion OS preference; confirm no decorative animation path.

## Screen-reader procedure (minimum)

1. Navigate by landmarks/headings to Object Tree and chart summary.
2. Confirm drawing Hide/Show/Lock button names and state changes are announced.
3. Confirm dialog title and description are announced on open.
4. Confirm status/live regions announce save/load/error feedback.
5. Confirm disabled controls are conveyed as unavailable.

## Result recording format

Use the durable template:

`docs/evidence/templates/at-verification-result.md`

Store completed sessions under `docs/evidence/` with a dated folder, for example:

`docs/evidence/YYYY-MM-DD-at-<tool>/session.md`

Inline fallback:

```text
Date:
Build SHA:
Environment:
Procedure step:
Expected:
Actual:
Classification: PASS | FAIL | BLOCKED | NOT TESTED
Defect link (if FAIL):
```

## Automated complements (not AT substitutes)

| Suite | Command | Role |
| --- | --- | --- |
| Keyboard / focus / Object Tree | `npm run test:react:browser -- tests/react-browser/accessibility.spec.ts` | Keyboard-only and name/state regressions |
| axe-core WCAG tags | `npm run test:react:browser -- tests/react-browser/axe-accessibility.spec.ts` | Detectable serious/critical violations |

Passing automated suites **does not** authorize marking NVDA/VoiceOver/TalkBack rows as PASS.

## Defect criteria

File a defect when a required WCAG 2.2 AA success criterion fails for an
applicable Studio/Widget workflow under a supported environment. Do not mark
the formal WCAG/AT gate PASS until recorded AT evidence exists for the
prioritized workflows above.
