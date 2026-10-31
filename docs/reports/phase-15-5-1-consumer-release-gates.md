# OpenKline Phase 15.5.1 — Consumer Preview and Release-Gate Diagnostics

Date: 2026-10-31  
Repository: `yuzaiakira/OpenKline`  
Branch: `main`  
Starting SHA: `239dff80d9d0a62c716d2f336c59c214425bc7a8`  
Implementation SHA: `861c41983d4222cf555ce215165f8d3c7f9ff36f`  

This increment diagnoses the developer-preview consumer failure, makes local
tarball selection deterministic, verifies normal npm peer resolution across
independent consumers, and corrects the repository readiness policy after the
repository consolidation. It does not authorize publication or change the
effective license, protected API baseline, package versions, or release
channel.

## Executive result

The reported npm `ERESOLVE` was an environment/cache diagnostic, not a
resolved peer incompatibility in OpenKline. In the original isolated offline
run, npm had local tarball entries but lacked sufficient registry artifacts and
metadata for the locked React dependency tree. npm consequently reported
`Found: react@undefined` while checking the valid peer range
`react@">=18"` from `@openkline/react@0.1.0`.

The same packed metadata and exact locked versions passed with npm's ordinary
peer resolver in an explicitly network-enabled diagnostic, and passed again
offline after that cache contained the required registry data. The browser
consumer in the default cloud configuration remains `BLOCKED` when the
Playwright-managed Chromium executable is absent. A separate run using the
explicitly identified system Chromium completed the installed-package browser
smoke and verified canvas cleanup. This is not Playwright-managed browser
certification.

The overall release state remains **NOT READY**. Phase 16 was not started.

## Environment and repository policy

| Item | Evidence |
| --- | --- |
| Node / npm | Node `v24.19.0`, npm `11.9.0` |
| Playwright | `1.64.1` |
| Browser used for local diagnostic | `/usr/bin/chromium`, `154.0.8037.57` |
| Required repository state | clean `main`, synchronized `origin/main` |
| Readiness artifact | `artifacts/release-readiness/2026-10-31T08-04-24-948Z/summary.json` |
| GitHub Actions | not used |
| Publication / tag / release | not performed |

The readiness policy now rejects a stale `work`/`origin/work` expectation and
requires valid, equal local and upstream `main` SHAs. The policy fixtures cover
the synchronized `main` case, stale branch/upstream state, dirty state, and
diverged state.

## Original failure and root cause

The original command was:

```bash
node scripts/consumer-preview-smoke.mjs
```

It used the isolated offline cache `/tmp/openkline-npm-cache`, packed the local
Core and React packages, and requested exact lockfile versions for React,
React DOM, TypeScript, and their declarations. npm failed with:

```text
npm error code ERESOLVE
npm error ERESOLVE unable to resolve dependency tree
While resolving: openkline-consumer-preview-...
Found: react@undefined
node_modules/react
  react@"19.3.1" from the root project
Could not resolve dependency:
peer react@">=18" from @openkline/react@0.1.0
```

Inspection of the isolated cache showed local `file:` tarball entries but no
complete registry artifact/metadata set for the requested lockfile packages.
The undefined discovered version is the decisive signal: npm did not have a
resolved React package to compare with the `>=18` peer range. This is
classified as `BLOCKED / OFFLINE_CACHE_INCOMPLETE`, not as a product peer
failure.

The package metadata was not weakened and peer-resolution bypass flags were not
used. A genuine resolved peer conflict would be classified separately as
`FAIL / INCOMPATIBLE_PEER_DEPENDENCY`.

## Corrective implementation

- Added deterministic archive selection by packed package name and version.
  Missing, malformed, ambiguous, and metadata-mismatched archives fail with
  explicit diagnostics.
- Validated packed peer metadata before installation. The React package still
  declares `openkline: ^0.1.0` and `react: >=18`.
- Installed exact lockfile versions with npm's ordinary peer resolver. No
  `--force` and no `--legacy-peer-deps` path exists in the smoke script.
- Added explicit offline-cache diagnostics for missing artifacts and npm
  metadata failures.
- Added independent consumers for Vanilla ESM, TypeScript declarations,
  React SSR, an installed-package Next.js App Router build, and an installed
  package browser chart.
- Browser consumer verification exercises pointer/wheel input, line and area
  series, rendering, and destruction; it requires zero remaining canvases.
- Ensured the temporary consumer directory is removed in the success and
  failure paths.
- Added pure release-readiness policy tests and made release scripts preserve
  `PASS`, `FAIL`, and `BLOCKED` classifications instead of collapsing them.

## Packed artifacts and dependency evidence

The smoke test generated and inspected these local package archives:

| Package | Archive | Version | Files | Size / unpacked | SHA-1 | SHA-512 integrity |
| --- | --- | ---: | ---: | ---: | --- | --- |
| `openkline` | `openkline-0.1.0.tgz` | `0.1.0` | 518 | 614,204 / 3,620,661 bytes | `ba5067fa1c3db20786a8d7af0e1984c6dd636ff3` | `sha512-ap0hgQbeqjAm2Tck00Bq0he8mGVXx8oULMZz3UoWS4VmUV5EiNNM39xHDEJ88t2ELJx+my7pOUhOW7NEEMclIQ==` |
| `@openkline/react` | `openkline-react-0.1.0.tgz` | `0.1.0` | 5 | 6,521 / 29,359 bytes | `4b5787841ac80ba7df3125574831ce74decee67f` | `sha512-PRVJ24OFQisHB/k5ozoub2qyAMrUXxzZjns2IcZkvg7o7osLUXzYKDX/EiZAQRpq+XN+OL2fnW9PHSUoGHAQDA==` |

The lockfile versions used by the consumer gate were React `19.3.1`, React
DOM `19.3.1`, TypeScript `5.9.3`, `@types/react` `19.3.0`, and
`@types/react-dom` `19.3.0`. The additional resolved registry packages needed
by the peer tree include `scheduler`, `csstype`, `@types/node`, and
`undici-types`. The package audit and distribution check both report zero
runtime dependencies for Core and the expected React peer contract.

## Independent consumer results

| Consumer / condition | Result | Evidence |
| --- | --- | --- |
| Initial isolated offline cache | **BLOCKED** | Reproduced `ERESOLVE` with `react@undefined`; classified `OFFLINE_CACHE_INCOMPLETE` |
| Online diagnostic, normal npm peers | **PASS** | Vanilla ESM, React SSR, Next.js build, and browser consumer completed using installed archives |
| Warmed offline cache, normal npm peers | **PASS** | Same five consumer classes completed without peer bypass flags |
| Browser consumer with explicit system Chromium | **PASS** | Chromium `154.0.8037.57`; installed chart rendered; destruction returned `1 → 0` canvases |
| Default cloud consumer gate | **BLOCKED** | Playwright-managed Chromium executable is absent; no system-browser substitution is implicit |

The passing consumer classes are:

1. Vanilla ESM import, `InMemoryDatafeed`, streaming update, and public
   KlineScript compilation/execution.
2. TypeScript declaration compilation using `@openkline/react` and Core
   public types.
3. React server-side rendering using the installed React package.
4. Next.js App Router production build using only installed package archives.
5. Browser chart creation from the installed Core package, pointer/wheel
   events, alternative line/area series, and lifecycle cleanup.

The smoke test does not import workspace source as a fallback. The browser
override is diagnostic evidence only; it does not clear official Firefox,
WebKit, Mobile Safari, physical-device, or Playwright-managed browser gates.

## Release-gate verification matrix

| Gate | Status | Evidence / explanation |
| --- | --- | --- |
| Packed Core/React metadata | **PASS** | Identity, versions, peers, archive selection, and malformed/ambiguous fixtures |
| Normal npm peer resolution | **PASS** | Online and warmed-offline exact lockfile installs; no bypass flags |
| Vanilla / TypeScript / React SSR / Next installed consumers | **PASS** | Independent temporary consumer project |
| Installed-package Chromium chart | **PASS (diagnostic)** | Explicit system Chromium; cleanup `1 → 0` canvases |
| Offline cache on a fresh isolated machine | **BLOCKED** | Requires complete registry artifacts and metadata in the configured cache |
| Default cloud consumer smoke | **BLOCKED** | Playwright-managed Chromium binary unavailable |
| Node regression suite | **PASS** | `npm test`: 328/328, zero failed/skipped |
| TypeScript | **PASS** | `npm run typecheck` |
| Market replay | **PASS** | `npm run test:market-replay`: 17/17 |
| Core Chromium browser | **PASS (diagnostic)** | `npm run test:browser`: 35/35 against system Chromium |
| React/Studio Chromium | **PASS (diagnostic)** | `npm run test:react:browser`: 38/38 |
| React production example | **PASS (diagnostic)** | Next build plus `1/1` Chromium test |
| Stress and cleanup | **PASS** | `npm run stress:ci`: zero orphan failures/workers/canvases |
| Package/distribution | **PASS** | Package audit, portability, package smoke, distribution check |
| Historical public API baseline | **FAIL / OPEN** | No removals, but three inherited declaration hash changes require owner review |
| Official Firefox/WebKit/Mobile Safari | **BLOCKED** | Playwright-managed binaries unavailable in this cloud environment |
| Formal accessibility / visual approval | **NOT TESTED** | Automated checks exist; formal/manual approval is absent |
| Physical devices | **NOT TESTED** | No Android/iOS devices attached |
| Effective license / third-party notices | **REQUIRES OWNER APPROVAL / BLOCKED** | Existing legal proposal is not effective license authority |
| Publication and release authorization | **REQUIRES OWNER APPROVAL** | No publication, tag, or release approval provided |

## Fresh regression, benchmark, and distribution evidence

The implementation commit was followed by these local checks:

```text
npm test                         PASS — 328/328
npm run typecheck                PASS
npm run test:market-replay       PASS — 17/17
npm run test:browser             PASS — 35/35 Chromium diagnostic
npm run test:react:browser       PASS — 38/38 Chromium diagnostic
npm run test:react:production    PASS — Next build and 1/1 Chromium
npm run stress:ci                PASS — 0 orphan failures, 0 workers, 0 canvases
npm run package:check            PASS — 518 files
npm run package:smoke            PASS
npm run package:audit            PASS
npm run package:portability      PASS
npm run distribution:check       PASS
npm run studio:check             PASS
npm run api:inventory            PASS — 319 runtime / 736 type exports
npm run api:diagnostics          PASS_ADDITIVE_REVIEW_REQUIRED
npm run api:check                FAIL / OPEN — no removals; 3 inherited hash changes
```

The refreshed distribution audit records Core SHA-1
`ba5067fa1c3db20786a8d7af0e1984c6dd636ff3`. The Canvas2D benchmark's fresh
100k run measured `62.51 FPS`, frame median `16.7 ms`, p95 `16.8 ms`, and zero
remaining canvases after destruction. These are cloud-environment
measurements, not universal performance claims. The optional 500k replay
workload was not run.

The latest readiness artifact reports `NOT READY` at commit
`861c41983d4222cf555ce215165f8d3c7f9ff36f`. Its repository gate is
`PASS` for clean synchronized `main`; API compatibility is `FAIL`, consumer
smoke is `BLOCKED`, managed browser compatibility is `BLOCKED`, and the
legal, accessibility, visual, physical-device, and authorization gates remain
open. The full `npm run release:check` path is therefore not reported as a
pass; it reaches the independent consumer gate and preserves its blocked
status when the managed browser executable is unavailable.

## Adoption and handoff constraints

- No effective root `LICENSE` or npm license metadata was changed.
- No protected API baseline was rewritten.
- No npm package was published, even though package and distribution checks
  were run locally.
- No GitHub Actions workflow, release tag, or GitHub release was created.
- The implementation commit was pushed to `origin/main` with author and
  committer `Akira Yuzai <yuzai.akira@gmail.com>`.
- This report and the generated audit refresh are committed in the final
  documentation commit; its exact SHA and remote synchronization are recorded
  in the post-push handoff because a commit cannot contain its own hash before
  it is created.

Phase 15.5.1 is engineering-verified for its feasible local consumer and
diagnostic scope, but the developer-preview/release milestone remains open
until the explicitly listed environmental and owner-approval gates are
resolved. Phase 16 must not begin on the basis of this report alone.
