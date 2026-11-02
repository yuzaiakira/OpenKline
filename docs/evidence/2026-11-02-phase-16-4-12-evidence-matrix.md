# Phase 16.4.12 — External Verification Evidence Matrix

**Tested commit SHA:** `7b4117f6d8fc7d55b7591dfa559241a0142dcc12`  
**Inventory:** `docs/evidence/2026-11-02-phase-16-4-12-environment-inventory.md`  
**Protocol:** `docs/guides/external-at-physical-device-handoff.md`

Status meanings: PASS | FAIL | BLOCKED | NOT TESTED | NOT APPLICABLE

## Assistive technology (AT-S01–S12)

| Scenario | Platform | Method | Environment | Tester / source | Result | Evidence | Defect | Closure requirement |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AT-S01–S12 (all) | NVDA + Windows Chrome/Firefox | Real AT session | Unavailable | Phase 16.4.12 agent inventory | **NOT TESTED** | environment-inventory.md | — | Provide Windows + NVDA; execute handoff Part A |
| AT-S01–S12 (all) | VoiceOver macOS Safari | Real AT session | Unavailable | same | **NOT TESTED** | same | — | Provide macOS + Safari + VO |
| AT-S01–S12 (all) | VoiceOver physical iOS Safari | Real AT session | Unavailable | same | **NOT TESTED** | same | — | Attach physical iPhone/iPad; enable VO |
| AT-S01–S12 (all) | TalkBack physical Android Chrome | Real AT session | Unavailable | same | **NOT TESTED** | same | — | Attach physical Android; enable TalkBack |

## Physical mobile (PM-S01–S11)

| Scenario | Platform | Method | Environment | Tester / source | Result | Evidence | Defect | Closure requirement |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PM-S01–S11 (all) | Physical Android Chrome | Physical device | Unavailable (`adb` empty) | Phase 16.4.12 inventory | **NOT TESTED** | environment-inventory.md | — | USB/Wi‑Fi debug device; run handoff Part B |
| PM-S01–S11 (all) | Physical iOS Safari | Physical device | Unavailable (`idevice` empty) | same | **NOT TESTED** | same | — | Pair iPhone/iPad; run handoff Part B |
| PM-* | Playwright mobile / Docker WebKit | Emulation | Available historically | Prior phases | **NOT APPLICABLE** as physical evidence | phase-16-4-11 report | — | Must not be copied into physical PASS rows |

## Manual WCAG criteria (selected incomplete from 16.4.11)

| Criterion | Interface | Method | Result | Evidence | Limitation / closure |
| --- | --- | --- | --- | --- | --- |
| 1.4.4 Resize text | Studio chrome | Real browser page-zoom on target AT browsers | **NOT TESTED** | — | Needs human browser zoom on Windows/macOS/iOS/Android; CSS-zoom automation from 16.4.11 is not page-zoom |
| 2.4.11 Focus Not Obscured | Studio overlays | Real keyboard + AT confirmation | **NOT TESTED** (AT) | Prior automated samples only | Re-run with NVDA/VO/TalkBack |
| 1.4.12 Text spacing | Studio Object Tree | Real AT + visual check | **NOT TESTED** (AT) | Prior automated override PASS | Confirm with AT announcements |
| 4.1.3 Status messages | Live regions / dialogs | Real AT | **NOT TESTED** | — | AT-S08 / AT-S11 |
| Formal WCAG 2.2 AA claim | Aggregate | Assessment | **OPEN** | wcag assessment 16.4.11/12 | Complete AT + physical + page-zoom evidence |

## Verified defects this phase

None — no real AT/device session was executed, so no session-originated defects were observed.
