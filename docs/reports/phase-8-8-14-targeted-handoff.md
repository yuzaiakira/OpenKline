# OpenKline Phase 8.8.14 Trusted Browser Targeted Handoff

This document is an execution handoff, not a browser result. Execute it on the
trusted Manjaro host or another approved environment with the official
Playwright-managed browsers. Do not substitute system Firefox, Safari, or
WebKit binaries.

## Source and environment

- Current implementation source: `8f845f6c0370d43744294f4c22301666d8257766`
- Previous targeted source: `5062735097301ce22dd50f1f78f7f84cf96394e1`
- Playwright: `1.64.1`
- Image: `mcr.microsoft.com/playwright:v1.64.1-noble`
- Required digest: `sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea`
- Managed browser path: `/ms-playwright`

The previous trusted Phase 8.8.13 run produced seven records: one expected
WebKit paper pass and six failures. Its focused archive remains preserved on
the trusted host with SHA-256
`5da3924bf93794cfe641dff4854c32de8b43f6a7240c99e449922f5467c5721c`.

## Required targeted identities

Run these six identities first and preserve complete diagnostics:

| Project | Test title | Root-cause question |
| --- | --- | --- |
| `studio-firefox` | Studio snaps drawing anchors to visible candle timestamps and preserves raw anchors across scale changes | Does the visible, hit-tested point register a drawing anchor? |
| `studio-firefox` | Studio preserves chart type, price scale, indicator, and drawing state through a workspace reload | Does the drawing survive workspace reload? |
| `studio-firefox` | Studio exposes deterministic replay playback controls and restores the workspace | Does replay restore preserve the drawing? |
| `studio-mobile-safari` | Studio paper trading is visibly simulated, fills causally, and stays chart-scoped | Does the current quantity produce the expected pending/fill lifecycle without bypassing risk? |
| `studio-webkit` | Studio creates, pauses, persists, and removes a local alert | Does the filled alert name survive and is the created alert removable? |
| `studio-mobile-safari` | Studio creates, pauses, persists, and removes a local alert | Does the filled alert name survive and is the created alert removable? |

The prior `studio-webkit` paper identity is a positive control and should be
rerun against the current source if the six failures pass. Do not treat the
old pass as current-source acceptance.

## Trusted container commands

Verify the image digest before execution:

```bash
docker image inspect mcr.microsoft.com/playwright:v1.64.1-noble \
  --format '{{index .RepoDigests 0}}'
```

Install and build inside the pinned official image:

```bash
docker run --rm --init --ipc=host -v "$PWD:/work" -w /work \
  -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  -e HOME=/tmp/openkline-home \
  -e npm_config_cache=/tmp/openkline-npm-cache \
  mcr.microsoft.com/playwright:v1.64.1-noble@sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea \
  bash -lc 'npm ci --ignore-scripts --no-audit --no-fund && npm run build'
```

Run the Firefox drawing trio:

```bash
npx playwright test --config playwright.studio.compat.config.ts \
  --project=studio-firefox \
  tests/react-browser/studio.spec.ts tests/react-browser/multi-chart-studio.spec.ts \
  --grep 'Studio snaps drawing anchors|Studio preserves chart type|Studio exposes deterministic replay'
```

Run WebKit and Mobile Safari paper/alert identities separately:

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

Use the project evidence collector where possible. Preserve `environment.json`,
`summary.json`, `playwright-results.json`, `playwright-stderr.log`, and the
complete `test-results/` directory. Create a new archive and SHA-256; do not
overwrite Phase 8.8.13 or earlier archives.

## Decision rules

- An unavailable executable, Docker failure, or blocked network is **blocked**,
  not a behavioral pass or failure.
- Use only the pinned official managed binaries. Do not use system-browser
  substitutions, arbitrary binaries, TLS bypasses, forced clicks, skipped
  tests, or globally suppressed errors.
- Keep native Playwright touch input separate from physical-device claims.
- Do not request the full five-project Studio matrix until all six targeted
  identities pass with meaningful diagnostics and the positive WebKit paper
  control is preserved.
- If all six pass, run the normal standalone and Studio collectors separately;
  report the actual counts and archive hashes.
- Sanitize personal paths, hostnames, credentials, private addresses,
  screenshots, traces, binaries, and archives before any evidence integration.

This handoff does not close physical-device, formal accessibility, visual,
legal, owner-authorization, or release-readiness gates.
