# OpenKline Phase 5.1 release-readiness verification

Verification date: 2026-10-25 (UTC)

Status: **Developer-preview preparation is verified locally; stable release is
not approved.** The effective project license is still pending owner/legal
confirmation, and the inherited official Firefox, WebKit, and Mobile Safari
browser gates remain blocked by this environment.

This report records observed results, not promises about untested platforms or
future dependency updates.

## Implemented capabilities

- Added a generated machine-readable dependency/license inventory at
  [`docs/audits/license-inventory.json`](../audits/license-inventory.json), a
  human review at [`docs/audits/license-inventory.md`](../audits/license-inventory.md),
  and a lockfile consistency validator.
- Added the explicitly pending Apache-2.0 proposal in
  [`docs/legal/apache-2.0-proposal.md`](../legal/apache-2.0-proposal.md) and
  `LICENSE-APACHE-2.0.PROPOSED`. Neither is an effective license grant.
- Added a bounded dependency/security audit and reproducible local release
  process.
- Added independent tarball consumption checks for Vanilla ESM and TypeScript
  React consumers, including public KlineScript compilation.
- Updated the private Next.js example from 15.5.28 to 16.4.3 after npm audit
  identified a high and moderate advisory path through PostCSS 8.4.31. The
  example build retains its custom webpack alias with `next build --webpack`.
- Added developer-preview, browser-compatibility, licensing, and supply-chain
  handover documentation. No package was published and no public tag was
  created.

## Explicit acceptance matrix

| Criterion | Status | Evidence / remaining action |
| --- | --- | --- |
| Core build and public root exports | **Verified** | `npm run typecheck`, package check, public import smoke |
| Vanilla package installation | **Verified** | `npm run package:smoke` and independent consumer tarball test |
| TypeScript/React package consumption | **Verified locally** | `node scripts/consumer-preview-smoke.mjs`; React package remains unpublished |
| Next.js production integration | **Verified locally** | Clean install, audit, and Next.js 16.4.3 webpack build |
| Root dependency vulnerability audit | **Verified** | npm audit: 0 info/low/moderate/high/critical; 12 development entries |
| Next.js example vulnerability audit | **Verified** | npm audit: 0 advisories after the Next 16.4.3 update |
| Lockfile integrity/provenance | **Verified** | Both lockfiles validated; external entries have resolved URL and integrity |
| License inventory generation/consistency | **Verified for metadata** | 68 entries; legal text/ownership review remains open |
| Effective project license and package metadata | **Blocked / owner approval** | Only a separately marked proposal exists; no `LICENSE` was invented |
| Third-party license/notice review | **Open** | Review actual texts, attribution, CC-BY, and LGPL obligations before distribution |
| Chromium browser behavior | **Verified** | 3/3 Playwright tests passed |
| Mobile Chrome behavior | **Verified** | 3/3 Playwright tests passed with Pixel 7 emulation |
| Firefox behavior | **Blocked by environment** | Official Playwright executable unavailable; no substitute used |
| WebKit behavior | **Blocked by environment** | Official Playwright executable unavailable; no substitute used |
| Mobile Safari behavior | **Blocked by environment** | Requires the unavailable official WebKit artifact |
| Performance regression check | **Verified as measured** | Canvas2D and KlineScript observations below; no universal FPS claim |
| Documentation and handover process | **Implemented / verified** | Required audit, release, compatibility, API, and roadmap docs updated |
| Public preview publication | **Not performed** | Requires explicit owner authorization and cleared blockers |
| Stable Phase 5 release | **Open** | License, attribution, and browser gates are not all satisfied |

## Test results

The following commands passed in this workspace after the Phase 5.1 changes:

| Command | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm test` | Pass; 48 Node tests |
| `npm run test:browser` | Pass; 3 Chromium tests |
| `npm run benchmark:klinescript` | Pass |
| `npm run benchmark:browser` | Pass; observations below |
| `npm run package:check` | Pass; 142-file root tarball |
| `npm run package:smoke` | Pass; clean local tarball install |
| `node scripts/consumer-preview-smoke.mjs` | Pass; Vanilla ESM and TypeScript React |
| Root `npm audit --json --include=dev` | Pass; zero advisories |
| Example `npm audit --json --include=dev` | Pass; zero advisories |
| `node scripts/validate-license-inventory.mjs` | Pass; 68 entries |
| `cd examples/nextjs-app-router && npm run build` | Pass; Next.js 16.4.3 webpack build |
| `npm run test:browser:compat` | Blocked for Firefox/WebKit/Mobile Safari; Mobile Chrome passed |
| `npm run release:check` | Intentionally blocked at the official compatibility gate after earlier checks pass |

The root package dry-run measured 142 files, 128,884 bytes compressed, and
730,254 bytes unpacked. It contained build output and package documentation,
not dependency tarballs, credentials, or a `NOTICE` file.

## Browser compatibility

The project uses Playwright 1.64.1. Chromium 154 and Pixel 7 Mobile Chrome
passed the current interaction suite. The required Playwright Firefox build
1555 (Firefox 157) and WebKit build 2370 (WebKit 27.2) are not installed in
this environment; official CDN/Docker acquisition was unavailable. Mobile
Safari therefore cannot launch. These are **blocked**, not passed or silently
substituted with system browsers. See the
[browser checklist](../release/browser-compatibility-checklist.md).

The blocked projects cover rendering, indicators, filled bands, pan/zoom,
crosshair, panes, drawings, pointer/touch, resize, and cleanup only when an
official project can actually run. No full cross-browser claim is made.

## Performance and memory observations

The recorded Canvas2D run used Headless Chromium 154 on Linux. Values are
single-run observations in the local environment; a separate run showed
normal frame-time variance, so these are not release budgets.

| Candles | FPS | Frame p50/p95 (ms) | Frame work p50/p95 (ms) | Append/update (ms) | Correction (ms) |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 64.10 | 16.6 / 17.2 | 1.0 / 1.3 | 1.146 | 39.1 |
| 10,000 | 61.68 | 16.7 / 16.8 | 0.8 / 3.1 | 0.590 | 460.2 |
| 100,000 | 62.29 | 16.7 / 16.9 | 0.7 / 1.2 | 0.652 | 6168.3 |

The same run observed 620.65 MB heap before chart destruction, 1.90 MB after
destruction, and zero remaining chart canvases. Heap readings are engine and
fixture dependent. Historical correction remains a full-recalculation path;
the optimized append path is preserved.

The KlineScript benchmark on Node.js v24.19.0/Linux x64 measured compilation
at 3.255 ms; historical p50/p95 at 1.524/1.524 ms for 1k, 4.910/4.910 ms for
10k, and 52.608/52.608 ms for 100k. It measured 8.055 ms for append and
26.077 ms for the concurrent case in that fixture. Operations were
26,794/269,794/2,699,794 respectively. These measurements do not establish a
general performance guarantee.

## Supply-chain and license status

The root package has no runtime dependencies. The private example has a
separate Next.js dependency tree and is not included in the root tarball. The
inventory records metadata, resolved URLs, and integrity hashes, but metadata
does not replace review of license text, notices, copyright ownership, or
assignment history. No effective `LICENSE`, package `license` field, or
unverified `NOTICE` was added.

The proposed preview version `0.1.0-alpha.1` is documentation only. Version
files, tags, registry publication, and release claims remain unchanged.

## Technical debt and remaining blockers

1. Obtain and record owner/legal project-license approval; then add the
   effective license and matching package metadata without silently treating
   the proposal as active.
2. Review dependency license texts and attribution/notice requirements,
   especially the private example's CC-BY-4.0 and LGPL-related packages.
3. Run the exact Playwright Firefox and WebKit artifacts from a supported
   environment and rerun Mobile Safari; record versions and results.
4. Repeat performance measurements on reference hardware before turning
   observations into release budgets.
5. Keep vendor-specific datafeeds, untrusted plugin loading, and general
   KlineScript sandboxing outside the current preview claims.

## Phase 5 readiness assessment

Phase 5.1 is **not closed for stable release**. The repository is prepared for
an owner-reviewed developer preview from local tarballs, but the mandatory
license decision, third-party notice review, and official browser gate remain
open. Phase 3 work or a public preview must not be represented as clearing
these blockers. No Phase 3/other milestone acceptance criteria were changed by
this report.

## Git and publication verification

All commits made for this increment use `Akira Yuzai
<yuzai.akira@gmail.com>` as author and committer, use Conventional Commit
messages, and are pushed without force-push or history rewriting. The final
commit IDs and remote synchronization are recorded in the delivery summary
after the verification commits. No npm publication, public tag, GitHub Action,
or external CI run was performed.
