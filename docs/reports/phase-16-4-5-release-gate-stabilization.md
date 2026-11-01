# OpenKline Phase 16.4.5 — Release-Gate Stabilization & Verification Hardening

## 1. Executive summary

Phase 16.4.5 recovers the strict public API compatibility gate for additive-only
inherited declaration drift, stabilizes React/Studio default-parallel browser
tests by serving a production Next.js build (eliminating `next dev` HMR
contention), hardens Object Tree readiness semantics, expands automated
accessibility and Mobile Chrome coverage, and documents a reproducible WebKit
container path for hosts missing Playwright system libraries.

**PUBLIC WIDGET API: NOT AUTHORIZED**  
**PUBLIC RELEASE: NOT AUTHORIZED**

## 2. Starting repository baseline

| Item | Value |
| --- | --- |
| Branch | `main` |
| Starting HEAD | `4af4cc5e6d00bce7cde8a1666a95672947d5aa47` |
| Prior phase | 16.4.4 — `docs/reports/phase-16-4-4-cross-browser-accessibility-quality.md` |
| Working tree at start | Clean |

## 3. Identified root causes

| Area | Root cause |
| --- | --- |
| `api:check` FAIL | Strict baseline at `3e7a889…` lagged additive-only public surface (`Chart` +46 methods, `WorkspaceDocument` +6 optional fields, `WorkspaceRestoreOptions` +`tradingCalendarResolver`). Diagnostics: zero removals / incompatible changes. |
| React parallel flake | Shared `next dev` webpack HMR under multi-worker Playwright load caused intermittent Object Tree / navigation failures. Not an Object Tree financial-engine defect. |
| Lifecycle remount assertion | Production React does not Strict-Mode double-invoke effects; hard-coded `+2` setup/cleanup deltas failed after switching to production server. |
| WebKit / Mobile Safari | Playwright WebKit needs ICU 74 + flite libraries; host has ICU 78 and no flite. Docker daemon unavailable in this environment. |
| Formal AT / physical devices | No screen-reader or physical-device lab available. |

## 4. Implemented changes

1. **API** — Owner-reviewed additive baseline adoption record; `npm run api:inventory -- --write-baseline`; diagnostics now compare `WorkspaceRestoreOptions`.
2. **React tests** — `playwright.react.config.ts` serves `next build && next start` (`.next-playwright`) instead of `next dev`.
3. **Studio Object Tree** — `data-object-tree-ready`, `data-drawing-*` attributes; null-safe chart handle guards; studio/accessibility tests assert attribute transitions.
4. **Lifecycle** — Remount assertions accept production (`+1`) or Strict Mode (`+2`) deltas while requiring `setup === cleanup + 1`.
5. **Accessibility** — Keyboard Object Tree hide/show coverage.
6. **Mobile** — Mobile Chrome Object Tree / Chart Settings after viewport rotation.
7. **WebKit** — `docker/playwright-webkit/` Dockerfile + README (not executed here — Docker daemon absent).

## 5. API compatibility findings

| Command | Result |
| --- | --- |
| `npm run api:diagnostics` (pre-adoption) | `PASS_ADDITIVE_REVIEW_REQUIRED`, findings `[]`, WorkspaceRestoreOptions additive optional member confirmed |
| Baseline adoption record | `docs/reviews/public-api-baseline-adoption-phase-16-4-5.md` |
| `npm run api:inventory -- --write-baseline` | PASS — baseline rewritten |
| `npm run api:check` (post-adoption) | **PASS** — `removed: []`, `changed: []` |

Adoption refreshes the strict hash baseline only. It does not authorize Widget
publication, npm release, license activation, or claim long-term API freeze for
every additive surface.

## 6. Parallel-test stabilization evidence

Environment: production Next.js on `127.0.0.1:4174`, Chromium `/usr/bin/chromium`.

| Mode | Runs | Result |
| --- | --- | --- |
| Default parallel | 5 independent | **5/5 PASS — 40 passed each** |
| `--workers=1` | 1 | **PASS — 40 passed** |

Previous Phase 16.4.4 Object Tree Hide/Show intermittency under `next dev` did
not recur. Suite count rose from 39→40 with the new Object Tree a11y test.

## 7. Cross-browser results

| Project | Result | Notes |
| --- | --- | --- |
| Chromium desktop (`test:browser` + quality gates) | PASS | |
| Firefox (quality gates via `PLAYWRIGHT_BROWSERS_PATH`) | PASS | |
| Mobile Chrome emulation | PASS | Watchlist tap + Object Tree/settings rotation |
| WebKit desktop (host) | **BLOCKED** | Missing `libicu74`, `libflite1`, etc. |
| Mobile Safari emulation (host) | **BLOCKED** | Same WebKit deps |
| WebKit via Docker image | **NOT TESTED** | Docker daemon not running (`/var/run/docker.sock` absent) |
| Physical Android/iOS | **NOT TESTED** | |

WebKit recovery recipe: `docker/playwright-webkit/README.md`.

## 8. Accessibility findings and verification scope

| Layer | Status |
| --- | --- |
| Automated Studio/Widget a11y checks | PASS (expanded Object Tree keyboard test) |
| Manual keyboard verification | Covered by automated keyboard Object Tree + prior Phase 16.4.4 suites |
| Screen-reader / AT | **OPEN / NOT TESTED** |
| Formal WCAG conformance | **OPEN** — engineering target only |

## 9. Mobile coverage and limitations

Automated Mobile Chrome: Widget watchlist tap, Object Tree open, landscape
rotation, Chart Settings. Emulation only.

### Physical-device verification checklist (remaining)

1. Install a production Studio/Widget host build on a physical Android phone and an iPhone/iPad.
2. Verify touch drawing placement, pinch-zoom, and Object Tree hide/show.
3. Verify modal focus trap and Escape dismissal with hardware keyboard if available.
4. Verify CSP `styles.mode=external` under the host WebView/Safari policy.
5. Capture device model, OS version, browser version, and pass/fail notes.
6. Do not treat emulator PASS as physical PASS.

## 10. Full release-gate matrix

| Gate | Command / procedure | Result |
| --- | --- | --- |
| Typecheck | `npm run typecheck` | PASS |
| Node tests | `npm test` | PASS **393/393** |
| API check | `npm run api:check` | **PASS** |
| Studio check | `npm run studio:check` | PASS |
| Package smoke/check | `npm run package:smoke` / `package:check` | PASS |
| Distribution | `npm run distribution:check` | PASS |
| Browser Chromium suite | `npm run test:browser` | PASS **52 passed**, **4 skipped** |
| React parallel ×5 | `npm run test:react:browser` | PASS **40/40** ×5 |
| React serial | `npm run test:react:browser -- --workers=1` | PASS **40/40** |
| React production subset | `npm run test:react:production` | PASS **1/1** |
| Stress | `npm run stress:ci` | PASS |
| Firefox Widget quality | Playwright `--project=firefox` quality gates | PASS |
| Mobile Chrome quality | Playwright `--project=mobile-chrome` | PASS |
| WebKit / Mobile Safari | Host Playwright | **BLOCKED** |
| WebKit container | Docker image | **NOT TESTED** (daemon absent) |
| Formal AT / WCAG | — | **OPEN** |
| Physical devices | — | **NOT TESTED** |
| Public Widget API | — | **NOT AUTHORIZED** |
| Public release | — | **NOT AUTHORIZED** |

## 11. Remaining blockers and residual risks

1. WebKit/Mobile Safari execution on this host (library / Docker daemon).
2. Physical Android/iOS evidence.
3. Formal assistive-technology certification.
4. Universal CSP certification beyond representative `style-src 'self'` fixtures.
5. Public Widget package / release / license decisions remain out of scope.
6. Additive API baseline adoption is not a commitment that every additive method is permanently frozen without future review.

## 12. Final authorization status

| Authorization | Status |
| --- | --- |
| Phase 16.4.5 engineering completion | Complete in available environments |
| Public Widget API | **NOT AUTHORIZED** |
| Public release / npm publish / tags | **NOT AUTHORIZED** |
| Full release readiness | **NOT DECLARED** — mandatory external gates remain OPEN/BLOCKED/NOT TESTED |

## 13. Commit references and delivery details

| Item | Value |
| --- | --- |
| Starting SHA | `4af4cc5e6d00bce7cde8a1666a95672947d5aa47` |
| Implementation | `778fca7be8d95244848b7ce734a2c5b3bf88c770` |
| Documentation | `d0be115c95ed72debc3d28720ea96cbaadfdd69d` |
| Final tip | See `git rev-parse origin/main` after delivery push |
| Remote | `origin/main` synchronized |
| Author | `Akira Yuzai <yuzai.akira@gmail.com>` |
| Working tree | Clean after delivery |

## Final status line

`PHASE 16.4.5 — RELEASE-GATE STABILIZATION & VERIFICATION HARDENING COMPLETE / VERIFIED IN AVAILABLE ENVIRONMENTS — PUBLIC WIDGET API NOT AUTHORIZED — PUBLIC RELEASE NOT AUTHORIZED`
