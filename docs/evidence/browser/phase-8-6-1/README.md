# Phase 8.6.1 trusted browser QA evidence

Compact, sanitized record of the Phase 8.6.1 five-browser portable verification
executed on a trusted personal Manjaro Linux machine.

This branch is evidence only. It does **not** authorize release, change the
license, publish a package, or claim physical-device compatibility.

## Source

| Field | Value |
| --- | --- |
| Source commit | `19c86987453e2f5ae5572c4028ba9cb2e1f2f4aa` |
| Playwright | `1.64.1` |
| Config | `playwright.portable.config.ts` |
| Container | `mcr.microsoft.com/playwright:v1.64.1-noble` |
| Image digest | `sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea` |
| Evidence status | `verified` (exit `0`) |

## How verification was performed

1. On the trusted Manjaro host (not a restricted cloud `/workspace`), confirm
   Docker and the pinned Playwright image digest.
2. Check out source commit `19c86987453e2f5ae5572c4028ba9cb2e1f2f4aa`.
3. Run inside the official container with the repository bind-mounted at
   `/work`, `HOME=/tmp`, `npm_config_cache=/tmp/npm-cache`, and
   `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`.
4. Inside the container:

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run browser:verify
```

5. Record results under a new local evidence directory. Do not overwrite prior
   Phase 8.5 evidence.

This evidence is **local Manjaro + official Playwright container** verification.
It is **not** cloud-workspace verification and **not** the local diagnostic
system-Chromium lane.

## Matrix

| Project | Result | Browser distribution |
| --- | --- | --- |
| chromium | 14/14 | Playwright-managed |
| firefox | 14/14 | Playwright-managed |
| webkit | 14/14 | Playwright-managed |
| mobile-chrome | 14/14 | Playwright-managed (Pixel 7 emulation) |
| mobile-safari | 14/14 | Playwright-managed (iPhone 13 / WebKit emulation) |
| **Total** | **70 expected, 0 unexpected, 0 skipped, 0 flaky** | |

All 70 test case outcomes are listed in `test-cases.json`, grouped
by browser, and were derived from the original `playwright-results.json`.

## Mobile Safari note

`mobile-safari` is **browser emulation** (Playwright WebKit + iPhone 13 device
profile). Chart zoom in that project uses labeled public API `chart.zoom` (**API
zoom**). That is **not** native pinch-to-zoom testing and **not** physical iOS
Safari verification.

## Archives (Manjaro only — not in GitHub)

Original compressed archives remain on the trusted machine and are **not**
committed to this branch:

| Archive | Role | SHA-256 |
| --- | --- | --- |
| `openkline-post-harness-fix-matrix-20261026T1545Z.tar.gz` | Historical Phase 8.5 (65/65) | `3cec7e41be217ade9aa0c3275daf7d4f2ecacbad332f2b60e7cefa12b2d230ec` |
| `openkline-phase-8-6-1-matrix-20261026T153655Z.tar.gz` | Phase 8.6.1 (70/70) | `73bc6e2b12db91c87a85c1e82bcaf35395ba8291a1d2b39629f7ebf69d77fe3c` |

## Files in this pack

- `README.md` — human-readable summary
- `manifest.json` — provenance, execution method, totals, archive hashes
- `browser-matrix.json` — per-project browser identity and totals
- `test-cases.json` — all 70 case outcomes grouped by browser

## Limitations

- Automated container emulation only
- Not native iOS / physical-device verification
- Not accessibility or visual-regression certification
- Not release authorization
