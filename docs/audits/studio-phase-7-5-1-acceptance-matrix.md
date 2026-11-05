# Studio Phase 7.5.1 — Acceptance Matrix (Phases 16.5.11–16.5.12)

Internal engineering matrix. External AT/physical-device/WCAG and Public Widget API
remain OPEN and are not claimed here.

| Requirement | Implementation | Evidence | Chromium | Firefox | WebKit | Mobile emulation | Status |
|---|---|---|---|---|---|---|---|
| Multi-chart layouts / panel ownership | Studio multi-chart client + mobile navigator | `multi-chart-studio.spec.ts` | PASS | PASS (subset) | BLOCKED | PASS (active-panel contract) | IMPLEMENTED AND VERIFIED (Chromium/Mobile Chrome); Firefox subset verified |
| Chart synchronization | Sync prefs + controller | multi-chart + sync tests | PASS | NOT TESTED (depth) | BLOCKED | PASS (selector) | IMPLEMENTED — VERIFICATION INCOMPLETE (Firefox sync depth) |
| Drawing Toolbar | Professional toolbar | Drawing Toolbar E2E | PASS | PASS (desktop) | BLOCKED | PASS (Chromium mobile); Firefox narrow drawing placement flaky | IMPLEMENTED AND VERIFIED (desktop + Chromium mobile) |
| Drawing Properties / Object Tree | Chart-first mobile order | Drawing + property E2E | PASS | PASS (desktop) | BLOCKED | PASS (Chromium mobile) | IMPLEMENTED AND VERIFIED |
| Indicator Explorer | Registry Explorer | Explorer E2E | PASS | PASS | BLOCKED | PASS (mobile workflow) | IMPLEMENTED AND VERIFIED |
| KlineScript My Scripts / Worker apply | KlineScript Studio helpers | KlineScript E2E | PASS | PASS (subset) | BLOCKED | PASS (mobile workflow) | IMPLEMENTED AND VERIFIED |
| Applied Script Inspector / reapply | Inspector + reapply helper | Inspector E2E | PASS | PASS | BLOCKED | NOT TESTED (narrow) | IMPLEMENTED AND VERIFIED (desktop) |
| Imported-script quarantine | `quarantineStudioImportedScripts` | Unit + E2E | PASS | PASS | BLOCKED | PASS | IMPLEMENTED AND VERIFIED |
| Workspace library / Import/Export | Studio workspace APIs | Library + import E2E | PASS | PASS (subset) | BLOCKED | PASS (mobile Save/Load/Cancel) | IMPLEMENTED AND VERIFIED |
| Dirty-state / navigation guard | Fingerprints + guard | Dirty E2E | PASS | PASS | BLOCKED | PASS | IMPLEMENTED AND VERIFIED |
| Mobile active-panel UX | Navigator + resize recovery | Phase 16.5.12 E2E | PASS | PASS (navigator/ownership) | BLOCKED | PASS | IMPLEMENTED AND VERIFIED |
| Lifecycle cleanup | Dispose / restore | Lifecycle E2E | PASS | NOT TESTED | BLOCKED | NOT TESTED | IMPLEMENTED — VERIFICATION INCOMPLETE |
| Formal WCAG / physical AT | — | — | OPEN | OPEN | OPEN | OPEN | OPEN (external) |

## Environment blockers

- **WebKit / Mobile Safari emulation:** host missing `libicu74` / `libflite1`; Docker daemon unavailable in this run.
- **Physical iOS/Android and NVDA/VoiceOver/TalkBack:** OPEN (external).

## Phase 7.5.1 overall

**OPEN** — product workflows largely verified on Chromium/Firefox/Mobile Chrome;
WebKit and external AT/device gates remain incomplete.
