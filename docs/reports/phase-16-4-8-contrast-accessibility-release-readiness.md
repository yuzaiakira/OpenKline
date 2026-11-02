# OpenKline Phase 16.4.8 — Contrast Compliance, Accessibility Evidence & Release-Gate Readiness

## 1. Executive summary

Phase 16.4.8 completed a systematic WCAG 2.2 AA contrast audit for Studio chrome
and Widget light/dark themes, fixed verified non-text and text contrast failures,
expanded deterministic Playwright contrast regressions, re-enabled axe
color-contrast on Studio chrome scopes, and preserved cross-browser gates.

**Engineering phase: COMPLETE in available environments.**  
**Formal WCAG / AT / physical-device release gates: remain OPEN.**

**PUBLIC WIDGET API: NOT AUTHORIZED**  
**PUBLIC RELEASE: NOT AUTHORIZED**

## 2. Starting Git baseline

| Item | Value |
| --- | --- |
| Branch | `main` |
| Expected tip (phase brief) | `909745110be9dd7aff16f659e295b713379ec716` |
| Actual starting HEAD | `037be184ea3b3664e799df1b195788a5a9bb16ef` (rewritten equivalent of 16.4.7 tip; local history preserved) |
| Prior report | `docs/reports/phase-16-4-7-assistive-technology-physical-device-gates.md` |
| Delivery | **Local commits only — no remote push** |

## 3. Scope and methodology

Audited Studio dark chrome, Widget dark/light themes, focus indicators, Object
Tree state communication, 320px reflow preservation, and representative
dialog/settings surfaces. Measurement uses WCAG relative luminance with sRGB
linearization and translucent compositing.

## 4. Contrast measurement methodology

See `docs/audits/contrast-wcag-2-2-aa-phase-16-4-8.md`.

## 5. Component and theme coverage

| Surface | Themes | States sampled |
| --- | --- | --- |
| Studio shell | Dark (shell-only) | default, focus-visible, disabled (exception), Object Tree lock/hide, 320px |
| Widget | Dark + Light | default text/muted, borders, focus-visible |
| Chart canvas pixels | n/a | NOT APPLICABLE (accessible name) |

## 6. Contrast findings (summary)

| Finding | Before | After | Status |
| --- | --- | --- | --- |
| Widget dark border vs panel | 1.71 | 3.73 (`#64748b`) | Fixed |
| Widget light border vs panel | 1.48 | 4.55+ (`#64748b`) | Fixed |
| Object-row separator mix | ~2.3 @65% | ≥3.05 @85% | Fixed |
| KlineScript line numbers | 3.70 | 6.48 (`#8b9cb3`) | Fixed |
| Studio text/muted/focus | already ≥ thresholds | retained | PASS |

## 7. Verified accessibility defects

Listed in §6. No remaining measured FAIL for audited token pairs.

## 8. Implemented fixes

- `src/widget/styles.ts` border tokens + object-row mix; synced
  `examples/vanilla/widget-openkline.css`
- `examples/nextjs-app-router/app/studio.module.css` line-number color
- Playwright `outputDir` → `artifacts/playwright-results` to avoid blocked
  root-owned `./test-results` on this host

## 9. Added regression tests

- Reworked `tests/react-browser/contrast-audit.spec.ts` + `contrast-utils.ts`
- New `tests/browser/widget-contrast.spec.ts`
- axe Studio chrome scopes now include `color-contrast`

## 10. Keyboard and focus verification

Prior keyboard suites retained; focus non-text contrast asserted for Studio and
Widget. 2.4.13 treated as AAA enhancement (PASS where measured).

## 11. WCAG assessment updates

- `docs/audits/wcag-2-2-aa-assessment-phase-16-4-8.md`
- Contrast inventory: `docs/audits/contrast-wcag-2-2-aa-phase-16-4-8.md`
- Formal conformance remains **OPEN**

## 12. AT and physical-device verification status

| Item | Status |
| --- | --- |
| NVDA / VoiceOver / TalkBack | **NOT TESTED** |
| Physical Android / iOS | **NOT TESTED** |

Templates remain under `docs/evidence/templates/`.

## 13. Cross-browser test results

| Suite | Result |
| --- | --- |
| typecheck | PASS |
| `npm test` | PASS **393/393** |
| api / studio / package / distribution / stress | PASS |
| `test:browser` Chromium | PASS **53 passed / 4 skipped** |
| `test:react:browser` ×5 | PASS **51/51** each |
| React serial | PASS **51/51** |
| Firefox quality/developer/contrast | PASS **6 passed / 3 skipped** |
| Mobile Chrome quality | PASS **2 / 3 skipped** |
| Docker WebKit contrast+quality | PASS **3 / 3 skipped** |

## 14. CSP and API verification

| Check | Result |
| --- | --- |
| `npm run api:check` | PASS |
| CSP style-src self Chromium/Firefox/WebKit | PASS |
| No CSP weakening | Confirmed |

## 15. Remaining release blockers

| Blocker | Severity | Closure |
| --- | --- | --- |
| Formal AT sessions | High | Execute AT protocol |
| Physical Android/iOS | High | Execute physical protocol |
| Formal WCAG claim | High | Close residual PARTIAL rows + AT |
| Exhaustive panel hover/error contrast matrix | Medium | Expand inventory |
| Studio light shell theme (if product requires) | Medium | Design decision |

## 16. Evidence locations

- This report
- `docs/audits/contrast-wcag-2-2-aa-phase-16-4-8.md`
- `docs/audits/wcag-2-2-aa-assessment-phase-16-4-8.md`
- Playwright contrast specs listed above

## 17. Git commit summary

| Item | Value |
| --- | --- |
| Starting SHA | `037be184ea3b3664e799df1b195788a5a9bb16ef` |
| Implementation | `8f28a3d08b1fad8e576b5950f78f05fcfa4626bb` |
| Documentation | `b11600995e49ace7f306967a5fd5255c4a035c29` |
| Final local tip | `b11600995e49ace7f306967a5fd5255c4a035c29` |
| Remote push | **NOT PERFORMED** |

## 18. Final authorization status

**PUBLIC WIDGET API: NOT AUTHORIZED**  
**PUBLIC RELEASE: NOT AUTHORIZED**

`PHASE 16.4.8 — ENGINEERING COMPLETE — CONTRAST GATES HARDENED — FORMAL WCAG/AT/PHYSICAL GATES OPEN`
