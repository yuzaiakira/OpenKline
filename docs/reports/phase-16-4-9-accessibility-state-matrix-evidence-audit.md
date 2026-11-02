# OpenKline Phase 16.4.9 — Accessibility State-Matrix Completion & Independent Release Evidence Audit

## 1. Executive summary

Phase 16.4.9 completed a scoped interactive-state inventory, measured previously
PARTIAL hover/pressed/error contrast cases, fixed rename-dialog validation
accessibility (keep open + `aria-invalid` + `role=alert`), added negative-path
Object Tree and focus regressions, and independently reconciled Git/history plus
release-evidence claims from Phases 16.4.5–16.4.8.

**ENGINEERING COMPLETE — EXTERNAL VERIFICATION GATES OPEN**

**PUBLIC WIDGET API: NOT AUTHORIZED**  
**PUBLIC RELEASE: NOT AUTHORIZED**

## 2. Actual starting Git state

| Item | Value |
| --- | --- |
| Branch | `main` |
| Starting HEAD | `cbff1beec0440fb92e3d5d314b2babcbce6031f8` |
| Working tree | Clean |
| `origin/main` | `909745110be9dd7aff16f659e295b713379ec716` |
| Divergence | ahead/behind non-zero (rewritten local chain vs unre written remote tip) |

## 3. Git history reconciliation findings

Phase 16.4.8 correctly started from `037be18` because the local branch tip of
Phase 16.4.7 content had been **rewritten** (`refs/rewrite/main` in reflog) via
`commit-tree` to strip Cursor co-author trailers. Content equivalence:

| Unrewritten (origin) | Rewritten (local) | Trees |
| --- | --- | --- |
| `9097451` (16.4.7 tip) | `037be18` | **identical** `654170f5…` |
| `603d986` (16.4.7 impl) | `8b77e07` | **identical** |

`9097451` is **not** a fast-forward ancestor of current HEAD. No undocumented
product commits exist between 16.4.7 and 16.4.8 on the current tip—only the
rewrite plus 16.4.8 commits. History was **not** rewritten further in 16.4.9.

Details: `docs/audits/release-evidence-reconciliation-phase-16-4-9.md`.

## 4. Accessibility state inventory

See `docs/audits/accessibility-state-matrix-phase-16-4-9.md`.

## 5. Contrast matrix and numerical results

Representative measured/token results (full table in state matrix + 16.4.8 audit):

| Case | Ratio | Threshold | Result |
| --- | --- | --- | --- |
| Hover toolbar text on `#1d3658` | 10.46 | 4.5 | PASS |
| Hover/pressed border accent | ≥3 | 3.0 | PASS |
| Dialog validation alert `#fda4af` | ≥8.9 | 4.5 | PASS |
| Widget light/dark borders `#64748b` | ≥3.73 | 3.0 | PASS (retained) |
| Dense secondary panel exhaustive hover | — | — | PARTIAL |

No new measured FAIL remaining in scoped samples.

## 6. Accessibility semantics findings

- Rename empty/whitespace: dialog remains open; `aria-invalid=true`; `role=alert`.
- Object Tree Hide→Show focus remaps; Lock while selected updates
  `data-drawing-locked` with named Unlock control.
- Strategy/optimizer disabled controls remain `disabled` (1.4.3 N/A).

## 7. Negative-path verification

`tests/react-browser/state-matrix-negative.spec.ts` — PASS (7 tests).

## 8. Responsive and focus results

- 320px reflow retained PASS.
- 360px dialog focus geometry not obscured PASS.
- Browser zoom certification still PARTIAL / not claimed from viewport-only tests.

## 9. Implemented fixes

- `multi-chart-studio-client.tsx`: prompt validation keeps dialog open; dialog
  error alert + `aria-invalid`; rename no longer swallows errors into notice-only.

## 10. Added regression tests

- `tests/react-browser/state-matrix-negative.spec.ts`
- Hover/pressed expansion in `contrast-audit.spec.ts`

## 11. Browser verification

| Suite | Result |
| --- | --- |
| Chromium `test:browser` | PASS 53 / 4 skipped |
| React parallel ×5 | PASS **59/59** each |
| React serial | PASS 59/59 |
| Firefox quality/contrast/developer | PASS 6 / 3 skipped |
| Mobile Chrome quality | PASS 2 / 3 skipped |
| Docker WebKit contrast+quality | PASS (executed) |
| axe Studio | PASS |

## 12. API and CSP regression

`api:check` PASS · CSP quality tests PASS · no CSP weakening.

## 13. Independent evidence audit

See reconciliation doc. Key: Git rewrite explains hash skew; formal WCAG/AT/device
PASS claims remain correctly absent.

## 14. WCAG remaining gaps

Formal conformance OPEN. AT/physical NOT TESTED. Text spacing / full zoom PARTIAL.

## 15. AT and physical-device status

**NVDA / VoiceOver / TalkBack: NOT TESTED**  
**Physical Android / iOS: NOT TESTED**

## 16. Release-gate matrix

| Gate | Status | Satisfied? |
| --- | --- | --- |
| Unit/API/package/distribution/stress | PASS | Yes |
| Browser Chromium/Firefox/WebKit Docker | PASS available paths | Yes (scoped) |
| Contrast state matrix (scoped) | PASS / PARTIAL dense | Partial |
| Formal WCAG AA | OPEN | No |
| AT / physical | NOT TESTED | No |
| Public Widget API | NOT AUTHORIZED | No |
| Public release | NOT AUTHORIZED | No |

## 17. Remaining blockers

| Blocker | Type | Severity |
| --- | --- | --- |
| AT sessions | External verification | High for a11y claims |
| Physical devices | External verification | High for mobile claims |
| Formal WCAG certification | Evidence completeness | High |
| Dense-panel exhaustive hover matrix | Engineering optional | Medium |
| Divergent origin/main vs rewritten local history | Delivery process | Medium — reconcile before push with human review |

## 18. Git delivery information

| Item | Value |
| --- | --- |
| Starting SHA | `cbff1beec0440fb92e3d5d314b2babcbce6031f8` |
| Implementation | _(filled at delivery)_ |
| Documentation | _(filled at delivery)_ |
| Final local tip | _(filled at delivery)_ |
| Remote push | **NOT PERFORMED** |
