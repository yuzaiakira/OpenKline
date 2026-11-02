# WCAG 2.2 Level AA Assessment — Phase 16.4.7

Scope: applicable Studio / Widget web surfaces in OpenKline.  
Build under assessment: recorded against Phase 16.4.7 delivery commits.  
Target: **WCAG 2.2 Level A and AA**.

Method legend:

- **A** — automated (axe-core / Playwright)
- **K** — keyboard-only automated or manual keyboard inspection
- **V** — visual/manual inspection without AT
- **AT** — assistive technology (NVDA / VoiceOver / TalkBack)

Classification: PASS | FAIL | PARTIAL | NOT TESTED | NOT APPLICABLE

## Criterion matrix

| Criterion | Title | Applicable UI | Method | Result | Evidence / notes |
| --- | --- | --- | --- | --- | --- |
| 1.1.1 | Non-text Content | Chart canvas | A/K | PASS | Canvas `role="img"` + `aria-label` summary (`accessibility.spec.ts`) |
| 1.3.1 | Info and Relationships | Object Tree, dialogs, tabs | A/K | PASS | Landmarks, heading, dialog labelling; strategy tabs `tablist`/`tab` |
| 1.3.2 | Meaningful Sequence | Studio chrome | K | PASS | Tab order reaches toolbar / Object Tree / dialogs without trap |
| 1.3.3 | Sensory Characteristics | Object Tree Hide/Show/Lock | K | PASS | Controls expose textual names, not icon-only |
| 1.3.4 | Orientation | Studio | A (emulation) | PARTIAL | Emulation rotation covered historically; physical **NOT TESTED** |
| 1.3.5 | Identify Input Purpose | Limited forms | V | NOT APPLICABLE | No personal-data autocomplete fields in Studio core flows |
| 1.4.1 | Use of Color | Object Tree visibility dots | K | PASS | Named buttons accompany ●/○ icons |
| 1.4.3 | Contrast (Minimum) | Studio chrome | A | PARTIAL | axe `color-contrast` disabled for canvas pixels; chrome contrast not fully certified |
| 1.4.4 | Resize Text | Studio | V | PARTIAL | Browser zoom not fully matrixed this phase |
| 1.4.5 | Images of Text | Studio | V | PASS | No essential text-as-image UI |
| 1.4.10 | Reflow | Studio chrome @ 320 CSS px | A | PASS | Regression after sidebar/min-width fix (`accessibility.spec.ts`) |
| 1.4.11 | Non-text Contrast | Focus outline / icons | V/A | PARTIAL | Focus outline present; full non-text contrast audit incomplete |
| 1.4.12 | Text Spacing | Studio | A | NOT TESTED | No dedicated text-spacing override suite |
| 1.4.13 | Content on Hover or Focus | Studio | V | PARTIAL | No tooltip-only critical content observed; not exhaustively audited |
| 2.1.1 | Keyboard | Object Tree, dialogs, charts | K | PASS | Hide/Show/Lock, dialog Escape/focus trap covered |
| 2.1.2 | No Keyboard Trap | Dialogs | K | PASS | Focus cycles inside dialog; Escape exits |
| 2.1.4 | Character Key Shortcuts | Studio | V | NOT APPLICABLE | No single-character shortcuts observed in Studio chrome |
| 2.2.1 | Timing Adjustable | Studio | V | NOT APPLICABLE | No essential time limits in audited flows |
| 2.2.2 | Pause, Stop, Hide | Replay | V | PASS | Replay provides Pause/Exit controls |
| 2.3.1 | Three Flashes | Studio | V | PASS | No flashing content observed |
| 2.4.1 | Bypass Blocks | Studio | A/K | PARTIAL | Landmarks present; dedicated skip-link not required for SPA chrome but not audited as bypass |
| 2.4.2 | Page Titled | Studio | A | PASS | `metadata.title = "OpenKline Studio"` |
| 2.4.3 | Focus Order | Dialogs / chrome | K | PASS | Dialog focus order + restoration covered |
| 2.4.4 | Link Purpose (In Context) | Studio | V | PASS | Interactive controls are buttons with names |
| 2.4.5 | Multiple Ways | Studio | V | NOT APPLICABLE | Single-page Studio tool; set of pages not a multi-page site |
| 2.4.6 | Headings and Labels | Studio | A/K | PASS | Unnamed control scan empty; headings present |
| 2.4.7 | Focus Visible | Studio chrome | K | PASS | `:focus-visible` 2px amber outline asserted |
| 2.4.11 | Focus Not Obscured (Minimum) | Dialogs / overlays | K | PARTIAL | Dialogs center-focused; dense mobile overlays not AT-verified |
| 2.4.13 | Focus Appearance | Studio chrome | K | PASS | Outline ≥2px on Rename control |
| 2.5.1 | Pointer Gestures | Chart | V | PARTIAL | Path-based chart gestures have Object Tree alternatives for visibility/lock; full gesture map not certified |
| 2.5.2 | Pointer Cancellation | Buttons | V | PASS | Standard click activation |
| 2.5.3 | Label in Name | Named buttons | A/K | PASS | Visible labels align with accessible names for audited controls |
| 2.5.4 | Motion Actuation | Studio | V | NOT APPLICABLE | No device-motion controls |
| 2.5.7 | Dragging Movements | Drawings | V | PARTIAL | Drawing placement is pointer-based; keyboard alternatives limited for anchor placement |
| 2.5.8 | Target Size (Minimum) | Object Tree / Studio buttons | A | PASS | 24×24 CSS px regression |
| 3.1.1 | Language of Page | Studio | A | PARTIAL | Host document language depends on Next app `lang`; confirm in page shell |
| 3.2.1 | On Focus | Studio | K | PASS | Focus does not unexpectedly submit/navigate |
| 3.2.2 | On Input | Studio | K | PASS | Inputs do not force unexpected context change in audited flows |
| 3.2.3 | Consistent Navigation | Studio | V | PASS | Chrome structure stable across panels |
| 3.2.4 | Consistent Identification | Object Tree actions | K | PASS | Hide/Show/Lock naming consistent |
| 3.2.6 | Consistent Help | Studio | V | NOT APPLICABLE | No help mechanism required for this surface set |
| 3.3.1 | Error Identification | Watchlist rename errors | K | PARTIAL | Errors surface via notice/live region; AT announcement **NOT TESTED** |
| 3.3.2 | Labels or Instructions | Forms | A/K | PASS | Labels present on audited inputs |
| 3.3.3 | Error Suggestion | Forms | V | PARTIAL | Limited validation messaging depth |
| 3.3.4 | Error Prevention | Destructive delete confirm | K | PASS | Confirm dialog for watchlist delete |
| 3.3.7 | Redundant Entry | Studio | V | NOT APPLICABLE | No multi-step personal data entry |
| 3.3.8 | Accessible Authentication | Studio | V | NOT APPLICABLE | No auth wall in Studio demo |
| 4.1.1 | Parsing | Studio | A | PASS | Modern DOM; axe serious/critical clear on audited scopes |
| 4.1.2 | Name, Role, Value | Object Tree / dialogs / tabs | A/K | PASS | Roles and state attributes covered |
| 4.1.3 | Status Messages | `aria-live="polite"` | K | PASS | Live regions attached; AT announcement **NOT TESTED** |

## Assistive-technology rows

| Combination | Result |
| --- | --- |
| NVDA + Windows browser | **NOT TESTED** — no Windows/NVDA host |
| VoiceOver + macOS Safari | **NOT TESTED** — no macOS host |
| VoiceOver + iOS Safari | **NOT TESTED** — no physical iOS |
| TalkBack + Android Chrome | **NOT TESTED** — no physical Android |

## Formal conformance decision

**Formal WCAG 2.2 AA conformance: OPEN / NOT CLAIMED**

Automated and keyboard evidence expanded in Phase 16.4.7, including a verified
reflow defect fix. Remaining PARTIAL and NOT TESTED rows (especially AT, contrast
certification, and physical orientation) prevent a full conformance claim.
