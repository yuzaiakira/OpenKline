# OpenKline Phase 8.8.12 Trusted Browser Targeted Handoff

This document is an execution handoff, not a browser result. Run it on the
trusted Manjaro machine or another approved environment with the official
Playwright-managed browsers. Do not substitute system Firefox, Safari, or
WebKit binaries.

## Provenance

- Previous trusted result source: `0e84d13ca83b81866900571ad798ca69de90911f`
- Current implementation source: `6e4dd92fd08dc50c23fead4f9c3c69b311aeddf5`
- Playwright: `1.64.1`
- Official image: `mcr.microsoft.com/playwright:v1.64.1-noble`
- Image digest: `sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea`
- Managed browser path: `/ms-playwright`

The previous trusted result is 113/120 Studio passes with seven remaining
failures. The current source has not yet received a trusted targeted rerun.

## Targeted identities

Run these seven identities first and preserve their complete diagnostics:

| Project | Test title | Expected question |
| --- | --- | --- |
| `studio-firefox` | `Studio snaps drawing anchors to visible candle timestamps and preserves raw anchors across scale changes` | Does the visible drawing anchor register after interaction-dimension synchronization? |
| `studio-firefox` | `Studio preserves chart type, price scale, indicator, and drawing state through a workspace reload` | Does the drawing survive the Firefox workspace reload path? |
| `studio-firefox` | `Studio exposes deterministic replay playback controls and restores the workspace` | Does replay restore preserve the drawing in Firefox? |
| `studio-webkit` | `Studio paper trading is visibly simulated, fills causally, and stays chart-scoped` | Does the order expose the expected pending/fill lifecycle? |
| `studio-mobile-safari` | `Studio paper trading is visibly simulated, fills causally, and stays chart-scoped` | Does the order expose the expected pending/fill lifecycle on the emulated Safari viewport? |
| `studio-webkit` | `Studio creates, pauses, persists, and removes a local alert` | Is the created alert name and close control visible and actionable? |
| `studio-mobile-safari` | `Studio creates, pauses, persists, and removes a local alert` | Is the created alert name and close control visible and actionable? |

## Trusted container setup

Verify the pinned digest before execution:

```bash
docker image inspect mcr.microsoft.com/playwright:v1.64.1-noble \
  --format '{{index .RepoDigests 0}}'
```

Install and build inside the official image, with the repository mounted at
`/work`:

```bash
docker run --rm --init --ipc=host -v "$PWD:/work" -w /work \
  -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  -e HOME=/tmp/openkline-home \
  -e npm_config_cache=/tmp/openkline-npm-cache \
  mcr.microsoft.com/playwright:v1.64.1-noble@sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea \
  bash -lc 'npm ci --ignore-scripts --no-audit --no-fund && npm run build'
```

Run the Firefox targets:

```bash
npx playwright test --config playwright.studio.compat.config.ts \
  --project=studio-firefox \
  tests/react-browser/studio.spec.ts tests/react-browser/multi-chart-studio.spec.ts \
  --grep 'Studio snaps drawing anchors|Studio preserves chart type|Studio exposes deterministic replay'
```

Run the WebKit and Mobile Safari targets separately:

```bash
npx playwright test --config playwright.studio.compat.config.ts \
  --project=studio-webkit \
  tests/react-browser/paper-trading-studio.spec.ts tests/react-browser/studio.spec.ts \
  --grep 'paper trading|creates, pauses, persists, and removes a local alert'

npx playwright test --config playwright.studio.compat.config.ts \
  --project=studio-mobile-safari \
  tests/react-browser/paper-trading-studio.spec.ts tests/react-browser/studio.spec.ts \
  --grep 'paper trading|creates, pauses, persists, and removes a local alert'
```

Use the project’s normal evidence collector when preserving results. Keep
`environment.json`, `summary.json`, `playwright-results.json`,
`playwright-stderr.log`, and `test-results/`, then create a new archive and
SHA-256. Do not overwrite prior Phase 8.8.11 archives.

## Resolution rules

- Record source SHA, Playwright version, browser versions, user agents, image
  digest, OS, command, counts, and every launch/page/console error.
- Treat an unavailable executable or blocked container as **blocked**, not
  passed or failed behavior.
- Do not use system-browser substitutions, arbitrary binaries, TLS bypasses,
  forced clicks, skipped tests, or globally suppressed errors.
- Keep synthetic touch-harness coverage separate from native physical-device
  compatibility.
- Do not request the full 120-record Studio matrix until the targeted run shows
  meaningful improvement. If it does, run the standalone and Studio collectors
  independently and preserve both reports.
- Sanitize personal paths, hostnames, credentials, private network addresses,
  and archives before any approved evidence integration.

The targeted handoff does not close accessibility, visual-baseline,
physical-device, legal, owner-authorization, or release-readiness gates.
