# OpenKline Phase 8.6.2 Verification

Date: 2026-10-26
Branch: `work`
Status: **NOT RELEASE READY**

Phase 8.6.2 integrates the trusted-machine browser result through GitHub,
validates the compact evidence records in the cloud workspace, improves the
visual-review determinism controls, and reruns the independently executable
package and browser checks. It does not publish archives, alter the effective
license, create a release, or claim physical-device compatibility.

## Repository and evidence provenance

The starting `work` checkout was clean at the required source revision
`19c86987453e2f5ae5572c4028ba9cb2e1f2f4aa`. GitHub branch
`qa/phase-8-6-1-browser-evidence` was fetched and reviewed before integration.
Its commit is:

`ac408424f8c1880615fea6b0994dc3b7abbddb0a`

The diff contained only these four intended QA files:

```text
docs/evidence/browser/phase-8-6-1/README.md
docs/evidence/browser/phase-8-6-1/manifest.json
docs/evidence/browser/phase-8-6-1/browser-matrix.json
docs/evidence/browser/phase-8-6-1/test-cases.json
```

They were integrated with commit
`13091be35f16faba1257fc1efa7bad2d72209096` and pushed to `origin/work`.
The evidence branch itself remains separate and `origin/work` was not changed
until this reviewed integration.

## Evidence validation

`npm run evidence:browser:check` is now a reusable local validator. It checks:

- exact source commit `19c86987453e2f5ae5572c4028ba9cb2e1f2f4aa` in all JSON
  records;
- Playwright package/CLI `1.64.1` and official image
  `mcr.microsoft.com/playwright:v1.64.1-noble`;
- expected official image digest
  `sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea`;
- five Playwright-managed projects, each with 14 records;
- all 70 unique records with `expected`/`passed` outcomes;
- 70 expected, 0 unexpected, 0 skipped, 0 flaky totals;
- recorded source-artifact and archive SHA-256 formats;
- trusted-machine, physical-device, archive handling, and publication flags;
- absence of personal paths, credentials, private keys, and common secret
  patterns.

Cloud validation result: **PASS**. It validates the compact GitHub records and
their internal consistency. It does not recompute the original tarball hashes
because the full archives and raw Playwright artifact directories remain on
the trusted Manjaro machine.

## Trusted browser matrix

| Project | Trusted-machine result | Cloud evidence result |
| --- | --- | --- |
| Chromium desktop | 14/14 Playwright-managed | **PASS — records validated** |
| Firefox | 14/14 Playwright-managed | **PASS — records validated** |
| WebKit | 14/14 Playwright-managed | **PASS — records validated** |
| Mobile Chrome / Pixel 7 emulation | 14/14 Playwright-managed | **PASS — records validated** |
| Mobile Safari / iPhone 13 emulation | 14/14 Playwright-managed | **PASS — records validated** |
| Total | 70 expected, 0 unexpected, 0 skipped, 0 flaky | **PASS — consistency validated** |

Trusted container provenance is the pinned official image above. The trusted
machine reported browser versions Chromium `156.0.8078.4`, Firefox `157.0`,
and WebKit `27.2`. Mobile projects are emulation. Mobile Safari zoom uses the
documented public `chart.zoom()` API path and is not native pinch testing.

The historical Phase 8.5 archive is recorded as:

```text
openkline-post-harness-fix-matrix-20261026T1545Z.tar.gz
SHA-256: 3cec7e41be217ade9aa0c3275daf7d4f2ecacbad332f2b60e7cefa12b2d230ec
Source: 4d689c86f619f32e4d91f90c4e3b03576ea38d6c
Totals: 65/65
```

The current Phase 8.6.1 archive is recorded as:

```text
openkline-phase-8-6-1-matrix-20261026T153655Z.tar.gz
SHA-256: 73bc6e2b12db91c87a85c1e82bcaf35395ba8291a1d2b39629f7ebf69d77fe3c
Source: 19c86987453e2f5ae5572c4028ba9cb2e1f2f4aa
Totals: 70/70
```

Both hashes are trusted-machine provenance. Neither archive was transferred
to or recomputed in the cloud. The cloud must not claim to have executed the
Firefox, WebKit, or mobile tests; its local managed-browser runner remains a
separate blocked diagnostic.

## Accessibility status

The existing accessibility implementation remains intact and the trusted
records include the Canvas accessible-state scenario in all five projects.
Local Chromium/React checks continue to cover:

- Canvas `role="img"`, focusability, dynamic text summary, and empty state;
- named controls, keyboard focus, status semantics, dialog description;
- Escape dismissal and focus restoration to the triggering control.

The formal accessibility gate remains **NOT TESTED**. No owner-approved WCAG
conformance target exists, and manual screen-reader, contrast, reduced-motion,
keyboard workflow, and physical-device review are not claimed.

## Visual regression status

Visual review was made more reproducible by fixing and recording locale
`en-US`, timezone `UTC`, device scale factor `1`, reduced motion `reduce`,
fixed desktop/narrow viewports, deterministic fixture metadata, resolved
Chromium version, and disabled screenshot animations. The targeted Chromium
visual tests passed 2/2.

The current candidate reports are still `SCREENSHOT GENERATED`; no baseline
was auto-approved:

| Candidate | Browser | Viewport | Bytes | SHA-256 |
| --- | --- | --- | ---: | --- |
| `studio-dark.png` | Chromium 154.0.8037.57 | 1280×900 | 478,125 | `4191051220803af70c4b51b6d5376aa1272cbae6faabf2b5ffa54597535b39b0` |
| `studio-light.png` | Chromium 154.0.8037.57 | 1280×900 | 477,507 | `94c3700d5220147343e83891d8f9048f6d2e18ff252936ab68b8d6ba1f261a6e` |
| `studio-mobile.png` | Chromium 154.0.8037.57 | 390×844 | 481,616 | `4043f4ce47b55e27791f1be278e4a93bff61f25d69431d60c096047cdd8fc20f` |

Font availability and Canvas rasterization remain environment-specific. Owner
or designated reviewer approval of baselines is still required.

## Regression and package verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | **PASS** |
| `npm test` | **PASS — 156/156** |
| `npm run api:check` | **PASS — no removed or changed signatures** |
| `npm run package:portability` | **PASS — zero core/React runtime dependencies** |
| `npm run package:smoke` | **PASS — packed ESM consumer import** |
| `npm run distribution:check` | **PASS — 394 files, no problems, shasum `a47982d4134ee227e66e31e57909b2b62a5453e4`** |
| `npm run studio:check` | **PASS — core remains framework/example independent** |
| `npm run test:browser` | **PASS — 14 local system-Chromium tests** |
| `npm run test:react:browser` | **PASS — 20 local system-Chromium tests** |
| Next.js production build | **PASS** |
| Visual review tests | **PASS — 2/2 candidates generated** |
| `npm run evidence:browser:check` | **PASS — 70 records, sanitization PASS** |

Local Chromium results are diagnostic evidence only. They do not replace the
trusted managed-browser matrix and do not clear the local managed-browser gate.

## Release-readiness result

The latest `npm run release:readiness` run was generated at:

`artifacts/release-readiness/2026-10-26T16-14-29-971Z/summary.json`

The result was **NOT READY**, with all independently executable engineering
gates passing, including the new `trusted-browser-evidence` gate. The local
`managed-browser-compatibility` gate remains **BLOCKED** because official
managed binaries are not installed in this cloud environment. Remaining
manual/approval gates are:

| Gate | Status |
| --- | --- |
| Trusted compact browser evidence consistency | **PASS** |
| Local managed-browser execution | **BLOCKED** |
| Formal accessibility conformance | **NOT TESTED** |
| Approved visual baselines | **NOT TESTED / OWNER REVIEW** |
| Physical Android/iOS devices | **NOT TESTED** |
| Effective custom license | **REQUIRES OWNER APPROVAL / LEGAL REVIEW** |
| Third-party notices | **BLOCKED / LEGAL REVIEW** |
| Release authorization/version/channel | **REQUIRES OWNER APPROVAL** |

No criteria were silently waived. No GitHub Actions, release tags, npm
publication, GitHub release, license activation, or public release action was
performed.

## Owner decisions required

1. Select the formal accessibility conformance target and approve the manual
   review procedure.
2. Approve or reject the deterministic visual candidates as baselines.
3. Decide whether physical Android/iOS verification is mandatory and define
   supported devices/versions.
4. Obtain qualified legal approval for the proposed source-available license
   and third-party notices.
5. Authorize a release version, channel, and publication strategy.

## Git verification and final decision

The evidence integration commit `13091be` and QA tooling commit `84025fc` were
created with `Akira Yuzai <yuzai.akira@gmail.com>` as author and committer and
pushed to `origin/work`. The documentation commit containing this report will
be recorded in the final handoff. No history was rewritten or force-pushed.

**Phase 8.6.2 engineering work is complete within the executable scope, but
OpenKline remains NOT RELEASE READY.** Trusted browser evidence is now
integrated and consistency-validated, while formal accessibility, visual
approval, physical-device, legal, and owner-release gates remain open.
