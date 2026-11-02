# WCAG 2.2 Level AA Assessment — Phase 16.4.8

Supersedes contrast-related rows from
`docs/audits/wcag-2-2-aa-assessment-phase-16-4-7.md` for the surfaces re-audited
in Phase 16.4.8. Unchanged criteria inherit the 16.4.7 classification unless
noted.

Method legend: **A** automated · **K** keyboard · **V** visual · **AT** assistive technology

## Updated / reaffirmed criteria

| Criterion | Result | Method | Evidence |
| --- | --- | --- | --- |
| 1.4.1 Use of Color | PASS | K | Object Tree Hide/Show/Lock named buttons |
| 1.4.3 Contrast (Minimum) | PARTIAL → **PASS (audited chrome)** with residual PARTIAL for unsampled dense panels | A | Contrast inventory + Studio/Widget Playwright; canvas N/A |
| 1.4.10 Reflow | PASS | A | 320px regression retained |
| 1.4.11 Non-text Contrast | PARTIAL → **PASS (widget borders/focus + Studio borders/focus)**; residual PARTIAL for exhaustive iconography | A | Token fixes `#64748b` borders; 85% separator mix; focus ≥3:1 |
| 2.4.7 Focus Visible | PASS | K/A | Studio + Widget focus-visible |
| 2.4.11 Focus Not Obscured | PARTIAL | K | Unchanged — AT/physical overlays NOT TESTED |
| 2.4.13 Focus Appearance | PASS (AAA enhancement; not AA obligation) | A | ≥2px + ≥3:1 |
| 4.1.2 Name, Role, Value | PASS | A/K | Unchanged Object Tree/dialog coverage |

## Assistive technology / physical

| Item | Status |
| --- | --- |
| NVDA | NOT TESTED |
| VoiceOver macOS/iOS | NOT TESTED |
| TalkBack | NOT TESTED |
| Physical Android | NOT TESTED |
| Physical iOS | NOT TESTED |

## Formal conformance

**Formal WCAG 2.2 AA conformance: OPEN / NOT CLAIMED**

Contrast defects verified in-scope were fixed and regression-tested. Remaining
PARTIAL/NOT TESTED rows (AT, physical, full panel hover matrices, text spacing,
resize-text certification) prevent a full conformance claim.
