# Phase 8.8.20 Accessibility and Device Results

Verified product source: `bb3f1cad028b126920fa26a75f7ec158ebc56e3c`  
Host: Manjaro Linux (trusted)  
Authority: Phase 8.8.20 local execution (read-only product)

## Keyboard-only workflows (Chromium system browser)

Runner: `/tmp/phase-8820-keyboard-workflows.mjs` via `/usr/bin/chromium` + Playwright Chromium channel.  
Scope: smoke of focusability / Tab reach / Escape dismiss — **not** WCAG 2.2 AA conformance.

| Workflow | Result | Observed |
| --- | --- | --- |
| Drawing tools | **PASS** (smoke) | Tool buttons Tab-reachable; Escape returns focus context |
| Watchlist operations | **PASS** (smoke) | Add/remove controls keyboard-reachable |
| Dialog keyboard focus | **PASS** (smoke) | Dialog opens; focus moves into dialog; Escape closes |
| Alerts | **PASS** (smoke) | Alert UI controls reachable |
| Paper Trading | **PASS** (smoke) | Form controls Tab-order reachable |
| Replay | **PASS** (smoke) | Replay controls reachable |
| Backtest | **PASS** (smoke) | Backtest panel controls reachable |
| Screener | **PASS** (smoke) | Screener controls reachable |
| Optimizer | **PASS** (smoke) | Optimizer controls reachable |
| Chart data alternatives | **PASS** (smoke) | Non-canvas textual/control alternatives present for key actions |

Overall keyboard smoke: **PASS** (limited smoke only).

## Screen reader (Orca)

| Check | Result |
| --- | --- |
| `orca` binary present | **NO** |
| Install without owner authorization | **not performed** |
| Screen-reader session | **SCREEN READER — NOT TESTED** |

Minimum setup if authorized later: install `orca` (+ speech backend as needed), enable AT in session, re-run Studio workflows with speech/braille observation logged.

Formal accessibility target: **REQUIRES OWNER APPROVAL** (do not claim WCAG 2.2 AA from keyboard smoke).

## Physical Android (ADB)

| Check | Result |
| --- | --- |
| `adb devices` authorized physical | none |
| Real-device checklist executed | **no** |
| Status | **PHYSICAL ANDROID — BLOCKED** |

## Native iOS Safari

| Check | Result |
| --- | --- |
| Authorized iPhone/iPad Safari | unavailable on this host |
| Playwright mobile WebKit used as substitute | **no** (explicitly rejected) |
| Status | **NATIVE IOS SAFARI — BLOCKED** |

## New product defects

None confirmed in Phase 8.8.20 accessibility/device execution.

## Remaining blockers

1. Owner formal a11y target adoption  
2. Owner authorization to install Orca (if screen-reader gate required)  
3. Authorized physical Android + USB/`adb reverse` policy  
4. Authorized native iOS Safari access
