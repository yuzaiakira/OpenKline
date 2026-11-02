# Physical Mobile Verification Protocol

Emulated Mobile Chrome / Mobile Safari Playwright projects are **not** physical
device evidence. Use this protocol before closing the physical-device release gate.

## Scope

| Platform | Browser | Coverage target |
| --- | --- | --- |
| Android phone/tablet | Chrome (and optionally Firefox) | Touch, rotation, Object Tree, dialogs, chart gestures |
| iPhone / iPad | Safari | Same, plus safe-area and virtual keyboard |

## Prerequisites

1. Production Studio/Widget host build matching a known Git SHA.
2. Physical device with developer-accessible network to the host.
3. Screen recording or annotated screenshots for failures.
4. Record device model, OS version, browser version, DPR, and viewport.

## Procedure

1. Cold-load Studio; confirm chart initializes and Object Tree is usable.
2. Portrait → landscape → portrait; confirm panels remain hit-testable.
3. Place a drawing with touch; Hide/Show/Lock from Object Tree.
4. Open Chart Settings / Rename dialog; dismiss with on-screen controls.
5. Open virtual keyboard over inputs; confirm no permanent occlusion of primary actions.
6. Pinch-zoom / pan chart; confirm no accidental modal blocking.
7. For Widget CSP external mode hosts, confirm styles load without console CSP errors.
8. Capture pass/fail per step with evidence paths.

## Result classification

- **PASS** — all procedure steps succeed on that device/browser.
- **FAIL** — reproducible defect with evidence.
- **BLOCKED** — device/browser unavailable or blocked by infrastructure.
- **NOT TESTED** — no physical execution performed.

Until at least one Android and one iOS physical run are recorded against a
known SHA, keep:

**Physical Android: NOT TESTED**  
**Physical iOS: NOT TESTED**
