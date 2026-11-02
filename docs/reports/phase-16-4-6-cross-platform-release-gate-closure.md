# OpenKline Phase 16.4.6 — Cross-Platform Verification, Accessibility Compliance & Release-Gate Closure

## 1. Executive summary

Phase 16.4.6 delivers **executable WebKit evidence** via the Playwright Docker
image, a reproducible GitHub Actions workflow, expanded cross-browser allowlists,
axe-core Studio accessibility regressions with verified ARIA/title/target-size
fixes, independent API baseline audit confirmation, CSP matrix evidence on
Chromium/Firefox/WebKit, and explicit protocols for assistive technology and
physical devices.

**Engineering phase implementation: COMPLETE in available environments.**  
**Full release-gate closure: NOT achieved** — formal AT, physical devices, and
universal CSP certification remain OPEN/NOT TESTED.

**PUBLIC WIDGET API: NOT AUTHORIZED**  
**PUBLIC RELEASE: NOT AUTHORIZED**

## 2. Starting Git baseline

| Item | Value |
| --- | --- |
| Branch | `main` |
| Starting HEAD | `246c5d087132de2fcbfcfa6a7f6f398b67b21e3a` |
| Prior report | `docs/reports/phase-16-4-5-release-gate-stabilization.md` |
| Working tree | Clean |

## 3. Environment inventory

| Resource | Status |
| --- | --- |
| Host OS | Manjaro Linux, ICU 78 (no libicu74/flite) |
| Playwright | `@playwright/test` ^1.64.1 |
| Chromium | Host `/usr/bin/chromium` + Playwright cache |
| Firefox | `$HOME/.cache/ms-playwright/firefox-1555` — version 157.0 |
| WebKit host | BLOCKED — missing `libicu74`, `libflite1` |
| Docker daemon | Available with docker group access |
| Playwright image | `mcr.microsoft.com/playwright:v1.64.1-jammy` |
| GitHub Actions | Workflow added; run evidence requires Actions execution after push |
| Physical devices / AT | Unavailable in this environment |
| `gh` CLI | Authenticated as `yuzaiakira` |

## 4. Implemented code and CI changes

1. `.github/workflows/webkit-compat.yml` — containerized WebKit + Mobile Safari quality gates.
2. `docker/playwright-webkit/` — README updated with exact run commands.
3. Browser allowlists expanded to include `webkit` / `mobile-safari` for Widget quality, developer-integration, datafeed, and multichart suites.
4. `@axe-core/playwright` + `tests/react-browser/axe-accessibility.spec.ts`.
5. Studio a11y fixes: document `title`, tab semantics (`role="tablist"/"tab"`), WCAG 2.2 AA 24px target sizes for buttons/checkboxes/summaries/Object Tree controls.
6. Test updates for tab roles (`Walk-Forward`, `Trades`).
7. Manual protocols: `docs/guides/wcag-assistive-technology-protocol.md`, `docs/guides/physical-mobile-verification-protocol.md`.
8. Independent API audit: `docs/reviews/public-api-independent-audit-phase-16-4-6.md`.

## 5. WebKit execution findings

| Path | Result |
| --- | --- |
| Host `npx playwright … --project=webkit` | **BLOCKED** — system libraries |
| Docker `openkline-playwright-webkit:1.64.1` quality + developer + datafeed + multichart | **PASS** — see counts below |
| GitHub Actions `webkit-compat` | Workflow delivered; **execution NOT TESTED until Actions run after push** |

### Docker WebKit evidence (executed this phase)

```text
Image: openkline-playwright-webkit:1.64.1
Base: mcr.microsoft.com/playwright:v1.64.1-jammy
Final combined Docker command:
  npx playwright test --project=webkit --project=mobile-safari \
    tests/browser/widget-quality-gates.spec.ts \
    tests/browser/widget-developer-integration.spec.ts \
    tests/browser/widget-datafeed-integrity.spec.ts \
    tests/browser/widget-multichart.spec.ts
Result: 12 passed, 16 skipped (project/fixture allowlist skips only)
```

Host WebKit remains BLOCKED; Docker WebKit is the verified execution path.

## 6. Mobile Safari emulation findings

Executed inside the same Docker Playwright image (`--project=mobile-safari`).
Touch watchlist + Object Tree/settings rotation tests are allowlisted for
`mobile-safari`. Results are **emulation only** — not physical iOS Safari.

## 7. Cross-browser verification matrix

| Browser / project | Environment | Result |
| --- | --- | --- |
| Chromium desktop | Host `npm run test:browser` | PASS — **52 passed**, **4 skipped** |
| Firefox desktop | Host Playwright quality + developer | PASS — **5 passed**, **3 skipped** |
| WebKit desktop | Docker Playwright image | PASS (Widget quality/datafeed/multichart suites) |
| Mobile Chrome | Host | PASS — **2 passed**, **3 skipped** (quality gates) |
| Mobile Safari emulation | Docker | PASS (emulation allowlisted tests) |
| Physical Android/iOS | — | **NOT TESTED** |

Production Next.js serving for React/Studio tests is preserved (Phase 16.4.5).

## 8. Accessibility audit findings

| Finding | Fix |
| --- | --- |
| `aria-selected` on plain `<button>` (Optimizer/Tester) | `role="tablist"` + `role="tab"` |
| Missing document `<title>` on Studio | Next.js `metadata.title = "OpenKline Studio"` |
| Target size &lt; 24px on buttons/checkboxes/summaries/Object Tree | CSS min 24×24 |

## 9. WCAG 2.2 AA assessment status

| Area | Classification |
| --- | --- |
| Automated axe-core (Studio shell + dialog/Object Tree scope) | PASS (serious/critical cleared in focused suite) |
| Keyboard Object Tree / dialogs (Playwright) | PASS |
| Formal WCAG 2.2 AA conformance claim | **OPEN / NOT TESTED** |
| Screen-reader AT | **NOT TESTED** |

Protocol: `docs/guides/wcag-assistive-technology-protocol.md`.

## 10. Assistive-technology test coverage

| Tool | Status |
| --- | --- |
| NVDA | NOT TESTED |
| VoiceOver macOS/iOS | NOT TESTED |
| TalkBack | NOT TESTED |

## 11. Physical-device verification status

| Platform | Status |
| --- | --- |
| Physical Android | **NOT TESTED** |
| Physical iOS | **NOT TESTED** |

Protocol: `docs/guides/physical-mobile-verification-protocol.md`.

## 12. CSP security verification

| Browser | Policy | Functionality | Result |
| --- | --- | --- | --- |
| Chromium | Enforced `style-src 'self'` (Widget CSP fixture + inject violation observer) | Ready + cleanup | PASS |
| Firefox | Same | Ready + cleanup | PASS |
| WebKit (Docker) | Same allowlisted quality CSP test | Exercised under WebKit project | PASS |
| Universal host-policy matrix | — | — | OPEN |

No CSP weakening (`unsafe-inline` style exceptions) was introduced.

## 13. API compatibility audit

| Check | Result |
| --- | --- |
| `npm run api:check` | **PASS** |
| `npm run api:diagnostics` | `PASS_ADDITIVE_REVIEW_REQUIRED`, `findings: []` |
| Independent review | `docs/reviews/public-api-independent-audit-phase-16-4-6.md` — no concealed breaking changes; no baseline rewrite |
| Public Widget exports | Still absent |

## 14. Regression-test results

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm test` | PASS **393/393** |
| `npm run api:check` | PASS |
| `npm run studio:check` | PASS |
| `npm run package:smoke` / `package:check` / `distribution:check` | PASS |
| `npm run stress:ci` | PASS |
| `npm run test:browser` | PASS **52/4 skipped** (retry after transient `ERR_NETWORK_CHANGED`) |
| `npm run test:react:browser` ×5 default parallel | **5/5 PASS — 42/42** |
| `npm run test:react:browser -- --workers=1` | PASS **42/42** |
| `npm run test:react:production` | PASS |
| axe accessibility | PASS **2/2** |
| Firefox quality/developer | PASS |
| Mobile Chrome quality | PASS |
| WebKit Docker suites | PASS |
| Host WebKit | BLOCKED |

## 15. Release-gate decision matrix

| Gate | Required scope | Environment | Command / procedure | Status | Evidence | Residual risk | Satisfied? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| API compatibility | Strict public surface | Host | `npm run api:check` | PASS | audit review | Additive breadth | Yes |
| Node regression | Core correctness | Host | `npm test` | PASS 393/393 | logs | — | Yes |
| React parallel stability | Studio | Host production Next | `test:react:browser` ×5 | PASS 42×5 | logs | — | Yes |
| Chromium browser | Widget/Core browser | Host | `test:browser` | PASS 52/4sk | logs | — | Yes |
| Firefox | Widget quality | Host | Playwright firefox | PASS | logs | — | Yes |
| WebKit | Widget quality | Docker | Playwright webkit | PASS | Docker logs | Host still blocked | Yes (Docker path) |
| Mobile Chrome emulation | Touch/responsive | Host | Playwright mobile-chrome | PASS | logs | Emulation only | Partial (emulation) |
| Mobile Safari emulation | Touch/responsive | Docker | Playwright mobile-safari | PASS | Docker logs | Emulation only | Partial (emulation) |
| Physical Android/iOS | Device UX | Devices | Protocol guide | NOT TESTED | protocol | High for mobile release | No |
| Automated a11y | Studio axe + keyboard | Host | axe + a11y specs | PASS | logs | Dense UI residual | Partial |
| Formal WCAG/AT | Conformance | AT lab | Manual protocol | OPEN | protocol | High for a11y claim | No |
| CSP enforcement | Widget styles | Chromium/Firefox/WebKit | quality CSP tests | PASS | logs | Not universal | Partial |
| Package/distribution | Packaging | Host | package/distribution checks | PASS | logs | — | Yes |
| Public Widget API | Publication | — | — | NOT AUTHORIZED | — | — | No |
| Public release | npm/tag/license | — | — | NOT AUTHORIZED | — | — | No |

## 16. Unresolved blockers and risk severity

| Blocker | Severity | Closure path |
| --- | --- | --- |
| Formal AT / WCAG certification | High for a11y release claims | Execute `docs/guides/wcag-assistive-technology-protocol.md` |
| Physical Android/iOS | High for mobile release claims | Execute physical-device protocol on real devices |
| Host-native WebKit | Medium | Install ICU74/flite or always use Docker/CI |
| GitHub Actions WebKit run evidence | Medium | Inspect first successful Actions run after push |
| Universal CSP certification | Medium | Expand policy matrix beyond Widget fixtures |

## 17. Recommended next actions

1. Confirm `.github/workflows/webkit-compat.yml` green on GitHub Actions and archive the run URL.
2. Schedule AT sessions (NVDA + VoiceOver) against the recorded SHA.
3. Run physical Android Chrome + iOS Safari protocol and attach evidence.
4. Keep Public Widget API unpublished until product/legal authorization.

## 18. Commits and remote delivery status

| Item | Value |
| --- | --- |
| Starting SHA | `246c5d087132de2fcbfcfa6a7f6f398b67b21e3a` |
| Implementation / docs commits | _(filled at delivery)_ |
| Final tip | _(filled at delivery)_ |
| Remote | `origin/main` |
| Author | `Akira Yuzai <yuzai.akira@gmail.com>` |

## Outcome classification

`PHASE 16.4.6 — IMPLEMENTATION COMPLETE — RELEASE GATES PARTIALLY OPEN — PUBLIC WIDGET API NOT AUTHORIZED — PUBLIC RELEASE NOT AUTHORIZED`
