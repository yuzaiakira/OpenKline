# Phase 8.8.10 Trusted Browser Targeted Handoff

This is an execution handoff, not a browser result. Run it only on a trusted
machine with the official Playwright-managed browsers. Do not replace Firefox
or WebKit with system browsers, and do not claim a pass from a launch that was
blocked.

## Required provenance

- Source revision: `e03d93722d743fda0c00e860ac1b41d07187214e`
- Playwright: `1.64.1`
- Image: `mcr.microsoft.com/playwright:v1.64.1-noble`
- Digest: `sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea`
- Browser path: `/ms-playwright`

The trusted runner must preserve the complete report, including
`environment.json`, `summary.json`, `playwright-results.json`,
`playwright-stderr.log`, and `test-results/`. Generate a new archive and
SHA-256; retain all historical archives unchanged.

## Container setup

Verify the pinned image before execution:

```bash
docker image inspect mcr.microsoft.com/playwright:v1.64.1-noble \
  --format '{{index .RepoDigests 0}}'
```

Run installation and build inside the official container:

```bash
docker run --rm --init --ipc=host \
  -v "$PWD:/work" -w /work \
  -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  -e HOME=/tmp/openkline-home \
  -e npm_config_cache=/tmp/openkline-npm-cache \
  mcr.microsoft.com/playwright:v1.64.1-noble@sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea \
  bash -lc 'npm ci --ignore-scripts --no-audit --no-fund && npm run build'
```

Then run the project's existing full workflows in that same environment:

```bash
npm run browser:verify
npm run studio:browser:verify
```

## Priority targeted cases

Run these exact identities first and preserve their complete diagnostics:

1. `studio-mobile-safari` — `Studio accepts drawing anchors from touch events without pointer compatibility events` (`studio.spec.ts`)
2. `studio-mobile-safari` — `Studio snaps drawing anchors to visible candle timestamps and preserves raw anchors across scale changes` (`multi-chart-studio.spec.ts`)
3. `studio-mobile-safari` — `Studio preserves chart type, price scale, indicator, and drawing state through a workspace reload` (`studio.spec.ts`)
4. `studio-mobile-safari` — `Studio exposes deterministic replay playback controls and restores the workspace` (`studio.spec.ts`)
5. `studio-mobile-safari` — `multi-chart Studio preserves panel identity, isolated state, sync settings, watchlists, and named workspaces` (`multi-chart-studio.spec.ts`)
6. `studio-mobile-chrome` — `mobile Studio keeps critical controls visible and hit-testable after responsive layout changes` (`multi-chart-studio.spec.ts`)
7. `studio-webkit` — `Studio creates, pauses, persists, and removes a local alert` (`studio.spec.ts`)
8. `studio-webkit` — `Studio preserves chart type, price scale, indicator, and drawing state through a workspace reload` (`studio.spec.ts`)

Example focused commands:

```bash
npx playwright test --config playwright.studio.compat.config.ts \
  --project=studio-mobile-safari \
  tests/react-browser/studio.spec.ts tests/react-browser/multi-chart-studio.spec.ts \
  --grep 'Studio accepts drawing anchors|Studio snaps drawing anchors|Studio preserves chart type|Studio exposes deterministic replay|multi-chart Studio preserves panel identity'

npx playwright test --config playwright.studio.compat.config.ts \
  --project=studio-mobile-chrome \
  tests/react-browser/multi-chart-studio.spec.ts \
  --grep 'mobile Studio keeps critical controls visible'

npx playwright test --config playwright.studio.compat.config.ts \
  --project=studio-webkit \
  tests/react-browser/studio.spec.ts \
  --grep 'Studio creates, pauses, persists, and removes a local alert|Studio preserves chart type'
```

## Resolution rules

- Record browser versions, user agents, operating system, source commit, image
  digest, command, counts, and every launch or page error.
- Treat a missing executable as `blocked`, not `passed` or `failed` behavior.
- Treat any unexpected page error as a failure until its application-side cause
  is resolved; do not suppress it globally.
- Do not use forced clicks, test skips, TLS disabling, arbitrary binaries, or
  system-browser substitutions.
- Keep accessibility, physical-device, visual-baseline, legal, and release
  authorization gates separate from this targeted browser evidence.

The handoff is complete only when the resulting archive has a new SHA-256 and
the report is transferable without personal paths, credentials, private
network details, or unapproved destinations.
