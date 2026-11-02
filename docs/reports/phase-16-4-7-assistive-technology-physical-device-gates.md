# OpenKline Phase 16.4.7 — Assistive-Technology & Physical-Device Gate Closure

## 1. Executive summary

Phase 16.4.7 expands automated WCAG 2.2 AA evidence, fixes a verified Studio
**reflow** defect at 320 CSS pixels, adds Object Tree lock/target-size/focus/
axe regressions, and delivers reproducible AT and physical-device evidence
templates plus an environment probe proving those gates remain unverified on
this host.

**Engineering phase implementation: COMPLETE in available environments.**  
**Formal AT / physical-device / WCAG conformance release gates: remain OPEN.**

**PUBLIC WIDGET API: NOT AUTHORIZED**  
**PUBLIC RELEASE: NOT AUTHORIZED**

## 2. Starting repository state

| Item | Value |
| --- | --- |
| Branch | `main` |
| Starting HEAD | `faa891eea52755072c1bd2abd876a581842fcaab` |
| Prior report | `docs/reports/phase-16-4-6-cross-platform-release-gate-closure.md` |
| Working tree | Clean |
| Delivery mode | **Local commits only — no remote push** |

## 3. Implementation changes

1. Expanded `tests/react-browser/accessibility.spec.ts`:
   - Object Tree Lock/Unlock keyboard cycle
   - WCAG 2.2 AA 24px target-size assertion for Object Tree controls
   - Focus-indicator assertion on Studio chrome
   - 320px reflow regression (document scrollWidth)
2. Expanded `tests/react-browser/axe-accessibility.spec.ts` with Object Tree
   lock/unlock axe WCAG tag audit.
3. Fixed Studio reflow overflow (`examples/nextjs-app-router/app/studio.module.css`):
   - Sidebar `flex-basis` no longer forces >viewport width under ≤1050px
   - Added ≤360px reflow rules for chrome grids/select min-widths
4. Evidence templates:
   - `docs/evidence/templates/at-verification-result.md`
   - `docs/evidence/templates/physical-mobile-result.md`
5. Environment probe: `docs/evidence/phase-16-4-7/environment-probe.md`
6. WCAG matrix: `docs/audits/wcag-2-2-aa-assessment-phase-16-4-7.md`
7. Protocol updates linking templates and clarifying automation ≠ AT/physical PASS.

## 4. Assistive-technology verification

| Combination | Result | Reason |
| --- | --- | --- |
| NVDA + Windows browser | **NOT TESTED** | No Windows/NVDA environment |
| VoiceOver + macOS Safari | **NOT TESTED** | No macOS host |
| VoiceOver + iOS Safari | **NOT TESTED** | No physical iOS device |
| TalkBack + Android Chrome | **NOT TESTED** | `adb devices` empty; no TalkBack session |
| Orca/espeak | **NOT TESTED** | Not installed; not accepted as NVDA/VoiceOver/TalkBack substitute |

Keyboard-only and axe automated suites **PASS** and complement AT protocols; they
are **not** reported as screen-reader verification.

## 5. WCAG 2.2 AA assessment matrix

See `docs/audits/wcag-2-2-aa-assessment-phase-16-4-7.md`.

Highlights:

| Area | Result |
| --- | --- |
| Automated axe serious/critical (audited scopes) | PASS (3/3 axe specs) |
| Keyboard / focus / Object Tree names & states | PASS |
| Target size 2.5.8 (Object Tree) | PASS |
| Reflow 1.4.10 (Studio chrome @ 320px) | PASS after defect fix |
| Formal conformance claim | **OPEN / NOT CLAIMED** |
| AT evaluation of criteria | **NOT TESTED** |

## 6. Physical Android results

**PHYSICAL ANDROID: NOT TESTED**

- `adb` present; daemon started; device list empty.
- No USB Android device detected.

## 7. Physical iOS results

**PHYSICAL IOS: NOT TESTED**

- `idevice_id` unable to retrieve device list.
- No `xcrun` / Xcode simulator tooling.
- No USB Apple device detected.

Mobile Chrome / Mobile Safari Playwright results remain **emulation only**.

## 8. Mobile accessibility findings

| Finding | Classification | Action |
| --- | --- | --- |
| Studio document horizontal overflow at 320px (sidebar `flex: 1 1 330px` and fixed min-widths) | FAIL → fixed | CSS reflow hardening + regression test |
| Object Tree Hide/Show/Lock keyboard + names | PASS | Extended lock cycle coverage |
| Emulated mobile touch/rotation quality gates | PASS | Host Mobile Chrome 2/3sk; Docker Mobile Safari 2/2 quality touch tests |
| Physical touch / safe-area / virtual keyboard | NOT TESTED | Protocol + template ready |

## 9. Cross-browser regression results

| Command / suite | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm test` | PASS **393/393** |
| `npm run api:check` | PASS |
| `npm run studio:check` | PASS |
| `npm run package:smoke` | PASS |
| `npm run distribution:check` | PASS |
| `npm run stress:ci` | PASS |
| `npm run test:browser` | PASS **52 passed / 4 skipped** |
| `npm run test:react:browser` ×5 | **5/5 PASS — 46/46** each |
| `npm run test:react:browser -- --workers=1` | PASS **46/46** |
| Accessibility + axe focused | PASS **11/11** |
| Firefox quality + developer | PASS **5 passed / 3 skipped** |
| Mobile Chrome quality | PASS **2 passed / 3 skipped** |
| Docker WebKit + Mobile Safari quality | PASS **4 passed / 6 skipped** |
| Host-native WebKit execution | BLOCKED (inherited ICU74/flite; Docker path used) |

## 10. API and CSP verification

| Check | Result |
| --- | --- |
| `npm run api:check` | PASS — no removals/changes vs baseline |
| CSP `style-src 'self'` Chromium quality | PASS |
| CSP Firefox quality | PASS |
| CSP WebKit Docker quality | PASS |
| No CSP weakening | Confirmed |

## 11. Outstanding release blockers

| Blocker | Severity | Closure path |
| --- | --- | --- |
| Formal AT sessions (NVDA/VoiceOver/TalkBack) | High for a11y release claims | Execute AT protocol; store under `docs/evidence/` |
| Physical Android | High for mobile release claims | Attach device; complete physical template |
| Physical iOS | High for mobile release claims | Attach device; complete physical template |
| Formal WCAG 2.2 AA claim | High | Close PARTIAL/NOT TESTED rows in assessment matrix with evidence |
| Full contrast certification | Medium | Dedicated contrast audit including non-canvas chrome |
| Host-native WebKit | Medium | Continue Docker/CI path |

## 12. Reproducible verification procedures

- AT: `docs/guides/wcag-assistive-technology-protocol.md` + `docs/evidence/templates/at-verification-result.md`
- Physical: `docs/guides/physical-mobile-verification-protocol.md` + `docs/evidence/templates/physical-mobile-result.md`
- Automated a11y:  
  `npm run test:react:browser -- tests/react-browser/accessibility.spec.ts tests/react-browser/axe-accessibility.spec.ts`
- Environment probe record: `docs/evidence/phase-16-4-7/environment-probe.md`

## 13. Final engineering status

`PHASE 16.4.7 — IMPLEMENTATION COMPLETE — AT/PHYSICAL/WCAG GATES PARTIALLY OPEN — PUBLIC WIDGET API NOT AUTHORIZED — PUBLIC RELEASE NOT AUTHORIZED`

## 14. Git commit references

| Item | Value |
| --- | --- |
| Starting SHA | `faa891eea52755072c1bd2abd876a581842fcaab` |
| Implementation | `b0a41cc829b875e361b29056c26367bea18d6c9b` |
| Documentation | `57d2734bd9e649f16af41ae4d61a0b9e09bbf0d6` |
| Final local tip | `57d2734bd9e649f16af41ae4d61a0b9e09bbf0d6` |
| Remote push | **NOT PERFORMED** (phase rule) |
| Author | repository Git config (unchanged) |
