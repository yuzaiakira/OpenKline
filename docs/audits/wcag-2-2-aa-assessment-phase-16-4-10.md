# WCAG 2.2 Level AA Assessment — Phase 16.4.10

Builds on `docs/audits/wcag-2-2-aa-assessment-phase-16-4-9.md`.  
**Formal conformance claim:** **OPEN / NOT CLAIMED**.

This phase did **not** mark criteria PASS based on new documentation alone. It classifies remaining gaps and points to the external handoff in `docs/guides/external-at-physical-device-handoff.md`.

## Retained automated / prior PASS (not re-certified as formal AA)

| Criterion | Status | Notes |
| --- | --- | --- |
| 1.4.3 Contrast (text) | PASS audited chrome; PARTIAL dense panels | Hover/pressed/error dialog measured in 16.4.9 |
| 1.4.11 Non-text contrast | PASS for audited borders/focus | Reaffirmed prior suites |
| 1.4.1 Use of Color | PASS (Object Tree names) | Automated + prior review |
| 1.4.10 Reflow | PASS 320px Studio path | Prior Playwright |
| 2.4.7 Focus Visible | PASS | Prior keyboard suites |
| 3.3.1 Error Identification | PASS rename validation path | Dialog + `aria-invalid` + alert |
| 4.1.3 Status Messages | PASS live regions + dialog alert | Prior + 16.4.9 |
| 2.4.13 Focus Appearance (AAA) | PASS enhanced (optional) | Not AA obligation |

## Incomplete criteria — closure register

| Criterion / area | Why incomplete | Automated evidence | Missing manual evidence | Target environment | Closure procedure | Expected artifact | Role |
| --- | --- | --- | --- | --- | --- | --- | --- |
| NVDA workflows | No Windows AT run | Keyboard/axe suites | Full AT-S01–S12 on NVDA | Windows + NVDA + Chrome/Firefox | Execute handoff Part A | `docs/evidence/.../session.md` | AT verifier |
| VoiceOver macOS | No macOS AT run | Same | AT-S01–S12 | macOS Safari + VO | Handoff Part A | Evidence session | AT verifier |
| VoiceOver iOS | No physical iOS | Emulation ≠ evidence | AT-S01–S12 on device | Physical iOS Safari | Handoff A+B | Evidence session | Mobile + AT verifier |
| TalkBack Android | No physical Android AT | Emulation ≠ evidence | AT-S01–S12 | Physical Android Chrome | Handoff A+B | Evidence session | Mobile + AT verifier |
| 2.4.11 Focus Not Obscured | Sticky overlays / dense panels not AT-proven | Dialog@360 path PASS in 16.4.9 | Manual check with sticky chrome + AT | Desktop + mobile | Re-test after AT setup | Notes + screenshots | A11y engineer |
| 1.4.4 Resize text | Browser zoom not fully certified | Partial prior notes | 200% zoom operable Studio | Desktop browsers | Manual zoom protocol | Evidence sheet | A11y engineer |
| 1.4.12 Text spacing | Not executed | None dedicated | Text-spacing bookmarklet/user CSS | Desktop | Apply WCAG spacing override; retest | Evidence sheet | A11y engineer |
| 1.4.3 dense panels | Residual PARTIAL | Contrast audits cover primary chrome | Spot-check remaining dense controls | Studio production | Inventory + measure remaining | Contrast notes | A11y engineer |
| Physical mobile AA-affecting | No devices | Playwright mobile emulation only | PM-S01–S11 | Physical Android + iOS | Handoff Part B | Physical result sheets | Device tester |
| Formal AA claim | Aggregated gaps | Automated only | AT + manual closures above | All target envs | Owner review of evidence pack | Signed claim (owner) | Release owner |

## Explicit non-claims

- New handoff documentation does **not** change NOT TESTED AT/device rows to PASS.
- Formal WCAG 2.2 AA remains **OPEN**.
- Public Widget API / public release remain **NOT AUTHORIZED**.
