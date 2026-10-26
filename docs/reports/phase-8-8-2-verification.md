# OpenKline Phase 8.8.2 Verification

Date: 2026-10-26
Branch: work
Status: NOT RELEASE READY

Phase 8.8.2 integrates the trusted Phase 8.8.1 standalone browser evidence,
upgrades evidence validation for versioned packs, investigates the separate
Studio supplemental failures, and adds a portable Studio-only verification
workflow. It does not change the standalone chart API or promote Studio
aggregate failures to compatibility claims.

## Evidence integration

The source checkout began at 2aabccf184e3c791c18ac3daa4bbeef89d89ed63.
GitHub branch qa/phase-8-8-1-browser-evidence was reviewed at commit
d61a4f98ef826d4fee70940daaec056c1ab4368f; its parent was the expected
source commit and its diff contained only four compact evidence files. It was
integrated at:

f77e124f8277022e36247fd5ab2326fdf192c5ea

No archives, binaries, screenshots, credentials, or unrelated source changes
were integrated.

## Standalone library compatibility matrix

This matrix is trusted-host evidence from the official Playwright container,
not a cloud execution of the current source revision.

| Project | Result | Browser | Source tested | Status |
| --- | ---: | --- | --- | --- |
| Chromium | 14/14 | Playwright-managed | 2aabccf | PASS — trusted evidence |
| Firefox | 14/14 | Playwright-managed | 2aabccf | PASS — trusted evidence |
| WebKit | 14/14 | Playwright-managed | 2aabccf | PASS — trusted evidence |
| Mobile Chrome | 14/14 | Pixel 7 emulation | 2aabccf | PASS — trusted evidence |
| Mobile Safari | 14/14 | iPhone 13 / WebKit emulation | 2aabccf | PASS — trusted evidence |
| **Total** | **70/70** | 5 projects | 2aabccf | **PASS — evidence validated** |

Provenance:

- Playwright 1.64.1
- Image mcr.microsoft.com/playwright:v1.64.1-noble
- Digest sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea
- Trusted archive SHA-256 stated by Manjaro:
  ade5be7fb4fb598d2db79b59c489673244c73315f6e060f059f2880687634bbe
- The archive remains on the trusted host; cloud did not recompute its hash.

npm run evidence:browser:check validates both Phase 8.6.1 and Phase 8.8.1
packs independently. Both contain 70 individual records, 14 per project,
with zero unexpected, skipped, or flaky results. The validator preserves the
historical Phase 8.6.1 source SHA 19c8698… and uses the Phase 8.8.1 source
SHA 2aabccf… for the newer pack.

## Studio compatibility matrix

Studio is a private Next.js reference consumer and has a separate acceptance
matrix. The trusted supplemental probe excluded the two visual-review tests
and reported 21 functional tests per project:

| Project | Passed | Failed | Classification |
| --- | ---: | ---: | --- |
| Chromium | 21 | 0 | Trusted supplemental PASS; not a standalone result |
| Firefox | 21 | 0 | Trusted supplemental PASS; not a standalone result |
| WebKit | 18 | 3 | OPEN — insufficient failure detail |
| Mobile Chrome | 5 | 16 | OPEN — insufficient failure detail |
| Mobile Safari | 10 | 11 | OPEN — insufficient failure detail |
| **Total** | **75** | **30** | **Not accepted as Studio compatibility** |

The compact GitHub evidence contains aggregate totals only. It does not name
the 30 failed tests or provide errors, traces, browser versions for each
failure, or screenshots. Therefore no cause is guessed for those failures.

### Cloud reproduction and classification

The temporary cloud diagnostic ran the same 21 functional tests with system
Chromium and Pixel 7-style emulation, explicitly separate from the official
configs. Before the viewport fix it produced 21/21 desktop and 5/21 mobile
passes. The mobile failures included exact Playwright pointer interception
errors from Studio sidebars/status elements and one drawing assertion that
never observed Drawings (1).

The diagnostic also measured page.viewportSize() as 390/412px but
window.innerWidth as 870px in this system Chromium lane. The missing Next.js
Studio viewport contract was a reproducible PRODUCT DEFECT: responsive CSS
breakpoints were not receiving the device layout width. The fix adds
width=device-width and initial-scale=1 through the App Router Viewport
export, and the touch-sized test now asserts that metadata.

After the fix, a focused diagnostic confirmed the viewport metadata is
rendered, but this system Chromium still reports the 870px layout viewport.
That is an ENVIRONMENT LIMITATION for cloud mobile emulation. A full
post-fix mobile compatibility result is intentionally not claimed.

The trusted WebKit and mobile aggregate failures remain INSUFFICIENT
EVIDENCE, not confirmed product defects or test-harness defects. The owner
must provide sanitized individual failure records/traces or authorize a
trusted rerun.

## Implementation and regression coverage

- scripts/browser-evidence-validator.mjs validates multiple versioned packs,
  source SHA per pack, exact required projects, browser/container provenance,
  every test record, duration fields, duplicate/missing records, matrix
  reconciliation, checksum formats, host boundary, and sanitization.
- scripts/browser-evidence-validation.test.mjs covers valid packs, duplicate
  records, negative duration, and missing files. These tests are part of
  npm test.
- playwright.studio.compat.config.ts is independent of
  playwright.portable.config.ts, uses only Playwright-managed browsers, and
  excludes only the two visual-review capture tests.
- scripts/studio-browser-verification.mjs writes timestamped environment,
  results, hashes, and summary artifacts and reports explicit PASS,
  BLOCKED, or FAIL.
- Studio now declares the device viewport contract; no standalone chart
  rendering, financial color contract, or public API was changed.

## Cloud verification

| Check | Result |
| --- | --- |
| npm run typecheck | PASS |
| npm test | PASS — 159/159 |
| npm run evidence:browser:check | PASS — both versioned packs |
| npm run studio:check | PASS — Studio private and separated |
| npm run test:react:browser | PASS — 23/23 system Chromium |
| Next.js production build | PASS |
| npm run benchmark:browser | PASS — 1k 64.06 FPS, 10k 62.28 FPS, 100k 50.14 FPS; 0 canvases after destroy |
| npm run studio:browser:verify | BLOCKED — all five managed executables absent in cloud |
| npm run release:readiness | NOT READY — managed-browser gate blocked; owner/legal/manual gates remain open |
| System Chromium mobile diagnostic | LIMITED — environment layout viewport; not accepted as mobile compatibility |

The Studio workflow did not download browsers or substitute system binaries.
Its cloud artifact classified the gate BLOCKED with the exact missing
Playwright-managed executable paths. No GitHub Actions, external APIs,
credentials, or public publication were used.
The artifact summary is at
artifacts/studio-browser-verification/2026-10-26T18-01-53-322Z/summary.json;
it records the cloud checkout before the final documentation commit and is
not a trusted-browser result.
The complete release-readiness summary is at
artifacts/release-readiness/2026-10-26T18-05-41-263Z/summary.json; it records
the documentation commit `2ea15d7` and reports `NOT READY`.

## Required trusted-machine follow-up

Run on the approved trusted host using the official Playwright image and the
final origin/work revision:

1. npm run browser:verify for the standalone five-project matrix.
2. npm run studio:browser:verify for the separate 21-test-per-project
   Studio matrix.
3. Preserve raw results and sanitized individual failure records if any Studio
   project fails.
4. Do not use system Firefox, system WebKit, or native-device claims as a
   substitute for the managed projects.

## Owner decisions and remaining gates

- Decide whether Studio WebKit/mobile failures must be resolved before support
  claims or can remain an explicitly unsupported boundary.
- Provide or authorize sanitized individual failure evidence and traces.
- Authorize current-revision trusted-machine reruns.
- Complete manual keyboard, screen-reader, WCAG, visual-baseline, and physical
  device review.
- Complete legal/third-party notice review and publication authorization.

## Git verification

Verified implementation commit:
81ce4c351ab13419ed21852f549063ea9cdb6bdc

Author and committer: Akira Yuzai <yuzai.akira@gmail.com>
Remote origin/work was pushed and matched this commit after the milestone.

The evidence/validator, Studio implementation, and documentation commits are
all pushed to `origin/work`; the final report correction follows the recorded
release-readiness run. No force-push, GitHub Actions, tag, release,
npm publication, license activation, or external evidence transfer was
performed.

**Phase 8.8.2 remains NOT RELEASE READY.** Standalone evidence integration and
cloud-verifiable engineering are complete; current-revision trusted Studio
and standalone reruns, unresolved supplemental failures, accessibility,
physical-device, legal, visual, and owner gates remain open.
