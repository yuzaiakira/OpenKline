# Phase 8.8.4 Studio Cross-Browser Defect Remediation Verification

Date: 2026-10-26  
Status: **Engineering remediation complete; Studio compatibility gates open**

## Scope and evidence boundary

This report records the Phase 8.8.4 remediation of the trusted Phase 8.8.3
Studio probe. It does not convert the previous trusted result into a current
revision browser-compatibility claim.

The integrated Phase 8.8.3 evidence was produced on a trusted Manjaro host in
the official Playwright container, not in this cloud environment:

- Playwright: `1.64.1`
- Image: `mcr.microsoft.com/playwright:v1.64.1-noble`
- Image digest: `sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea`
- Evidence source commit: `8a62e324cf0bcb25c79d380d25269ddda33c3deb`
- Standalone result: 70 expected, 70 passed, 0 unexpected
- Studio result: 105 expected, 75 passed, 30 unexpected

The cloud environment validated the evidence structure and provenance. It did
not execute the Playwright-managed Firefox, WebKit, or mobile projects. The
source remediation in this report is therefore locally verified but still
requires a trusted managed-browser rerun before current-revision support is
claimed.

## Implemented remediation

The following changes were made without changing the chart public API or the
standalone chart architecture:

1. The mobile Studio layout puts object-tree, watchlist-action, chart, and
   sidebar blocks into normal responsive flow. Desktop absolute overlays are
   no longer allowed to cover mobile controls or chart panels.
2. Canvas pointer coordinates are normalized from the element bounding box to
   the logical Canvas2D coordinate space. This covers CSS scaling and browser
   pointer/touch coordinate differences. Canvas `touch-action: none` preserves
   chart-owned touch gestures.
3. Chart resize is idempotent when logical size, device-pixel ratio, and
   backing dimensions are unchanged. This avoids redundant observer feedback
   and preserves real resize behavior.
4. The responsive multi-chart test now verifies the intended inactive-panel
   visibility rule and switches panels before asserting panel-local state.
   It also performs hit-test checks before mobile controls are clicked; no
   forced clicks were added.
5. The drawing test chooses a touch tap only for touch contexts and a mouse
   click for desktop contexts.

The implementation commit is:
`658d65d5ce020a3fbf75ae18767c47b4d1513462`.

## Phase 8.8.3 failure matrix

The following ledger contains all 30 records from
`docs/evidence/browser/phase-8-8-3/studio-failures.json`. The observed error or
assertion is recorded separately from disposition. A timeout without a nested
action error is not treated as proof of a product defect.

| # | Project | Test file | Classification | Observed error or assertion | Phase 8.8.4 disposition |
|---:|---|---|---|---|---|
| 1 | mobile Chrome | `accessibility.spec.ts` | timeout | 30s test timeout | Diagnostic evidence insufficient; no root cause claimed. Trusted rerun required. |
| 2 | mobile Chrome | `accessibility.spec.ts` | timeout | 30s test timeout | Diagnostic evidence insufficient; no root cause claimed. Trusted rerun required. |
| 3 | mobile Chrome | `multi-chart-studio.spec.ts` | timeout-pointer-interception | Watchlist `<li>` intercepted `Add` | Confirmed responsive overlay/hit-test defect; mobile flow and hit-test regression added. Trusted rerun required. |
| 4 | mobile Chrome | `multi-chart-studio.spec.ts` | timeout | `Drawings (1)` did not become visible before timeout | Downstream timeout with insufficient nested action evidence; no separate cause claimed. |
| 5 | mobile Chrome | `multi-chart-studio.spec.ts` | assertion-element-not-found | `Drawings (1)` not found | Touch/canvas coordinate path corrected locally; trusted rerun required. |
| 6 | mobile Chrome | `multi-chart-studio.spec.ts` | timeout-pointer-interception | Strategy Optimizer fieldset intercepted `Run Backtest` | Confirmed responsive overlay/hit-test defect; normal-flow layout and hit-test regression added. Trusted rerun required. |
| 7 | mobile Chrome | `multi-chart-studio.spec.ts` | timeout | `Drawings (1)` did not become visible before timeout | Diagnostic evidence insufficient; no root cause claimed. |
| 8 | mobile Safari | `multi-chart-studio.spec.ts` | assertion-element-hidden | Inactive chart-1 `2 indicators` was hidden | Test expectation conflicted with intentional narrow-layout inactive-panel hiding; test now asserts the rule and verifies after switching back. |
| 9 | mobile Safari | `multi-chart-studio.spec.ts` | assertion-element-not-found | `Drawings (1)` not found | Touch/canvas coordinate path corrected locally; trusted rerun required. |
| 10 | mobile Safari | `multi-chart-studio.spec.ts` | page-error-resizeobserver | `ResizeObserver loop completed with undelivered notifications.` | Resize idempotence guard added; WebKit warning remains unverified until managed rerun. |
| 11 | mobile Safari | `multi-chart-studio.spec.ts` | page-error-resizeobserver | `ResizeObserver loop completed with undelivered notifications.` | Resize idempotence guard added; WebKit warning remains unverified until managed rerun. |
| 12 | mobile Chrome | `optimization-studio.spec.ts` | timeout | 30s test timeout | Diagnostic evidence insufficient; no root cause claimed. |
| 13 | mobile Chrome | `optimization-studio.spec.ts` | timeout | 30s test timeout | Diagnostic evidence insufficient; no root cause claimed. |
| 14 | mobile Safari | `optimization-studio.spec.ts` | page-error-resizeobserver | `ResizeObserver loop completed with undelivered notifications.` | Resize idempotence guard added; mobile WebKit warning remains unverified. |
| 15 | WebKit | `paper-trading-studio.spec.ts` | assertion-element-not-found | `pending` not found | Async state failure has no sufficient causal trace in the published ledger; no speculative fix. |
| 16 | mobile Chrome | `paper-trading-studio.spec.ts` | timeout | 30s test timeout | Diagnostic evidence insufficient; no root cause claimed. |
| 17 | mobile Safari | `paper-trading-studio.spec.ts` | assertion-element-not-found | `pending` not found | Async state failure has no sufficient causal trace in the published ledger; no speculative fix. |
| 18 | mobile Chrome | `screener.spec.ts` | timeout | 30s test timeout | Diagnostic evidence insufficient; no root cause claimed. |
| 19 | mobile Safari | `screener.spec.ts` | assertion-element-not-found | `completed` not found | Async completion failure has no sufficient causal trace in the published ledger; no speculative fix. |
| 20 | WebKit | `studio.spec.ts` | page-error-resizeobserver | `ResizeObserver loop completed with undelivered notifications.` | Resize idempotence guard added; WebKit warning remains unverified. |
| 21 | WebKit | `studio.spec.ts` | assertion-element-not-found | `Studio close alert` not found | Async alert failure has no sufficient causal trace in the published ledger; no speculative fix. |
| 22 | mobile Chrome | `studio.spec.ts` | timeout | 30s test timeout | Diagnostic evidence insufficient; no root cause claimed. |
| 23 | mobile Chrome | `studio.spec.ts` | timeout | 30s test timeout | Diagnostic evidence insufficient; no root cause claimed. |
| 24 | mobile Chrome | `studio.spec.ts` | timeout | 30s test timeout | Diagnostic evidence insufficient; no root cause claimed. |
| 25 | mobile Chrome | `studio.spec.ts` | timeout | 30s test timeout | Diagnostic evidence insufficient; no root cause claimed. |
| 26 | mobile Chrome | `studio.spec.ts` | timeout | 30s test timeout | Diagnostic evidence insufficient; no root cause claimed. |
| 27 | mobile Safari | `studio.spec.ts` | assertion-element-not-found | `Drawings (1)` not found | Touch/canvas coordinate path corrected locally; trusted rerun required. |
| 28 | mobile Safari | `studio.spec.ts` | assertion-element-not-found | `Drawings (1)` not found | Touch/canvas coordinate path corrected locally; trusted rerun required. |
| 29 | mobile Safari | `studio.spec.ts` | assertion-element-not-found | `Studio close alert` not found | Async alert failure has no sufficient causal trace in the published ledger; no speculative fix. |
| 30 | mobile Safari | `studio.spec.ts` | page-error-resizeobserver | `ResizeObserver loop completed with undelivered notifications.` | Resize idempotence guard added; mobile WebKit warning remains unverified. |

The ledger classification totals remain: 13 timeouts, 2 timeout/pointer
interceptions, 9 element-not-found assertions, 1 element-hidden assertion, and
5 ResizeObserver page errors.

## Local verification

The following checks passed on the current source before this report:

| Check | Result |
|---|---|
| TypeScript typecheck | PASS |
| Node suite | 160/160 PASS |
| Standalone system-Chromium browser suite | 14/14 PASS |
| React/Studio system-Chromium browser suite | 24/24 PASS |
| Evidence validator unit tests | 4/4 PASS |
| Versioned evidence validation | PASS for Phase 8.6.1, 8.8.1, and 8.8.3 packs |
| Local system-Chromium diagnostic | 28/28 PASS; provenance explicitly system-installed |
| Next.js production build | PASS; Next.js 16.4.3 webpack build |
| Release readiness | NOT READY; managed browser and manual/owner gates remain open |

The 24-case Studio Chromium result includes the new responsive control and
hit-test regression. The cloud system browser's mobile emulation reports a
non-device layout viewport and is not evidence for the managed mobile
projects. No current-revision Firefox, WebKit, Mobile Chrome, or Mobile Safari
execution is claimed here.

Additional local package gates passed during this verification: API
compatibility, package portability, package smoke, distribution contents,
Studio separation, root and Next dependency audits, consumer smoke, and the
Canvas2D benchmark. The distribution audit was refreshed with the current
package artifact hash and contains no package problems.

## Managed-browser attempts in the cloud environment

The project workflows were executed as configured and did not substitute a
system browser:

- `npm run browser:verify`: **BLOCKED**. All five Playwright-managed executable
  paths were absent from `/home/agent/.cache/ms-playwright` (Chromium,
  Firefox, WebKit, and the two emulated projects). The workflow selected 70
  cases but recorded `expected: 0`, `unexpected: 70` because browser launch
  was unavailable; this is not a 70-test product result.
- `npm run studio:browser:verify`: **BLOCKED** before test discovery. All five
  Studio Playwright-managed executable paths were absent, and no Studio test
  records were produced.

The local system-Chromium diagnostic separately passed 28/28 on source
`658d65d5`, but its report explicitly identifies `/usr/bin/chromium` and is
not portable managed-browser evidence.

`npm run release:readiness` produced the final clean-tree result at
`artifacts/release-readiness/2026-10-26T18-56-33-923Z/summary.json` with
status `NOT READY`. Repository, API, typecheck, unit/integration, diagnostic,
package, audit, consumer, evidence, and Next production gates passed. The
managed-browser gate is BLOCKED by missing official binaries; manual and owner
approval gates remain intentionally open.

## Evidence validation and provenance

The evidence validator now independently validates the Phase 8.8.3 pack:
source SHA, seven required files, official-container provenance, trusted-host
boundary, standalone 70 records, Studio 105 records, 75/30 reconciliation,
unique test IDs, failure classifications, required failure fields, and
sanitization. Evidence validation is **PASS** even though the Studio behavior
matrix is **FAIL/open**; these are intentionally separate statuses.

Relevant pushed commits:

| Commit | Purpose |
|---|---|
| `7e05382082af655af6ccfe83751e4d01184c4208` | Integrate trusted Phase 8.8.3 evidence pack |
| `be524386b51ca71de46e89997065375d5e4b0d36` | Validate Phase 8.8.3 evidence and failure ledger |
| `658d65d5ce020a3fbf75ae18767c47b4d1513462` | Remediate responsive layout, pointer/touch, and resize behavior |

All three commits use `Akira Yuzai <yuzai.akira@gmail.com>` as author and
committer and were pushed to `origin/work` without rewriting history.

## Acceptance matrix

| Criterion | Status | Evidence or remaining action |
|---|---|---|
| Preserve standalone 70/70 evidence | VERIFIED, historical source | Phase 8.8.3 records target `8a62e324`; they do not certify current source. |
| Validate Phase 8.8.3 evidence integrity | VERIFIED | `npm run evidence:browser:check` passes; Studio FAIL is preserved as data. |
| Reproduce and remediate mobile pointer interception | IMPLEMENTED / LOCALLY VERIFIED | Source fix and 24/24 system-Chromium Studio suite; managed mobile rerun open. |
| Preserve intentional inactive-panel responsive behavior | IMPLEMENTED / LOCALLY VERIFIED | Test expectation updated; trusted WebKit/mobile rerun open. |
| Normalize touch/pointer Canvas coordinates | IMPLEMENTED / LOCALLY VERIFIED | Drawing helper and core coordinate path covered locally; managed rerun open. |
| Guard redundant resize feedback | IMPLEMENTED / LOCALLY VERIFIED | Existing resize/lifecycle coverage passes; WebKit warning elimination not certified. |
| Current-revision Chromium Studio behavior | VERIFIED locally | 24/24 system Chromium; not Playwright-managed cross-browser evidence. |
| Current-revision Firefox and WebKit behavior | OPEN | Trusted official-container rerun required. |
| Current-revision mobile Chrome and Mobile Safari behavior | OPEN | Trusted official-container emulation rerun required; physical devices separate. |
| Async paper/screener/alert state failures | OPEN | Re-run with diagnostic traces and isolate before changing runtime behavior. |
| Accessibility conformance and physical touch review | OPEN | Manual owner-approved gates remain separate. |
| Release readiness | NOT READY | Current managed Studio matrix, manual gates, and release authorization remain open. |

## Trusted-machine handoff

Run the final source revision in the already-approved official container on the
trusted machine, including both standalone and Studio workflows. Preserve the
complete report, traces, screenshots, and test-results directory; sanitize
before any evidence branch update. The rerun must use the exact Playwright
version and image digest above and must not substitute system browsers.

Until that rerun passes or the owner approves a documented exception, the
Phase 8.8.4 Studio cross-browser gate remains open and Phase 3/release work
must not be treated as accepted on this basis.
