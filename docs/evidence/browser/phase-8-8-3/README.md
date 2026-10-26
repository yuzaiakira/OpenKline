# Phase 8.8.3 trusted Studio cross-browser verification evidence

Compact, sanitized record of Phase 8.8.3 verification executed on a trusted
personal Manjaro Linux machine against source `8a62e324cf0bcb25c79d380d25269ddda33c3deb`.

This branch is evidence only. It does **not** authorize release, change the
license, publish a package, implement product fixes, or claim physical-device
compatibility.

Prior Phase 8.8.1 evidence under `docs/evidence/browser/phase-8-8-1/` is
preserved unchanged.

## Source

| Field | Value |
| --- | --- |
| Source commit | `8a62e324cf0bcb25c79d380d25269ddda33c3deb` |
| Playwright | `1.64.1` |
| Standalone config | `playwright.portable.config.ts` |
| Studio config | `playwright.studio.compat.config.ts` |
| Container | `mcr.microsoft.com/playwright:v1.64.1-noble` |
| Image digest | `sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea` |
| Standalone status | `verified` (exit `0`) |
| Studio status | `FAIL` (exit `1`) |

## How verification was performed

1. On the trusted Manjaro host (not a restricted cloud workspace), confirm Docker
   and the pinned Playwright image digest.
2. Check out source commit `8a62e324cf0bcb25c79d380d25269ddda33c3deb`.
3. Run inside the official container with the repository bind-mounted at `/work`,
   `HOME=/tmp`, `npm_config_cache=/tmp/npm-cache`, and
   `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`.
4. Inside the container:

```bash
npm ci --ignore-scripts --no-audit --no-fund
(cd examples/nextjs-app-router && npm ci --ignore-scripts --no-audit --no-fund)
npm run build
npm run browser:verify
npm run studio:browser:verify
```

5. Record results under new local evidence directories. Do not overwrite prior
   Phase 8.5 / 8.6.1 / 8.8.1 evidence.

`environment.json` recorded `gitCommit` as `8a62e324cf0bcb25c79d380d25269ddda33c3deb` for both workflows.

## Standalone five-browser matrix (portable library)

| Project | Passed | Failed | Total |
| --- | ---: | ---: | ---: |
| chromium | 14 | 0 | 14 |
| firefox | 14 | 0 | 14 |
| webkit | 14 | 0 | 14 |
| mobile-chrome | 14 | 0 | 14 |
| mobile-safari | 14 | 0 | 14 |
| **Total** | **70 expected, 0 unexpected** | | **70** |

## Studio five-browser matrix (official workflow)

Discovery: **105 tests** (21 functional × 5 projects). Visual-review capture
tests are excluded by `playwright.studio.compat.config.ts`.

| Project | Passed | Failed | Total |
| --- | ---: | ---: | ---: |
| studio-chromium | 21 | 0 | 21 |
| studio-firefox | 21 | 0 | 21 |
| studio-webkit | 18 | 3 | 21 |
| studio-mobile-chrome | 5 | 16 | 21 |
| studio-mobile-safari | 10 | 11 | 21 |
| **Total** | **75 expected, 30 unexpected** | | **105** |

### Comparison with Phase 8.8.1 supplemental Studio probe

| Browser | 8.8.1 probe P/F | 8.8.3 official P/F |
| --- | --- | --- |
| Chromium | 21/0 | 21/0 |
| Firefox | 21/0 | 21/0 |
| WebKit | 18/3 | 18/3 |
| Mobile Chrome | 5/16 | 5/16 |
| Mobile Safari | 10/11 | 10/11 |

**No improvement** versus the prior 75-pass / 30-fail Studio probe. The Phase
8.8.2 responsive viewport metadata correction (`export const viewport` in the
Next.js example layout) is present in the tested source but did **not** clear
WebKit/mobile Studio failures under this matrix.

Failure classifications (see `studio-failures.json`):
`{"timeout": 13, "timeout-pointer-interception": 2, "assertion-element-not-found": 9, "assertion-element-hidden": 1, "page-error-resizeobserver": 5}`.

## Archives (Manjaro only — not in GitHub)

| Archive | Role | SHA-256 |
| --- | --- | --- |
| `openkline-phase-8-8-3-standalone-20261026T181441Z.tar.gz` | Standalone portable matrix (70/70) | `05061c332e2f5e89f2330c494a9e4611924d1cf7a1ad93a6913b8b1811930643` |
| `openkline-phase-8-8-3-studio-20261026T181441Z.tar.gz` | Studio full matrix (75/30) | `07e3f123cf23bcea5a9e09954d7c3b8f592c075e2ba5d4373855c36d814e7ac8` |
| `openkline-phase-8-8-3-studio-focused-diag-20261026T181441Z.tar.gz` | Focused Studio diagnostic retries | `e48caf64c616825312e024cd5212e77f3356df75e98b492dd6d292065ee84ac5` |

## Files in this pack

- `README.md` — human-readable summary
- `manifest.json` — provenance, execution method, totals, archive hashes
- `standalone-matrix.json` — standalone per-project browser identity and totals
- `standalone-test-cases.json` — all standalone case outcomes
- `studio-matrix.json` — Studio per-project browser identity and totals
- `studio-test-cases.json` — all Studio PASS and FAIL outcomes
- `studio-failures.json` — detailed failure records for cloud-agent analysis

## Limitations

- Automated container emulation only
- Not native iOS / physical-device verification
- Not accessibility or visual-regression certification
- Not release authorization
- Studio WebKit and mobile managed-browser projects still fail
- Chromium/Firefox Studio passes do not imply physical-device compatibility
