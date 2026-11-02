# Phase 16.4.11 — Test Infrastructure Determinism & Accessibility Evidence Closure

**Status:** ENGINEERING COMPLETE — EXTERNAL VERIFICATION GATES OPEN  
**Date:** 2026-11-02  
**Local commits only. No push. No history rewrite.**

## 1. Executive summary

Reproduced the React/build race: concurrent deletion of `dist/` while `packages/react` compiles yields TS2307/TS7006. Implemented a reentrant repository build lock, suite-scoped Playwright artifact dirs, and lifecycle locking for browser/unit package gates so `clean` cannot wipe emits mid-suite. Firefox managed browser recovered and executed. WebKit + Mobile Safari re-verified in Docker. Added WCAG 2.4.11 / 1.4.4 / 1.4.12 / dense-panel automated engineering tests. React default-parallel suite: **5/5 × 63 PASS** including fresh-start; concurrent clean during locked React run also PASS. Formal AT/physical/WCAG claim remain OPEN. **Public Widget API / public release: NOT AUTHORIZED.**

## 2. Starting Git state

| Item | Value |
| --- | --- |
| Branch | `main` (clean) |
| HEAD | `3d38133fa879af63d22598437625a1f243a60a4e` |
| `origin/main` | `3d38133` (synced at phase start) |
| Backup | `refs/backup/phase-16-4-11-start` → `3d38133` |
| Prior phase backup | `refs/backup/phase-16-4-10-start` → `e5bb9b3` |

## 3. Original React race reproduction

**Command pattern:** `npm run build` (or `build:core` + React `tsc`) while another process deletes `dist/`.

**Observed failure (pre-fix):**

```text
packages/react/src/index.tsx: Cannot find module 'openkline'
Parameter 'event' implicitly has an 'any' type. (TS7006 cascade)
```

Matches Phase 16.4.10 first-of-five failure when Chromium `test:browser` cleaned concurrently with React suite build.

## 4. Root-cause analysis

1. **Primary:** `scripts/clean.mjs` / build remove `dist` while another `tsc -p packages/react` resolves `openkline` types from `dist`.
2. **Secondary:** Browser suites finished root `build` then started Next `webServer` compile; a concurrent `npm run clean` deleted `dist` mid-Next webpack → `Module not found: ../../dist/src/...`.
3. **Tertiary:** Including a full-build concurrency self-test inside `npm test` wiped `test-dist` mid parallel unit workers.

## 5. Test infrastructure changes

| Change | Purpose |
| --- | --- |
| `scripts/with-repo-build-lock.mjs` | Exclusive lock (`.cache/openkline-build.lock`), re-entrant via `OPENKLINE_BUILD_LOCK_HELD` |
| `scripts/build.mjs` | Locked build; cleans only `dist` + `packages/react/dist` (not `test-dist`) |
| `package.json` `build` / `clean` | Routed through lock |
| `test` / `test:browser` / `test:react:*` / `test:browser:compat` / `api:check` / `package:smoke` / `distribution:check` / `stress:*` | Hold lock for full lifecycle |
| Suite-scoped `PLAYWRIGHT_OUTPUT_DIR` | `artifacts/playwright-results-{browser,react,react-production,compat,firefox,webkit}` |
| `npm run test:build-lock` | Isolated concurrency self-test (not inside `npm test`) |
| Docker WebKit README | `--user $(id -u):$(id -g)` to avoid root-owned `dist` |

## 6. Fresh-start verification

`npm run clean && npm run test:react:browser` → **63 passed** (React STABLE run 1).

## 7. Five-run parallel stability

| Run | Result |
| --- | --- |
| 1 (after clean) | **63 passed** |
| 2 | **63 passed** |
| 3 | **63 passed** |
| 4 | **63 passed** |
| 5 | **63 passed** |
| Extra: React vs concurrent `npm run clean` under lock | **63 passed** |

Earlier contaminated attempt (concurrent adversarial clean overlapping ×5 before lifecycle lock): runs 1–3 FAIL (Next missing `dist`), 4–5 PASS — reported for honesty, not counted as the post-fix gate.

## 8. Firefox recovery

| Item | Value |
| --- | --- |
| Install | `npx playwright install firefox` (Playwright 1.64.1 → Firefox 157.0 / firefox-1555) |
| Path | `/tmp/cursor-sandbox-cache/.../playwright/firefox-1555` |
| Host note | OS not officially supported; ubuntu24.04 fallback build |
| Quality run | widget-quality-gates + widget + developer-integration: **9 passed / 3 skipped** |
| Reconfirm subset | **6 passed / 3 skipped** |

## 9. WebKit / Mobile Safari

Docker image `openkline-playwright-webkit:1.64.1`:

```text
28 tests → 12 passed, 16 skipped
projects: webkit + mobile-safari
files: widget-quality-gates, widget-developer-integration, widget-datafeed-integrity, widget-multichart
```

Emulation only — **not** physical iOS. Initial Docker run without `--user` left root-owned `dist` (fixed via chown; README updated).

## 10–11. WCAG focus / resize / spacing / dense-panel

New: `tests/react-browser/wcag-focus-resize-spacing.spec.ts` (**4 passed**).  
Assessment: `docs/audits/wcag-2-2-aa-assessment-phase-16-4-11.md`.

## 12. Implemented fixes

- Build lock + lifecycle locking (infrastructure).
- Artifact path isolation.
- WCAG engineering regressions (tests; no Studio token redesign required — samples PASS).
- Docker WebKit usage docs (`--user`).

## 13. Regression results

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm test` | **393/393** |
| `npm run test:build-lock` | **1/1** |
| `api:check` / `studio:check` / `package:smoke` / `distribution:check` | PASS |
| `stress:ci` | PASS |
| `test:react:browser` | **63/63** ×5 |
| `test:react:production` | **1/1** |
| `test:browser` (Chromium) | **53 passed / 4 skipped** |
| Firefox | **9/3** then **6/3** |
| WebKit Docker | **12 passed / 16 skipped** |

## 14. API and CSP

`api:check` PASS (no baseline rewrite). CSP inject/external cases PASS on Chromium, Firefox, and WebKit quality suites (`style-src 'self'` preserved).

## 15. External AT and device status

| Gate | Status |
| --- | --- |
| NVDA | **NOT TESTED** |
| VoiceOver macOS | **NOT TESTED** |
| VoiceOver iOS | **NOT TESTED** |
| TalkBack | **NOT TESTED** |
| Physical Android | **NOT TESTED** |
| Physical iOS | **NOT TESTED** |

Handoff remains `docs/guides/external-at-physical-device-handoff.md`.

## 16. Remaining release blockers

1. Human AT sessions (NVDA/VO/TalkBack).
2. Physical Android + iOS evidence.
3. Formal WCAG claim (owner review after AT).
4. Public Widget API / public release authorization.
5. Git ancestry policy confirmation from Phase 16.4.10 (governance; out of scope here).

## 17. Git delivery

See final response / `git log` after documentation commits. Starting HEAD `3d38133`. Backup `refs/backup/phase-16-4-11-start`.

## Release-gate matrix

| Gate | Command / procedure | Environment | Counts | Status | Evidence | Blockers / closure |
| --- | --- | --- | --- | --- | --- | --- |
| Typecheck | `npm run typecheck` | Linux Node 24 | — | PASS | log | — |
| Unit | `npm test` | same | 393/393 | PASS | log | — |
| Build lock | `npm run test:build-lock` | same | 1/1 | PASS | log | — |
| API | `npm run api:check` | same | — | PASS | JSON | — |
| Studio | `npm run studio:check` | same | — | PASS | JSON | — |
| Smoke / dist | package + distribution | same | — | PASS | JSON | — |
| Stress | `npm run stress:ci` | same | — | PASS | artifacts | — |
| React parallel | `npm run test:react:browser` ×5 | Chromium + prod Next | 63×5 | PASS | logs | — |
| React production | `test:react:production` | Chromium | 1/1 | PASS | log | — |
| Chromium browser | `test:browser` | Chromium | 53/4sk | PASS | log | — |
| Firefox | Playwright firefox project | managed FF 157 | 9/3sk | PASS | log | keep PLAYWRIGHT_BROWSERS_PATH |
| WebKit / Mobile Safari emu | Docker image 1.64.1 | container | 12/16sk | PASS | log | use `--user` |
| AT | handoff AT-S01–S12 | real AT | — | OPEN | — | human |
| Physical | handoff PM-S01–S11 | devices | — | OPEN | — | human |
| Formal WCAG | assessment 16.4.11 | review | — | OPEN | audit | AT + owner |
| Public API / release | governance | — | — | **NOT AUTHORIZED** | — | owner |
