# OpenKline Phase 5.3 verification

Verification date: 2026-10-25 (Asia/Tehran)

Status: **Owner-review preparation is in progress. No publication, tag,
effective license change, or stable-release approval is granted.** This report
is finalized after the Phase 5.3 package-affecting documentation commit is
used to regenerate and verify a fresh local candidate.

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
The Phase 5.3 local diagnostic recorded Playwright 1.64.1, Linux x64/Debian 13,
Chromium `154.0.8037.57`, exact launch flags, actual user agents, and 6/6
passing tests (three desktop plus three mobile-emulation tests). This evidence
is **Verified locally** only.

The managed portable workflow has no executable override. Its current run
records absent managed Chromium build 1248, Firefox build 1555, and WebKit
build 2370 paths, 15 unlaunched project test failures, diagnostics, JSON
results, and SHA-256 artifact hashes. Its status is **Blocked by environment**,
not a product failure or browser pass. Firefox, WebKit, and Mobile Safari stay
blocked; Mobile Chrome managed emulation also stays blocked. No unsupported
browser, TLS bypass, or repeated download attempt was used.

## Owner decision package

The following documents are ready for owner/legal review:

- `docs/release/owner-approval.md`: separate license, alpha-scope, and
  publication decisions; Apache-2.0 explanation; ownership/attribution limits.
- `docs/release/alpha-support-matrix.md`: Verified, Blocked by environment,
  Unverified, and Unsupported platform claims.
- `docs/release/alpha-release-notes.md`: proposed alpha installation, APIs,
  limits, security boundary, troubleshooting, and compatibility expectations.
- `docs/release/alpha-publication-checklist.md`: approvals and post-approval
  maintainer sequence without performing any public action.

Apache-2.0 remains a proposal only. The owner/legal reviewer must establish
ownership/contributor/patent authority and review actual third-party licenses
and notices before effective licensing, metadata, or distribution. The private
Next.js example is not in the root package archive but needs separate review if
distributed, including its CC-BY/LGPL-related metadata.

## Candidate and dry-run status

The prior local candidate manifest from implementation commit `514fc02` is
valid historical Phase 5.2 evidence but is not reused for this increment,
because the root README changed and is included in the root package archive. A
new `0.1.0-alpha.1` manifest, SHA-256 values, archive-only consumer run, and
complete local release dry run are recorded in the final update to this report.

## Current release decision

Technical preparation can be presented to the owner once the final candidate
and local dry-run entries below are recorded. Public developer-preview
publication remains **Not authorized** pending all three explicit owner
decisions: license/ownership, documented preview scope, and exact publication
action. Stable 1.0 remains **Blocked** by existing legal/attribution and formal
browser gates.
