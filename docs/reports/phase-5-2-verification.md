# OpenKline Phase 5.2 verification

Verification date: 2026-10-25 (UTC)

Status: **Engineering readiness is verified locally where evidence is
available. Public developer-preview authorization and stable release approval
are not granted.** Legal approval and Playwright-managed Firefox/WebKit/Mobile
Safari verification remain external blockers.

Historical-policy note: references below to Apache-2.0 describe the proposal
current when this verification was written. The owner has since confirmed a
custom source-available policy draft; it is pending qualified-counsel review,
not effective, and not OSI-approved. See `docs/legal/README.md`.

## Implemented changes

- Added a portable `playwright.portable.config.ts` containing all five browser
  projects without host-specific executable paths.
- Added `npm run browser:verify`, which produces a transfer-ready environment,
  JSON result, stderr, and test-artifact directory without automatically
  downloading browsers or weakening TLS/browser policy.
- Added `npm run package:audit` to verify public package names, ESM/types
  exports, no runtime/bundled dependencies, pending license metadata, and safe
  packed-file boundaries for `openkline` and `@openkline/react`.
- Added local `0.1.0-alpha.1` review-candidate preparation and comprehensive
  clean-consumer verification. The candidate versions exist only inside
  ignored local staging tarballs; tracked package versions remain `0.1.0`.
- Added a public workspace-document round-trip benchmark to the plugin
  benchmark, alongside the existing plugin lifecycle and 100k indicator work.
- Added explicit release gates, license checklist, browser handoff, preview
  checklist, and updated API/development/release documentation.

## Acceptance matrix

| Requirement | Status | Evidence |
| --- | --- | --- |
| Apache-2.0 proposal text and activation process | **Verified as proposal** | `LICENSE-APACHE-2.0.PROPOSED` and `docs/legal/apache-2.0-proposal.md`; not effective |
| Ownership, contributor rights, patents, final license decision | **Pending owner approval** | Git identity/provenance evidence is insufficient to establish legal authority |
| Third-party lockfile inventory | **Verified for metadata** | 68 generated entries; URL/integrity validator passes |
| Third-party license text/notices | **Blocked** | Actual text/attribution review is still required, especially private example CC-BY/LGPL metadata |
| Package artifact boundary | **Verified locally** | `npm run package:audit`: root 142 files, React 5 files, no runtime/bundled dependencies |
| Public package-name observation | **Verified as observation** | Unauthenticated npm queries returned 404 for both names; no reservation or scope-ownership claim |
| Local prerelease candidate | **Verified locally** | `npm run preview:prepare` creates `0.1.0-alpha.1` review tarballs and SHA-256 manifest |
| Vanilla/TypeScript/React/Next/browser archive consumers | **Verified locally** | `preview:verify` uses only fresh installed candidate archives and public exports |
| Chromium/Pixel 7 local diagnostic projects | **Verified locally** | Existing local-configured Chromium projects pass; mobile result is emulation, not a physical device |
| Official managed Chromium/Firefox/WebKit/Mobile projects | **Blocked by environment** | Portable runner records missing managed executables; no system Firefox/WebKit/Safari substitution |
| Canvas, KlineScript, plugin/workspace performance | **Verified as measured** | Reproducible local benchmark data below; no universal performance promise |
| KlineScript/parser/runtime/workspace/plugin security regression | **Verified locally** | 48-test Node suite covers limits, cancellation, invalid input, forbidden host access, validation, rollback, and disposal |
| Preview publication, tag, GitHub release, cloud publication | **Not implemented** | Requires separate explicit owner authorization |
| Stable 1.0 release | **Blocked** | Licensing/attribution and browser gates remain open |

## License and attribution status

Apache-2.0 is the preferred candidate only. The repository audit found one
Git contributor identity and no tracked third-party source, media, fonts,
icons, WASM, or effective prior project license. That is evidence for review,
not proof of copyright ownership, contributor assignment, patent authority, or
relicensing rights. No effective `LICENSE`, package `license` field, or
unverified `NOTICE` was added.

The inventory currently covers 12 root development entries, 54 external Next
example entries, and two local workspace entries. The root package has no
runtime dependencies. The private example's dependency tree is not bundled in
the root package but needs separate notice/license review if it is distributed.
The exact owner/legal actions are in
`docs/release/license-approval-checklist.md`.

## Browser verification

The portable runner requires Playwright 1.64.1 managed artifacts and records
its expected executable locations dynamically. In this cloud environment its
full five-project run produced **Blocked** evidence because managed Chromium,
Firefox build 1555, and WebKit build 2370 executables were absent. Therefore
Mobile Safari (which uses WebKit) could not run. No repeated CDN/Docker retry,
TLS bypass, or system Firefox/Safari substitution was used.

The final portable-run record for implementation commit
`514fc02c4832f9ce01919bb0ac3c6715a8198076` is stored locally at
`artifacts/browser-verification/2026-10-25T07-24-43-373Z`. It records Node
v24.19.0, npm 11.9.0, Playwright 1.64.1, Linux x64, the five requested
projects, the managed executable paths, and
`blocked-missing-official-browser`. Artifacts are intentionally ignored because
they are reproducible local evidence, not source deliverables.

The existing local configuration ran 3 Chromium and 3 Pixel 7 mobile-emulation
tests against explicitly configured local Chromium. The staged-package browser
consumer also passed with explicit local Chromium 154.0.8037.57. These are
useful behavioral diagnostics, but they do not change the formal
managed-browser compatibility gate. The trusted-machine procedure and transfer
format are in `docs/release/browser-verification.md`.

`npm run release:check` was also run after the Phase 5.2 additions. Type
checking, all 48 Node tests, the local Chromium suite, benchmarks, inventory
validation, dependency audits, archive audit, and the Next production build
passed before its compatibility step. That step passed all three Mobile Chrome
tests and could not launch the three Firefox, three WebKit, or three Mobile
Safari tests because their expected Playwright-managed executables were
absent. This is recorded as an environment block, not as a product pass or a
Firefox/WebKit test failure.

## Package and clean-consumer verification

The archive audit verified root ESM/types exports and a React ESM/types export,
no runtime/bundled dependencies, and expected files only. The local candidate
generator stages `openkline` and `@openkline/react` at `0.1.0-alpha.1`; the
React candidate peer dependency is changed only inside its staging manifest to
the exact candidate core version. It writes checksums but does not alter
tracked manifests or publish anything.

Fresh `npm ci --dry-run` resolution also completed for the repository root and
the independent Next.js example. The clean consumer checks below are stronger
installation evidence because each uses a newly created directory and the
packed archives rather than a workspace link.

The clean consumer verification passed these fixtures from candidate tarballs
only:

- Vanilla ESM: historical `InMemoryDatafeed` load, streamed candle, built-in
  indicator, drawing serialization, plugin command/lifecycle, and KlineScript
  compile/execute.
- TypeScript: public core and React declarations.
- React: server-safe import and SSR rendering.
- Next.js App Router: independent Next.js 16.4.3 webpack production build,
  without the repository's local source alias.
- Browser: public ESM entry loaded through an installed-package import map;
  datafeed history/streaming, line/area/volume series, RSI/Bollinger/custom
  indicator panes, custom drawing/overlay/command plugin resources,
  KlineScript, workspace restore, appearance update, and destruction passed.

Unauthenticated registry lookups returned 404 for `openkline` and
`@openkline/react` at the audit time. This does not prove availability or
authorize the scope; recheck with the authorized release account.

## Performance observations

Environment: Node.js v24.19.0, Linux x64; browser measurements used local
Headless Chromium 154.0.0.0. These are fixture-specific observations, not
hardware-independent release budgets.

| Candles | FPS | Frame p50/p95 (ms) | Update per bar (ms) | Correction (ms) |
| ---: | ---: | ---: | ---: | ---: |
| 1,000 | 63.22 | 16.7 / 17.6 | 1.384 | 47.5 |
| 10,000 | 62.05 | 16.6 / 18.0 | 0.811 | 409.1 |
| 100,000 | 62.06 | 16.7 / 16.8 | 0.684 | 7379.3 |

The Canvas run observed 357,575,765 bytes before chart destruction,
1,899,858 bytes after destruction, and zero remaining canvases. Historical
correction is intentionally a more expensive full-recalculation path.

A later run inside `release:check` measured a 100k result of 54.41 FPS with a
16.7/37.6 ms frame p50/p95, 0.736 ms append, and 6,753.4 ms correction. This
cloud-host variation reinforces that these measurements are evidence from a
reproducible fixture, not a release promise or a cross-host regression budget;
no rendering-path optimization was introduced in Phase 5.2.

KlineScript measured 4.187 ms compilation; historical median/p95 was
1.666/1.666 ms (1k), 5.981/5.981 ms (10k), and 52.117/52.117 ms (100k), with
2,699,794 operations at 100k. Ten append updates took 8.197 ms and four 10k
concurrent executions took 23.676 ms. Cancellation raised
`KlineScriptRuntimeError` and disposal completed.

The 100k plugin/workspace microbenchmark measured plugin lifecycle median/p95
0.0062/0.0337 ms, indicator initialization 28.9607/65.3757 ms, and public
workspace JSON serialize/parse/validation round-trip 101.6723/152.2875 ms.
It is a Node microbenchmark, not Canvas2D or cross-device evidence.

## Security regression results

The local Node suite covers parser nesting/source/token/AST limits, operation
and per-bar budgets, cancellation, invalid financial input, source spans,
forbidden calls, internal executor non-export, KlineScript/native parity,
workspace validation, plugin activation rollback, state validation, and
disposal. Dependency audits remain zero-advisory for the root and private Next
example at the recorded lockfile versions. KlineScript remains a restricted
synchronous interpreter, not an OS-level sandbox; trusted plugins remain
in-process code.

## Remaining blockers and required approvals

1. Owner/legal written confirmation of copyright authority, contributor rights,
   Apache-2.0 selection, and patent/distribution suitability.
2. Review actual dependency license texts and required notices before
   distributing the example or any affected artifact.
3. Run and return the portable managed-Playwright report for Chromium,
   Firefox, WebKit, Mobile Chrome, and Mobile Safari from a trusted machine.
4. Explicit owner authorization of exact package names, versions, registry,
   release notes, and publication action.

## Release-candidate decision

`0.1.0-alpha.1` is **Prepared locally for owner review**, not published and
not approved for redistribution. It may be proposed as a limited-browser
developer preview only after the legal/distribution gate is approved and the
remaining browser limitations are disclosed. Stable 1.0 is **Blocked**.

## Git verification

Implementation commit
`514fc02c4832f9ce01919bb0ac3c6715a8198076`
(`feat(release): add portable preview verification`) was authored and committed
as `Akira Yuzai <yuzai.akira@gmail.com>` and pushed to `origin/work` after its
local verification. This report's final evidence-only update is committed and
pushed separately. No force-push, GitHub Action, tag, publish, or history
rewrite occurred.
