# OpenKline Phase 5.3 verification

Verification date: 2026-10-25 (Asia/Tehran)

Status: **The owner-review package and all available local evidence are
complete. No publication, tag, effective license change, or stable-release
approval is granted.** Legal/ownership decisions, third-party notice review,
and managed-browser evidence remain open external gates.

## Baseline evidence audit

The baseline is verified as commit
`8490f6f162aebcfba47483fdf46b8cf0aee05352` on `work`, with a clean worktree
before this increment. Its author and committer are both
`Akira Yuzai <yuzai.akira@gmail.com>`. Phase 5.1 and 5.2 reports, all release
documents, package scripts, manifests, public exports, archived-candidate
manifests, dependency inventory, and security audit were reviewed.

The evidence supports these existing claims: typechecking and 48 Node tests
passed; root and example dependency audits had zero advisories at their
recorded lockfile versions; ESM/types exports and clean consumer paths passed;
the root/React package audit excludes runtime/bundled dependencies and
unintended paths; KlineScript/plugin/workspace regressions are covered locally;
and local measurements are fixture-specific observations. Claims about a
managed Chromium, Firefox, WebKit, Mobile Safari, legal ownership, third-party
notice completion, npm name ownership, or publication are not supported and
remain open.

## Browser provenance audit

The apparent earlier discrepancy is resolved. `playwright.config.ts` sets the
explicit system executable `/usr/bin/chromium` for desktop Chromium and Pixel 7
Mobile Chrome emulation. It is not a Playwright-managed browser configuration.
The final Phase 5.3 local diagnostic ran on implementation commit
`08e79b50a84b62461859ad4040ee90dc655e864f`. It recorded Playwright 1.64.1,
Linux x64 (kernel `6.18.55`), system Chromium `154.0.8037.57` on Debian GNU/
Linux 13, exact `--no-sandbox --disable-dev-shm-usage --disable-gpu` launch
flags, actual user agents, and 6/6 passing tests (three desktop plus three
mobile-emulation tests). Its evidence directory is
`artifacts/browser-diagnostic/2026-10-25T10-18-50-097Z`; the environment and
Playwright-result SHA-256 values are respectively
`9255fdc2a6c546797e10ccaed69060966a1154b8ca8505d823c20afef8526911` and
`399bca1e2634b04d5343befd0b7a196151cbde4e1b0d960aea085f230523311c`.
This evidence is **Verified locally** only.

The managed portable workflow has no executable override. Its final run on the
same commit is in
`artifacts/browser-verification/2026-10-25T10-18-58-276Z`; it records absent
managed Chromium build 1248, Firefox build 1555, and WebKit build 2370 paths,
15 unlaunched project test failures, diagnostics, JSON results, and SHA-256
artifact hashes. The environment and result SHA-256 values are respectively
`2c733f3a133d01f91e018e54338d8ef9787cb54fdbe569721b2d96f340ea83f2` and
`e3be1a06fc102d1eeac4036948f55f903858d47490d3717b1c6747fda9e76110`.
Its status is **Blocked by environment**, not a product failure or browser
pass. Firefox, WebKit, and Mobile Safari stay blocked; Mobile Chrome managed
emulation also stays blocked. No unsupported browser, TLS bypass, or repeated
download attempt was used.

## Owner decision package

The following documents are ready for owner/legal review:

- `docs/release/owner-approval.md`: separate license, alpha-scope, and
  publication decisions; source-available policy, ownership, and attribution
  limits.
- `docs/release/alpha-support-matrix.md`: Verified, Blocked by environment,
  Unverified, and Unsupported platform claims.
- `docs/release/alpha-release-notes.md`: proposed alpha installation, APIs,
  limits, security boundary, troubleshooting, and compatibility expectations.
- `docs/release/alpha-publication-checklist.md`: approvals and post-approval
  maintainer sequence without performing any public action.

The owner has now confirmed a custom source-available policy, drafted under
`docs/legal/`. It permits only qualifying free, public-source, no-advertising,
no-paid-feature Consumer Applications, permits benefit-free voluntary
donations, and requires a separate written license for nonconforming use. It is
not OSI-approved and is not effective until qualified counsel and the
authorized copyright holder adopt final text. The owner/legal reviewer must
still establish ownership/contributor/patent authority and review actual
third-party licenses and notices before effective licensing, metadata, or
distribution. The private Next.js example is not in the root package archive
but needs separate review if distributed, including its CC-BY/LGPL-related
metadata.

## Licensing policy update

The owner has confirmed a policy direction, not final legal adoption: OpenKline
may be used only by Consumer Applications that are free for all end users,
publish their required source, document licensing compatibility limits, offer
no paid features/subscriptions/advertising/paid promotions/revenue-generating
affiliates, and give donors no product benefit. Unrelated company revenue alone
does not disqualify an application. Use outside these terms requires a separate
written license from the authorized copyright holder.

`docs/legal/` now contains the proposed custom text, definitions, permitted and
prohibited examples, donation/advertising rules, OSI-license interaction
analysis, and ownership/counsel checklist. The policy is expressly custom
source-available, not OSI-approved, and potentially incompatible with some
OSI-licensed combined works. The prior Apache-2.0 proposal is recorded as
superseded historical material. No root `LICENSE`, package `license` field,
NOTICE, npm publication, tag, or release was changed.

After the legal-document update, `npm run release:check` validated the added
legal-document paths and passed typecheck, all 48 Node tests, local Chromium
diagnostic tests, package/consumer checks, dependency audits, and the Next.js
production build. It correctly exited non-zero only at the pre-existing
managed Firefox/WebKit/Mobile Safari gate; Mobile Chrome passed 3/3 and no
browser substitution was used. The package audit continued to require and
confirm absent project `license` fields while legal adoption is pending.

## Supported platform matrix

The authoritative alpha matrix is
[`docs/release/alpha-support-matrix.md`](../release/alpha-support-matrix.md).
Vanilla ESM, TypeScript, React SSR, and independent Next.js App Router archive
consumers are **Verified** locally. Desktop Chromium and Pixel 7 Mobile Chrome
emulation are **Verified** only using the system Chromium diagnostic above.
Firefox, WebKit, and Mobile Safari emulation are **Blocked by environment**;
physical devices are **Unverified**; CommonJS and vendor/broker integrations
are **Unsupported**. Emulation is not a physical-device claim.

## Candidate integrity

The Phase 5.2 candidate was correctly retired as historical evidence because
the root README changed and is part of the core archive. A fresh local
`0.1.0-alpha.1` candidate was generated from implementation commit
`08e79b50a84b62461859ad4040ee90dc655e864f` at
`artifacts/developer-preview/0.1.0-alpha.1-08e79b5/manifest.json`:

| Package | Candidate SHA-256 | Packed / unpacked size | Contents |
| --- | --- | --- | --- |
| `openkline` | `a3117670792e9fb2d0e37a70efce8c78c95bf572e0670523d525f5b33bb90410` | 129,358 / 731,929 bytes | 142 expected README/dist/manifest files |
| `@openkline/react` | `13ce25c5eedcd8bc12ef33b53231842fbc181703fc37852bab6504d20108ed73` | 2,667 / 10,362 bytes | 5 expected dist/manifest files |

The manifest records Node v24.19.0, npm 11.9.0, candidate peer alignment, and
the pending-license-only distribution status. Independent `sha256sum` output
matched both manifest values. Archive audit confirmed ESM/types root exports,
no runtime or bundled dependencies, no credentials/unintended files, and no
effective license field while owner approval remains pending.

`OPENKLINE_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run preview:verify`
then created fresh temporary consumers using only staged archives. It passed
Vanilla ESM datafeed/indicator/drawing/plugin/KlineScript checks, TypeScript
declarations, React SSR, an independent Next.js 16.4.3 App Router production
build, and an installed-package browser chart covering all core series,
indicators, plugin resources, KlineScript, workspace restoration, and cleanup.
Its browser source is explicitly `explicit-local-override` at Chromium
`154.0.8037.57`, so it is not managed cross-browser acceptance.

## Security and dry-run results

Fresh root and example `npm ci --dry-run` resolution passed. The complete local
`NPM_CONFIG_CACHE=/tmp/openkline-npm-cache npm run release:check` ran after the
Phase 5.3 implementation changes. It passed typecheck; all 48 Node tests;
local browser provenance; model, Canvas2D, KlineScript, and plugin/workspace
benchmarks; inventory validation; root/example zero-advisory audits; package
audit/contents/smoke; installed consumer smoke; `npm publish --dry-run` without
publication; and the Next.js production build. The release check correctly
exited non-zero only at the required Firefox/WebKit/Mobile Safari compatibility
gate: Mobile Chrome passed 3/3, while three Firefox, three WebKit, and three
Mobile Safari tests could not launch their missing managed executables.

The 48-test suite continued to cover KlineScript source/parser/AST limits,
runtime work budgets/cancellation/invalid data/forbidden host access, public
executor isolation, native parity, plugin rollback/disposal, and workspace
validation. Root and private-example `npm audit` reported zero advisories at
the recorded lockfile versions. The performance results remain local fixture
measurements: the release-check Canvas2D run observed 63.65/62.99/62.11 FPS at
1k/10k/100k candles, 0.657 ms newer-bar update at 100k, 6,547.1 ms correction,
and zero canvases after destruction. No universal FPS, memory, or browser
performance guarantee is made.

## Outstanding owner approvals and recommendation

Three separate owner decisions are still required and are not inferred from
this engineering task:

1. **License authorization:** ownership/contributor/patent authority,
   counsel-approved final source-available text, OSI-license compatibility
   disclosures, commercial-exception process, and actual third-party
   notice/text review.
2. **Developer-preview scope:** acceptance of the support matrix and disclosed
   browser/security/API limitations, without waiving stable-release gates.
3. **Publication authorization:** exact registry/account, package names,
   version, access level, tag, GitHub Release, destinations, and rollback plan.

Recommendation: **do not publish yet**. The repository is ready for a clear
owner decision package and local review of the exact archives. A limited alpha
may be considered only after written license/distribution authorization and
explicit disclosure/acceptance of the blocked browser scope. Stable 1.0 remains
**Blocked** by legal/attribution and managed-browser gates.

## Git verification

Implementation commit
`08e79b50a84b62461859ad4040ee90dc655e864f`
(`feat(release): add alpha approval evidence`) used author and committer
`Akira Yuzai <yuzai.akira@gmail.com>` and was pushed to `origin/work`
immediately after its successful dry run. This final evidence-only report
update is committed and pushed separately. No force-push, history rewrite,
GitHub Action, tag, release, or publication occurred.
