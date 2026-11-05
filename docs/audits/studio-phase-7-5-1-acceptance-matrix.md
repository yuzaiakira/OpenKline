# Studio Phase 7.5.1 — Acceptance Matrix (Phase 16.5.11)

Internal engineering matrix. External AT/physical-device/WCAG and Public Widget API
remain OPEN and are not claimed here.

| Requirement | Implementation | Evidence | Chromium | Firefox | WebKit | Mobile emulation | Status |
|---|---|---|---|---|---|---|---|
| Multi-chart layouts / panel ownership | Studio multi-chart client | `multi-chart-studio.spec.ts` | PASS | PASS (subset) | BLOCKED | PASS (selector) | IMPLEMENTED AND VERIFIED (Chromium); Firefox subset verified |
| Chart synchronization | Sync prefs + controller | multi-chart + sync tests | PASS | NOT TESTED (this phase subset) | BLOCKED | PASS (mobile selector) | IMPLEMENTED — VERIFICATION INCOMPLETE (Firefox sync depth) |
| Drawing Toolbar | Professional toolbar | Drawing Toolbar E2E | PASS | PASS | BLOCKED | INCOMPLETE (properties hit-target) | IMPLEMENTED AND VERIFIED (desktop Chromium/Firefox) |
| Drawing Properties / Object Tree | Object Tree region | Drawing + property E2E | PASS | PASS | BLOCKED | INCOMPLETE | IMPLEMENTED AND VERIFIED (desktop) |
| Indicator Explorer | Registry Explorer | Explorer E2E | PASS | PASS | BLOCKED | NOT TESTED | IMPLEMENTED AND VERIFIED (desktop) |
| KlineScript My Scripts / Worker apply | KlineScript Studio helpers | KlineScript E2E | PASS | PASS (Inspector/quarantine) | BLOCKED | PARTIAL (quarantine PASS; multi-panel visibility asserts need active panel) | IMPLEMENTED AND VERIFIED (desktop); mobile partial |
| Applied Script Inspector / reapply | Inspector + reapply helper | Inspector E2E | PASS | PASS | BLOCKED | NOT TESTED | IMPLEMENTED AND VERIFIED (desktop) |
| Imported-script quarantine | `quarantineStudioImportedScripts` | Unit + E2E persistence | PASS | PASS | BLOCKED | PASS | IMPLEMENTED AND VERIFIED |
| Workspace library / Import/Export | Studio workspace APIs | Library + import E2E | PASS | PASS (dirty/import) | BLOCKED | PARTIAL | IMPLEMENTED AND VERIFIED (desktop) |
| Dirty-state / navigation guard | Fingerprints + guard | Dirty E2E | PASS | PASS | BLOCKED | INCOMPLETE (drawing-color path) | IMPLEMENTED AND VERIFIED (desktop); pending fingerprint fix in 16.5.11 |
| Lifecycle cleanup | Dispose / restore | Lifecycle E2E | PASS | NOT TESTED | BLOCKED | NOT TESTED | IMPLEMENTED — VERIFICATION INCOMPLETE (Firefox lifecycle) |
| Formal WCAG / physical AT | — | — | OPEN | OPEN | OPEN | OPEN | OPEN (external) |

## Environment blockers

- **WebKit / Mobile Safari emulation:** host missing `libicu74` / `libflite1`; Docker daemon unavailable in this run.
- **Physical iOS/Android and NVDA/VoiceOver/TalkBack:** OPEN (external).
