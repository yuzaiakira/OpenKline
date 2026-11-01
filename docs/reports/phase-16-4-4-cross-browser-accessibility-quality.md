# OpenKline Phase 16.4.4 — Cross-Browser, Accessibility, Visual Quality & Release-Gate Hardening

## Disposition

Phase 16.4.4 is **internally implemented and verified in available environments**.
Public Widget API adoption, package publication, tags/releases, license changes,
and Phase 16.4.5 remain **not authorized**.

| Item | Value |
| --- | --- |
| Repository | `yuzaiakira/OpenKline` |
| Starting SHA | `933d7ae644dd3e463c5d5be85d0baec7fcefcf91` |
| Branch | `main` |
| Required identity | `Akira Yuzai <yuzai.akira@gmail.com>` |
| Scope | Phase 16.4.4 only |
| Publication state | No npm publication, Git tag, GitHub release, or license change |

## Authorized scope

Confirmed correctness fixes, Widget accessibility improvements, cross-browser
compatibility within existing Playwright projects, test infrastructure
hardening, CSP enforcement checks, benchmarks, documentation, Conventional
Commits, and direct push to `origin/main`. Excludes public `@openkline/widget`
exports, protected API-baseline adoption, publication, and Phase 16.4.5.

## Browser provisioning

| Engine | Executable / cache | Version observed | Provisioning |
| --- | --- | --- | --- |
| Chromium desktop | Playwright cache `chromium-1248` + system `/usr/bin/chromium` for React | `156.0.8078.4` / HeadlessChrome `156.0.0.0` | Available |
| Firefox | `$PLAYWRIGHT_BROWSERS_PATH` → `$HOME/.cache/ms-playwright/firefox-1555` | `157.0` | Available when `PLAYWRIGHT_BROWSERS_PATH` is set |
| WebKit | Cached `webkit-2370` binary present | Launch fails | **BLOCKED** — missing `libicu74`, `libflite1`; `sudo npx playwright install-deps` unavailable |
| Mobile Chrome | Playwright `mobile-chrome` project (Chromium emulation) | Same Chromium family | Available (emulation only) |
| Mobile Safari | Playwright `mobile-safari` project (WebKit emulation) | Launch fails | **BLOCKED** (same WebKit system deps) |
| Physical Android/iOS | — | — | **NOT TESTED** |

Playwright CLI: `1.64.1`.

### Reproducible WebKit enablement (other environments)

```bash
export PLAYWRIGHT_BROWSERS_PATH="$HOME/.cache/ms-playwright"
# Requires privileged package install on Debian/Ubuntu-class hosts:
sudo npx playwright install-deps
# or:
sudo apt-get install libicu74 libflite1
npx playwright test --project=webkit tests/browser/widget-quality-gates.spec.ts
npx playwright test --project=mobile-safari tests/browser/widget-quality-gates.spec.ts
```

Do not substitute system Chromium for Firefox/WebKit results.

## Quality gate matrix

| Area | Classification |
| --- | --- |
| Chromium desktop | **PASS** |
| Firefox | **PASS** (with `PLAYWRIGHT_BROWSERS_PATH`) |
| WebKit | **BLOCKED** (system libraries) |
| Mobile Chrome emulation | **PASS** (touch hit-test) |
| Mobile Safari emulation | **BLOCKED** (WebKit deps) |
| Physical Android/iOS | **NOT TESTED** |
| Keyboard accessibility | **PASS** (Widget + Studio a11y suites) |
| Formal WCAG/AT | **OPEN** (no screen-reader environment) |
| Visual regression | **PARTIAL** (responsive Chromium screenshots + Studio visual review) |
| RTL/responsive | **PASS** (Widget quality gates Chromium/Firefox) |
| CSP enforcement | **PASS** (Chromium/Firefox enforced `style-src 'self'`) — not universal certification |
| Performance | **PASS** (local HeadlessChrome samples; not a guarantee) |
| Cleanup/lifecycle | **PASS** |
| API compatibility | **OPEN/FAIL** (inherited Chart / WorkspaceDocument / WorkspaceRestoreOptions) |
| Public Widget API | **NOT AUTHORIZED** |
| Release/publication | **NOT AUTHORIZED** |
| React default-parallel full suite | **PARTIAL** (serial PASS; intermittent Studio contention under `next dev`) |

## Accessibility hardening (engineering target — not certification)

### Widget defects fixed

| Change | Location |
| --- | --- |
| Root `role="region"` + `aria-describedby` status/error | `src/widget/controller.ts` |
| Chart grid `role="group"` labelled “Charts” | `controller.ts` |
| Status `aria-atomic`; error `aria-live="assertive"` | `controller.ts` |
| Panel titles as `h2` + `aria-labelledby` | `controller.ts` |
| Drawing toolbar / Replay `aria-modal="false"` (chart stays interactive) | `controller.ts` |
| Chart slot `role="img"`; empty state `aria-live="polite"` | `src/widget/chart-slot.ts` |
| Stronger muted/danger contrast tokens | `src/widget/styles.ts` |
| `prefers-reduced-motion` disables animations/transitions | `styles.ts` |
| Control min size 32×32; ≤640px viewport 44×44 | `styles.ts` |

### Studio / React a11y

- `tests/react-browser/accessibility.spec.ts` uses `test.describe.configure({ mode: "serial" })` so dialog focus cases remain stable under default workers.
- Focused accessibility suite: **4/4 PASS** with `--workers=4` and `--workers=1`.
- Formal assistive-technology (NVDA/VoiceOver/JAWS) testing: **OPEN**.

## Visual / responsive evidence

Chromium quality gate exercised host widths **320 / 375 / 768 / 1024 / 1440** with
light/dark and LTR/RTL covered in the desktop quality workflow. Screenshots:

`docs/reports/evidence/phase-16-4-4/widget-responsive-{320,375,768,1024,1440}.png`

Touch targets assert ≥44px height when the page viewport is ≤640px, otherwise ≥32px.
Snapshots were not auto-updated to hide regressions.

## CSP enforcement

| Mode | Policy | Result |
| --- | --- | --- |
| `styles.mode = "inject"` under `style-src 'self'` | Meta CSP in fixture | Construction allowed; `securitypolicyviolation` observer armed; cleanup verified |
| `styles.mode = "external"` | `examples/vanilla/widget-csp.html` | Ready without Widget-owned `<style>`; no `style-src` violations observed; destroy cleans canvases |
| Host CSS sync | `scripts/sync-widget-host-css.mjs` | Keeps `examples/vanilla/widget-openkline.css` aligned with `WIDGET_CSS` |

Universal CSP certification across every host policy remains **OPEN**. Bundled
public CSS package export remains a future contract (not modified this phase).

## React parallel / serial stability

| Run | Result |
| --- | --- |
| Accessibility focused `--workers=4` | PASS 4/4 |
| Accessibility focused `--workers=1` | PASS 4/4 |
| Full suite `--workers=1` | PASS **39/39** |
| Full suite default parallel (3 trials after navigation hardening) | 1× PASS 39; 2× FAIL 38/39 |
| `npm run test:react:production` | PASS 1/1 |
| Next.js Widget Strict Mode fixture | PASS |

### Flake conclusion

1. **Accessibility dialog flake** — mitigated by serial describe in
   `accessibility.spec.ts`; no longer the failing case under default workers.
2. **Residual Studio contention** — under shared `next dev` + multi-worker load,
   `studio.spec.ts` workspace-preservation intermittently times out on Object Tree
   Hide/Show controls (and previously `page.reload` / destroyed execution context).
   Hardened reload to `page.goto("/", { waitUntil: "load" })` and added
   `waitForLoadState` before multi-chart `matchMedia` evaluation.
3. Serial execution is **not** the only documented passing path for accessibility;
   the full suite’s reliable path in this environment is `--workers=1` or the
   production server subset. No blanket sleeps/retries/skips were added.

## Cross-browser Widget workflows exercised

On **Chromium** and **Firefox** (desktop): construction/destruction, layouts,
Datafeed/composition integrity, active chart, Indicator/Drawing/Object Tree/
Settings/Watchlist/Comparison/Replay panels, RTL/theme, CSP, cleanup.

On **Mobile Chrome**: genuine tap hit-testing for Watchlist open/close without
`force: true`.

Firefox allowlists were expanded in:

- `tests/browser/widget-developer-integration.spec.ts`
- `tests/browser/widget-datafeed-integrity.spec.ts`
- `tests/browser/widget-multichart.spec.ts`

New suite: `tests/browser/widget-quality-gates.spec.ts`.

## Data / replay / Composition regression safety

No Datafeed or Replay engine duplication. Existing integrity suites remain the
regression owners. Firefox + Chromium runs of datafeed integrity and multichart
specs **PASS**. Stress CI **PASS**. No unauthorized financial-engine changes.

## Performance measurements

Environment: Linux x86_64, HeadlessChrome `156.0.0.0`, local only — sample counts
are single-run harness outputs, not SLAs. Comparable to Phase 16.4.3 order of
magnitude; not treated as guaranteed FPS.

### `npm run benchmark:widget` (excerpt)

| Metric | Observation |
| --- | --- |
| Repeated mount/unmount (10 rounds) | median 2.3 ms / p95 2.7 ms |
| Multi-chart createMs (1k) | 3.6 ms |
| Layout switch median/p95 | 16.6 / 16.7 ms |
| Sync pan fpsMedian | ~60 |
| Destroy | listeners 0, chartSubscriptions 0, canvasCount 0, styleElementCount 0 |

### `npm run benchmark:browser`

| Candles | loadMs | rafFps | frameInterval p95 |
| --- | --- | --- | --- |
| 1k | 10.8 | 65.55 | 16.8 ms |
| 10k | 66.1 | 62.16 | 16.8 ms |
| 100k | 928.4 | 63.53 | 16.8 ms |

Memory after destroy returned near baseline; `remainingCanvasCount` 0.

### `npm run benchmark:multi-chart`

| Scenario | loadMs | remainingOwnedCanvases |
| --- | --- | --- |
| single-100k | 99 | 0 |
| dual-10k | 7.1 | 0 |
| dual-100k | 117.1 | 0 |

## Public API compatibility gate

| Command | Result |
| --- | --- |
| `npm run api:inventory` | PASS (inventory refreshed to current commit) |
| `npm run api:diagnostics` | `PASS_ADDITIVE_REVIEW_REQUIRED` |
| `npm run api:check` | **FAIL/OPEN** — unchanged protected baseline |

### Inherited declaration differences (not new in 16.4.4)

| Key | Nature | Notes |
| --- | --- | --- |
| `openkline:runtime:Chart` | Additive methods only (diagnostics) | Hash differs vs baseline `3e7a889…`; no removals |
| `openkline:type:WorkspaceDocument` | Additive optional members | corporateActions, multiTimeframe, orderFlow, sessionAnalysis, tradingCalendar, volumeAnalytics |
| `openkline:type:WorkspaceRestoreOptions` | Hash differs; diagnostics list no added/removed/changed members | Requires separate owner review of hash/baseline adoption |

**No difference was introduced by Phase 16.4.4 Widget/a11y work.** Baseline was
not modified. Widget remains unpublished/internal.

Migration implication: additive Chart/WorkspaceDocument surfaces are backward
compatible for existing callers; baseline adoption still needs explicit owner
approval before `api:check` can PASS.

## Package / consumer verification

| Check | Result |
| --- | --- |
| Core free of React | PASS (`package:check` / `distribution:check`) |
| Widget free of mandatory React/Next | PASS |
| Public exports unchanged | PASS |
| Vanilla fixtures | PASS |
| Next.js production integration | PASS (`test:react:production`) |
| No mandatory backend | PASS |
| No public `@openkline/widget` export | PASS (still absent) |

## Full verification commands

| Command | Result |
| --- | --- |
| `npm run build` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS **393/393** |
| `npm run test:browser` | PASS **52 passed**, **3 skipped** |
| Firefox Widget matrix (`PLAYWRIGHT_BROWSERS_PATH=…`) | PASS **10 passed**, **3 skipped** |
| Chromium quality gates | PASS **3 passed**, **1 skipped** |
| Mobile Chrome quality touch | PASS **1 passed**, **3 skipped** |
| WebKit / Mobile Safari quality | **BLOCKED** |
| `npm run test:react:browser -- --workers=1` | PASS **39/39** |
| `npm run test:react:browser` (default workers) | PARTIAL — intermittent Studio flake |
| `npm run test:react:production` | PASS |
| `npm run package:smoke` / `package:check` / `distribution:check` / `studio:check` | PASS |
| `npm run stress:ci` | PASS |
| `npm run benchmark:widget` / `browser` / `multi-chart` | PASS |

## Outstanding release blockers

1. Public Widget API / package export / publication — NOT AUTHORIZED
2. Protected API baseline adoption for Chart / WorkspaceDocument / WorkspaceRestoreOptions
3. WebKit + Mobile Safari system dependency provisioning
4. Physical device testing
5. Formal WCAG / assistive-technology certification
6. Universal CSP policy matrix
7. Residual React `next dev` multi-worker Studio flake (full suite)
8. License / tag / GitHub release gates

## Conventional Commit SHAs

| Commit | Role |
| --- | --- |
| `115fbb408893c3bfbe2713d14a7c1f22a92b2d20` | Implementation + tests + evidence |
| `0c6d9ddb27f77edec608ad5c330d6725d93b45db` | Documentation |
| `24f08e5533af77ffc1d09bb0e35818edb26c614a` | Delivery SHA record (pre-push tip) |

## Final remote state

| Check | Value |
| --- | --- |
| `HEAD == origin/main` | Verified after push |
| Working tree | Clean after push |
| Author/committer | `Akira Yuzai <yuzai.akira@gmail.com>` |

## Final status

`PHASE 16.4.4 — CROSS-BROWSER & ACCESSIBILITY QUALITY HARDENING COMPLETE / VERIFIED IN AVAILABLE ENVIRONMENTS — PUBLIC WIDGET API NOT AUTHORIZED`
