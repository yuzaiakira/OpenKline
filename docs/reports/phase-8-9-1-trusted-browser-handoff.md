# OpenKline Phase 8.9.1 Trusted Browser Handoff

This is an execution handoff, not a browser result. Execute on a trusted host
with the official Playwright-managed browsers. Do not substitute system
Firefox/Safari/WebKit for official acceptance.

## Source and environment

- Product fix under test: `02e92874fa60e176099acb3eb96953858e31e87e`
- Checkout the tip of `qa/phase-8-9-1-cross-browser-regression` that contains
  the expanded `tests/browser/datafeed-lifecycle.spec.ts` harness (docs/test
  commits after the product fix are allowed; product code must remain the fix
  or a verified successor).
- Historical baseline (do not reassign its matrices): `bb3f1cad028b126920fa26a75f7ec158ebc56e3c`
- Playwright: `1.64.1`
- Image: `mcr.microsoft.com/playwright:v1.64.1-noble`
- Required digest: `sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea`
- Managed browser path: `/ms-playwright`

## Why this handoff exists

Phase 8.9.1 on the current Manjaro agent host could not:

1. Reach `/var/run/docker.sock` / start Docker.
2. Launch Playwright WebKit/Mobile Safari (`libicu74` / `libflite1` missing).

Provisional Chromium/Firefox/Mobile Chrome lifecycle results passed but are
not official five-browser acceptance.

## Verify image digest

```bash
docker image inspect mcr.microsoft.com/playwright:v1.64.1-noble \
  --format '{{index .RepoDigests 0}}'
```

Required: `…@sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea`

## Build inside the official image

```bash
docker run --rm --init --ipc=host -v "$PWD:/work" -w /work \
  -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  -e HOME=/tmp/openkline-home \
  -e npm_config_cache=/tmp/openkline-npm-cache \
  mcr.microsoft.com/playwright:v1.64.1-noble@sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea \
  bash -lc 'npm ci --ignore-scripts --no-audit --no-fund && npm run build'
```

## Phase A — Targeted lifecycle (all five portable projects)

```bash
npx playwright test --config playwright.portable.config.ts \
  tests/browser/datafeed-lifecycle.spec.ts
```

Required: all projects PASS (chromium, firefox, webkit, mobile-chrome,
mobile-safari). Preserve JSON/list reporters and failure attachments.

Confirm:

- Indicator output series removed on `setDatafeed`
- Worker-backed script indicator cleaned
- Drawing preserved
- Prior indicator ids re-addable
- In-flight stale responses discarded
- Destroy leaves 0 canvases / 0 subscriptions

## Phase B — Positive controls

Standalone portable projects (at least chromium + webkit + firefox):

```bash
npx playwright test --config playwright.portable.config.ts \
  tests/browser/chart.spec.ts \
  tests/browser/custom-datafeed.spec.ts \
  tests/browser/replay.spec.ts \
  tests/browser/klinescript.spec.ts
```

Studio (via studio compat config / verification script as appropriate):

- StrictMode / remount / workspace paths
- Replay transitions
- Drawing persistence identities previously trusted in Phase 8.8.x

## Phase C — Full matrices (only if A+B pass)

Run independently and record exit codes + discovered counts:

```bash
npm run browser:verify
npm run studio:browser:verify
```

Do not hardcode 75/125. Report expected / unexpected / flaky / skipped /
per-project results against the exact product SHA.

## Artifact rules

- Keep raw Playwright archives local.
- Publish only sanitized text under a dedicated evidence branch if remote QA
  publication is authorized.
- Do not modify `origin/work` without authorization.
- No force-push / history rewrite.
- Git identity: `Akira Yuzai <yuzai.akira@gmail.com>`

## Acceptance upgrade

Only after digest-locked full matrices pass may the verdict become:

`FUNCTIONALLY VERIFIED — FULL FIVE-BROWSER PASS`
