# External Assistive-Technology & Physical-Device Verification Handoff

**Phase:** 16.4.10  
**Build under test:** record exact `git rev-parse HEAD` at session start (tip at handoff authoring: see phase report).  
**Host mode:** Production Studio / Widget build preferred (not shared `next dev`).  
**Authority:** Human testers or authorized real-device infrastructure only.

Related durable protocols:

- `docs/guides/wcag-assistive-technology-protocol.md`
- `docs/guides/physical-mobile-verification-protocol.md`
- Templates: `docs/evidence/templates/at-verification-result.md`, `docs/evidence/templates/physical-mobile-result.md`

**Do not fabricate screenshots, transcripts, or PASS results.**  
Emulated Playwright mobile / Docker WebKit ≠ physical device evidence.

---

## Execution status (authoring environment)

Updated by Phase **16.4.12** environment inventory against pin `7b4117f` (Manjaro Linux host). Protocols below remain the execution source of truth; statuses are not PASS without real sessions.

| Gate | Status |
| --- | --- |
| NVDA (Windows) | **NOT TESTED — REQUIRED ENVIRONMENT UNAVAILABLE** |
| VoiceOver (macOS) | **NOT TESTED — REQUIRED ENVIRONMENT UNAVAILABLE** |
| VoiceOver (physical iOS) | **NOT TESTED — REQUIRED ENVIRONMENT UNAVAILABLE** |
| TalkBack (physical Android) | **NOT TESTED — REQUIRED ENVIRONMENT UNAVAILABLE** |
| Physical Android Chrome | **NOT TESTED — REQUIRED ENVIRONMENT UNAVAILABLE** |
| Physical iOS Safari | **NOT TESTED — REQUIRED ENVIRONMENT UNAVAILABLE** |

Evidence: `docs/evidence/2026-11-02-phase-16-4-12-environment-inventory.md`, `docs/evidence/2026-11-02-phase-16-4-12-evidence-matrix.md`.

---

## Common prerequisites

1. Check out the agreed SHA; record it on every evidence sheet.
2. Serve production Studio (example: build Next Studio host used by `test:react:production`).
3. Capture OS, browser, AT, device model, DPR, viewport, date (UTC).
4. Store evidence under `docs/evidence/YYYY-MM-DD-<platform>-<tool>/`.
5. Severity for defects: Blocker / Major / Minor / Nit — map to WCAG criteria when applicable.

### Defect report template (copy per failure)

```text
Defect ID:
Build SHA:
Environment (OS/browser/AT/device):
Scenario ID:
WCAG criterion (if known):
Severity:
Steps to reproduce:
Expected:
Actual:
Evidence paths:
Workaround (if any):
```

---

## Part A — Assistive technology scenarios

### Environment matrix

| ID | Environment | Prerequisites |
| --- | --- | --- |
| AT-NVDA | Windows 10/11 + NVDA + Chrome or Firefox | Browse mode + focus mode familiarity |
| AT-VO-MAC | macOS + Safari + VoiceOver | VO keys enabled |
| AT-VO-IOS | Physical iPhone/iPad + Safari + VoiceOver | Hardware device; production URL reachable |
| AT-TB-AND | Physical Android + Chrome + TalkBack | Hardware device; production URL reachable |

For each scenario below: run on applicable environments; record PASS/FAIL/BLOCKED/NOT TESTED with evidence.

### Scenario catalog

#### AT-S01 — Initial loading

- **Steps:** Open Studio URL; wait for chart + Object Tree.
- **Expected:** Page structure reachable; chart has text alternative / summary; no silent failure.
- **Accessible outcome:** Landmarks/headings or labeled regions locate Object Tree and chart.
- **PASS:** Load complete; primary regions announced/findable without pointer.
- **Evidence:** Short transcript or recording of first navigation; note of announced names.

#### AT-S02 — Object Tree navigation

- **Steps:** Move into Object Tree; list drawings/series rows.
- **Expected:** Each row has an accessible name; tree/list semantics usable.
- **PASS:** Tester can identify items without relying on color alone.
- **Evidence:** Names announced for ≥2 object rows.

#### AT-S03 — Lock / unlock

- **Steps:** Focus a drawing row lock control; activate; reverse.
- **Expected:** Name + locked/unlocked state announced on change.
- **PASS:** State change announced; control remains operable.
- **Evidence:** Before/after announcement notes.

#### AT-S04 — Visibility (Hide / Show)

- **Steps:** Toggle Hide/Show on a drawing via Object Tree.
- **Expected:** Visibility state conveyed in name or state.
- **PASS:** Announcement or name reflects hidden vs visible.
- **Evidence:** Transcript snippet.

#### AT-S05 — Selection state

- **Steps:** Select object via keyboard/AT; move selection.
- **Expected:** Selected item distinguishable by name/state, not color alone.
- **PASS:** Selection change discoverable with AT.
- **Evidence:** Announcement of selection.

#### AT-S06 — Tab navigation

- **Steps:** Tab/Shift+Tab across toolbar, Object Tree, settings, chart chrome (keyboard-only session).
- **Expected:** Logical order; no trap; visible focus at every stop.
- **PASS:** Full cycle without pointer; focus never lost invisibly.
- **Evidence:** Note of any skip/trap; optional recording.

#### AT-S07 — Dialog entry and exit

- **Steps:** Open Rename (or equivalent) dialog; verify focus moves in; dismiss with Escape / close control.
- **Expected:** Title + description announced; focus enters dialog; Escape restores focus to trigger.
- **PASS:** Entry and exit both correct; no orphan focus.
- **Evidence:** Focus restore confirmation.

#### AT-S08 — Rename validation errors

- **Steps:** Submit empty/invalid rename; keep dialog open.
- **Expected:** Error identified (`aria-invalid` / alert); announced; dialog remains until corrected or cancelled.
- **PASS:** Error text announced; user can correct without dismissing blindly.
- **Evidence:** Error announcement text.

#### AT-S09 — Settings interactions

- **Steps:** Open Chart Settings / Studio settings; change a non-destructive option; close.
- **Expected:** Controls named; values discoverable; exit restores usable focus.
- **PASS:** Complete change cycle with AT only.
- **Evidence:** Control names list.

#### AT-S10 — Focus restoration

- **Steps:** After dialogs, menus, or transient panels, verify focus returns to a sensible control.
- **Expected:** No focus sent to `body` without recovery path; trigger refocused when dismissed.
- **PASS:** Documented restore target matches expectation.
- **Evidence:** Focus target description.

#### AT-S11 — Dynamic state announcements

- **Steps:** Trigger save/load/status or Object Tree state change that uses live regions.
- **Expected:** Status message announced without focus theft unless intentional.
- **PASS:** Status heard once per meaningful change.
- **Evidence:** Live-region text.

#### AT-S12 — Workspace switching

- **Steps:** Switch workspace or load alternate workspace document (Studio flow).
- **Expected:** Context update announced or clearly reflected; tree/chart remain operable.
- **PASS:** Post-switch navigation succeeds with AT.
- **Evidence:** Brief post-switch navigation notes.

### AT session completion rule

Overall AT environment may be marked PASS only when **all applicable scenarios for that environment** are PASS. Any FAIL opens a defect; BLOCKED/NOT TESTED keep the release AT gate OPEN.

---

## Part B — Physical mobile package

### Required devices (minimum)

| Platform | Device class | Browser |
| --- | --- | --- |
| Android | Phone and optionally tablet | Chrome (Firefox optional) |
| iOS | iPhone and optionally iPad | Safari |

Record: model, OS version, browser version, DPR, portrait/landscape viewports, build SHA, Studio URL.

### Scenario catalog

| ID | Focus | Steps (summary) | Expected | PASS criteria |
| --- | --- | --- | --- | --- |
| PM-S01 | Cold load | Open Studio | Chart + Object Tree usable | Interactive within timeout; no blank trap |
| PM-S02 | Orientation | Portrait→landscape→portrait | Panels hit-testable; layout usable | No permanent overlap of primary controls |
| PM-S03 | Touch drawing | Place drawing with touch | Drawing + Object Tree update | Gesture completes; undo/remove still possible |
| PM-S04 | Object Tree | Hide/Show/Lock via touch | Targets usable; state persists | ≥24×24 CSS px practical hit area |
| PM-S05 | Chart pan/zoom | Pan + pinch-zoom | Chart responds; no accidental modal | Gestures do not open blocking dialogs |
| PM-S06 | Dialogs | Open settings/rename; dismiss | Dialog usable; dismissible | Not permanently off-screen |
| PM-S07 | On-screen keyboard | Focus text field | Primary actions remain reachable | No permanent occlusion of submit/cancel |
| PM-S08 | Safe area / overflow | Scroll side panels | No trapped scroll; notches respected | Content reachable |
| PM-S09 | Text resize / zoom | Browser/OS text boost if available | Layout remains operable | No loss of function at commonly used zoom |
| PM-S10 | CSP (Widget host) | If testing Widget CSP host | Required styles load | No blocking `style-src` console errors |
| PM-S11 | AT on device | Optional TalkBack / iOS VO pass | Cross-link to AT scenarios | Recorded on AT sheet, not as emulation |

### Evidence naming

```text
docs/evidence/YYYY-MM-DD-physical-<android|ios>-<model-slug>/
  session.md          # from physical-mobile-result.md
  PM-S0N-pass|fail.*  # screenshot or recording
```

### Status labels (mandatory until executed)

**PHYSICAL ANDROID: NOT TESTED**  
**PHYSICAL IOS: NOT TESTED**

Simulators, Docker WebKit, and Playwright device profiles must not be copied into these PASS rows.

---

## Part C — Closure checklist for release owners

1. Completed AT sheets for NVDA, macOS VoiceOver, iOS VoiceOver, TalkBack (or documented BLOCKED with reason).
2. Completed physical Android + iOS sessions against the **same** release SHA.
3. Defects filed for every FAIL; blockers resolved or waived in writing by owner.
4. Formal WCAG 2.2 AA claim remains **OPEN** until AT + applicable manual criteria close.
5. Git lineage reconciliation (if still divergent) handled under separate human authorization — see `docs/audits/git-lineage-reconciliation-phase-16-4-10.md`.
