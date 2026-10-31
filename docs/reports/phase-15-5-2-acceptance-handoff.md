# OpenKline Phase 15.5.2 acceptance and owner-review handoff

Status: **REQUIRES OWNER APPROVAL**

This report is an engineering handoff. It does not adopt a license, approve
the protected API baseline, authorize npm or GitHub publication, or close the
remaining browser, accessibility, physical-device, legal, or release gates.

## Revision and scope

| Item | Result |
| --- | --- |
| Starting revision | `dc8dad5a10e36ee975e63d000d9e3cf10e3b7914` |
| Protected API baseline | `3e7a889a94c40255bbcce210a672856cfc98b32b` (unchanged) |
| Product source changes | **PASS** — no chart/runtime source changes were made for this handoff |
| Current review revision | `dc8dad5a10e36ee975e63d000d9e3cf10e3b7914` before handoff documentation commit |
| Final repository revision | Recorded by `git rev-parse HEAD` in the final delivery after the handoff commit |
| Branch and remote | `main`; synchronization is verified after push |
| Working tree | **PASS** when the final handoff commit is complete |

The changes are limited to review and release documentation, the generated
current API inventory, and regression tests for the browser-evidence
validator. Phase 16 was not started.

## Public API review

| Gate | Status | Evidence |
| --- | --- | --- |
| Current API inventory | **PASS** | `npm run api:inventory`; 319 runtime and 736 type exports; protected baseline not written |
| Additive diagnostics | **PASS** | `npm run api:diagnostics`; `PASS_ADDITIVE_REVIEW_REQUIRED`, no removals, changed existing signatures, or required-property additions |
| Strict compatibility comparison | **FAIL** | `npm run api:check` reports changed declaration hashes for `Chart`, `WorkspaceDocument`, and `WorkspaceRestoreOptions` |
| Protected baseline preservation | **PASS** | `docs/audits/public-api-baseline.json` remains at the Phase 15.5.1 baseline |
| Additive API approval | **REQUIRES OWNER APPROVAL** | Exact 46 `Chart` methods, six optional workspace fields, and optional calendar resolver are in `docs/reviews/public-api-owner-review-phase-15-5-2.md` |

The changed hashes are recorded as:

- `Chart`: `3bc2ff...ca86a75` → `c302ed...3c0d4e1`
- `WorkspaceDocument`: `6df247...158b4e` → `a64cd6...e67dd`
- `WorkspaceRestoreOptions`: `c2dc14...023bff` → `9bc8fb...f2dffe`

The full hashes and declarations, rather than abbreviated values, are in the
API dossier. No baseline update is authorized until the owner approves the
exact current contract and a fresh strict check is run.

## Browser and evidence status

| Lane | Status | Result |
| --- | --- | --- |
| Current five-project managed workflow | **BLOCKED** | `npm run browser:verify` at the current revision; Chromium, Firefox, and WebKit managed executables are absent |
| Current managed test totals | **BLOCKED** | 175 launch failures, zero launched expected tests; failures are environmental launch failures, not product assertions |
| Current system-Chromium diagnostic | **PASS** | 70/70 on `/usr/bin/chromium` 154.0.8037.57, including Pixel 7 emulation; not portable evidence |
| Direct compatibility command | **BLOCKED** | 35 local system-Chromium mobile tests passed; 105 Firefox/WebKit/Mobile Safari launches were blocked by missing managed executables |
| Historical evidence validation | **PASS** | `npm run evidence:browser:check`; valid only for each pack's recorded source revision |
| Current five-project compatibility claim | **NOT VERIFIED** | No current-revision official five-browser pack exists |
| Physical Android/iOS devices and native Safari | **NOT VERIFIED** | Not available in this environment |

The current managed report is
`artifacts/browser-verification/2026-10-31T08-44-19-940Z/` with status
`blocked-missing-official-browser`. Its hashes are recorded in
`docs/reviews/phase-15-5-2-browser-evidence-status.md`.

The trusted-host handoff is pinned to Playwright `1.64.1`, image
`mcr.microsoft.com/playwright:v1.64.1-noble`, digest
`sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea`,
and `/ms-playwright`. The trusted host must run the documented `npm ci`,
`npm run build`, and `npm run browser:verify` command and preserve
`environment.json`, `summary.json`, `playwright-results.json`,
`playwright-stderr.log`, and `test-results/` with complete SHA-256 records.
System browsers must not be substituted.

## Verification results

| Command or check | Status | Result |
| --- | --- | --- |
| `npm run typecheck` | **PASS** | TypeScript build and no-emit checks pass |
| `npm test` | **PASS** | 329 tests passed; no failures or skips |
| `npm run test:browser` | **PASS** | 35/35 Chromium tests on the explicitly configured local system Chromium |
| `npm run test:react:browser` | **PASS** | 38/38 Chromium React tests after a repeated isolated replay check |
| `npm run test:react:production` | **PASS** | Next production build and 1/1 production browser test |
| `npm run test:market-replay` | **PASS** | 17/17 tests |
| `npm run studio:check` | **PASS** | Core remains independent of React and Next.js; Studio is a reference consumer |
| `npm run evidence:browser:check` | **PASS** | All committed historical packs validate with their source-scoped policies |
| `npm run package:audit` / `package:check` / `package:portability` | **PASS** | Core/React artifacts and zero-runtime-dependency policy pass; license remains pending approval |
| `npm run distribution:check` | **PASS** | 518 core files; package SHA `ba5067fa1c3db20786a8d7af0e1984c6dd636ff3` |
| `npm run package:smoke` | **PASS** | Root ESM consumer succeeds |
| Next dependency audit and production build | **PASS** | 0 vulnerabilities; Next.js build completes |
| `npm run stress:ci` | **PASS** | Node and system-Chromium stress lanes pass; zero orphan workers and canvases |
| Browser-evidence mutation tests | **PASS** | Validator rejects provenance, identity, completeness, contradiction, and blocked-as-pass mutations |
| `npm run release:check` | **FAIL** | Stopped at non-publishing npm dry-run because `/home/agent/.npm/_cacache` is unavailable in the cloud environment |
| `npm publish --dry-run --ignore-scripts` with isolated cache | **PASS** | Tarball inspection succeeds; no package was published |

The release-check failure is an environment/tooling failure at the cache path,
not a publication or package-content success claim. It also means the complete
release-check sequence was not completed by that script; no release readiness
approval is inferred.

## Performance evidence

These measurements are local environment diagnostics and are not a substitute
for the historical trusted-machine baselines:

- Canvas benchmark: 100,000 candles at approximately 62.27 FPS, frame median
  16.7 ms, p95 16.9 ms, and zero remaining canvases after destruction.
- Multi-chart benchmark: dual 100,000 visual navigation median 34.1 ms and
  p95 81.6 ms; visual zoom median 35.4 ms and p95 76.5 ms; cleanup reported
  zero canvases.
- Market replay benchmark: 100,000 events, steady event median 0.007 ms and
  p95 0.010 ms; post-dispose checkpoint heap 120,669,792 bytes.
- Order-flow browser benchmark: realistic combined navigation approximately
  60.15 FPS and realtime approximately 56.82 FPS; fit-mode full-dataset
  numbers are separately reported and must not be presented as realistic
  viewport performance.
- Stress browser lane: interaction median 28.5 ms/p95 58.4 ms, zero orphan
  workers, and zero remaining canvases.

No optimization or chart-runtime rewrite was performed for this handoff.

## Consumer preview and package boundary

The Phase 15.5.1 consumer-preview evidence remains **PARTIAL** for a fresh
offline claim. Core and React tarballs, normal React/React DOM/TypeScript peer
resolution, the Vanilla/TypeScript/React SSR/Next consumers, and the local
browser smoke path passed. The isolated-cache ERESOLVE was accurately recorded
as `Found: react@undefined`; it was not bypassed with force or legacy-peer
flags. A warmed cache or an online pass does not prove a fresh offline
environment contains every registry artifact.

The owner-approved distribution scope remains
`APPROVED: CORE_AND_REACT_ONLY`. This does not authorize npm publication,
license adoption, a tag, a GitHub release, or a public release.

## Owner, legal, and release decisions

| Decision | Status |
| --- | --- |
| Core/React-only preview scope | **PASS** — previously recorded owner decision preserved |
| Studio visual requirement for library-only preview | **PASS** — previously recorded policy preserved; stable visual/device/a11y gates remain |
| Effective project license and metadata | **REQUIRES OWNER APPROVAL** — proposed custom license remains inactive pending qualified legal counsel |
| Contributor, employer, third-party, patent, and notice review | **REQUIRES OWNER APPROVAL** |
| API baseline update | **REQUIRES OWNER APPROVAL** |
| Alpha support matrix and limitations | **REQUIRES OWNER APPROVAL** |
| npm registry, version, channel, tag, release, rollback, and security disclosure | **REQUIRES OWNER APPROVAL** |
| Publication or release action | **NOT VERIFIED** — deliberately not performed |

The exact pending decisions are listed in
`docs/reviews/phase-15-5-2-owner-decisions.md`. Existing legal documents under
`docs/legal/` remain proposals and were not activated.

## Explicit acceptance matrix

| Acceptance criterion | Status | Evidence or blocker |
| --- | --- | --- |
| Protected API baseline unchanged | **PASS** | Baseline file preserved; no baseline rewrite |
| Current additive API reviewed | **PARTIAL** | Inventory and diagnostics pass; strict check and owner approval remain |
| Current official Chromium/Firefox/WebKit/mobile matrix | **BLOCKED** | Managed browser binaries unavailable in Cloud |
| Current system Chromium smoke path | **PASS** | Non-portable diagnostic only |
| Historical browser evidence provenance | **PASS** | Validator passes source-scoped historical packs |
| Browser evidence validator negative coverage | **PASS** | Targeted mutation test included in `npm test` |
| Package contents and portability | **PASS** | Package, distribution, smoke, and portability checks pass |
| Fresh offline consumer installation | **NOT VERIFIED** | Warm-cache/online evidence is insufficient; prior ERESOLVE is documented |
| React and Next.js consumer builds | **PASS** | React production and Next.js build pass locally |
| Performance and lifecycle diagnostics | **PASS** | Benchmarks and stress cleanup pass in this environment |
| Accessibility and visual release gates | **NOT VERIFIED** | Formal release review and cross-engine evidence remain open |
| Physical-device compatibility | **NOT VERIFIED** | No physical devices available |
| Effective license and legal clearance | **REQUIRES OWNER APPROVAL** | Proposal only; no adoption performed |
| Publication and release authorization | **REQUIRES OWNER APPROVAL** | No npm, tag, or GitHub release performed |
| Phase 16 start | **NOT VERIFIED** | Phase 16 must not begin from this handoff |

## Handoff conclusion

Phase 15.5.2 remains open. The repository has a reproducible owner-review
package, verified local engineering evidence, and a pinned trusted-host
procedure. It is not a release approval. The next authorized actions are to
obtain the written API/alpha/legal/release decisions and, separately, import a
current-revision five-project official Playwright evidence pack from the
trusted host using an owner-approved transfer mechanism.
