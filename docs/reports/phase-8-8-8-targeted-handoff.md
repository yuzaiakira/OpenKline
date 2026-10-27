# Phase 8.8.8 — Trusted Browser Verification Handoff

This document is an execution handoff, not a test result. It contains no
managed-browser pass claim. Run it on the trusted Manjaro host with the
official Playwright container; do not replace Playwright-managed browsers with
system Chromium, system Firefox, or native Safari.

## Source and environment

- Branch: `work`
- Behavioral/test source: `95cbf47aede8046b03fba9ce476ab5e211359989`
- Repair source boundary: `b631b92c769d8e1e9892545c896381299c6f8bcd`
- Required Playwright: `1.64.1`
- Image: `mcr.microsoft.com/playwright:v1.64.1-noble`
- Expected digest: `sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea`
- Managed browser policy: `/ms-playwright` binaries only
- Physical devices: out of scope

The trusted operator must fetch `origin/work`, check out the final source SHA
recorded immediately before execution, and preserve any existing uncommitted
files and historical archives. Do not force-push, overwrite old evidence, or
publish raw archives.

## Recommended isolated execution

From the repository root, verify the image digest, then run the project setup
and build in the pinned image:

```bash
docker image inspect \
  mcr.microsoft.com/playwright:v1.64.1-noble \
  --format '{{index .RepoDigests 0}}'

docker run --rm --init --ipc=host \
  -v "$PWD:/work" -w /work \
  -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  -e HOME=/tmp/openkline-home \
  -e npm_config_cache=/tmp/openkline-npm-cache \
  mcr.microsoft.com/playwright:v1.64.1-noble@sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea \
  bash -lc 'npm ci --ignore-scripts --no-audit --no-fund && npm run build'
```

Run the focused F1–F6 cases first, using the existing compatibility config and
keeping project identities in the output:

```bash
docker run --rm --init --ipc=host \
  -v "$PWD:/work" -w /work \
  -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  -e HOME=/tmp/openkline-home \
  -e npm_config_cache=/tmp/openkline-npm-cache \
  mcr.microsoft.com/playwright:v1.64.1-noble@sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea \
  bash -lc 'npx playwright test --config playwright.studio.compat.config.ts \
    --project=studio-mobile-chrome --project=studio-mobile-safari \
    --project=studio-webkit'
```

Then execute the existing collectors, without skipping failed tests:

```bash
docker run --rm --init --ipc=host \
  -v "$PWD:/work" -w /work \
  -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  -e HOME=/tmp/openkline-home \
  -e npm_config_cache=/tmp/openkline-npm-cache \
  mcr.microsoft.com/playwright:v1.64.1-noble@sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea \
  bash -lc 'npm run browser:verify && npm run studio:browser:verify'
```

The project workflow is authoritative for test discovery and result counts.
Do not replace its result with an expected count. Preserve the complete
`environment.json`, `summary.json`, `playwright-results.json`,
`playwright-stderr.log`, and `test-results/` output. Create a new sanitized
archive and SHA-256; retain all historical archives unchanged.

## Focus areas and acceptance rule

1. Mobile Chrome: critical controls after responsive layout changes, real
   chart-scoped backtest, optimizer cancellation, and drawing coordinates in
   the visible primary pane.
2. Mobile Safari/WebKit: touch drawing and replay, panel identity after
   workspace restore, ResizeObserver behavior, and asynchronous paper/alert/
   screener completion.
3. Full Studio matrix: no regression outside the focused cases and exact
   project/title identity reconciliation against the Phase 8.8.5 failure
   ledger.

A focused pass alone is insufficient. A prior failure may be marked resolved
only when the same project and test identity passes in the trusted rerun, the
old failure record is reconciled, and the complete current Studio matrix has
no regression. If the rerun remains blocked or any failures remain, update the
Phase 8.8.8 report with the actual records and keep the gate open.

## Current interpretation

The local system-Chromium run passes 13/13 targeted React Studio tests after
the touch fallback and primary-pane coordinate correction. That result is
useful for a local regression check only. It does not certify Playwright
Mobile Safari, WebKit, mobile emulation, native browsers, or physical devices.
The previous 8.8.7 trusted evidence remains 34 focused records (9 pass, 25
fail), with no old failure certified resolved.

Do not publish evidence to an unapproved destination. Do not change licensing,
publish npm, create release tags, use GitHub Actions, or claim final release
readiness from this handoff.
