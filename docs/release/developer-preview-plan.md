# Developer preview plan

Status: **Proposed only; publication, tagging, and version changes require
explicit project-owner approval.**

## Proposed preview

The first preview could use `0.1.0-alpha.1` for:

- `openkline`, the framework-independent chart engine;
- `@openkline/react`, the optional React binding.

This document does not change either package version, add a public tag, publish
to npm, or create a GitHub release. The repository currently has no effective
project license, so the preview cannot be treated as an open-source
redistribution until the owner/legal decision is recorded and the package
metadata is updated.

## Intended audience and support boundary

The preview is for maintainers and selected integrators validating the public
API, Canvas2D rendering, datafeed adapters, indicators, drawings, plugins,
workspace state, and KlineScript. It is not a production-support commitment,
financial advice product, or compatibility guarantee for unverified browsers.
The 0.x API may change between previews.

KlineScript executes in-process and is restricted by the implemented compiler,
runtime validation, budgets, and cancellation controls. It must not be treated
as a general-purpose sandbox for untrusted code. Plugins are trusted
in-process modules. Vendor authentication and remote datafeed credentials are
outside the core package.

## Release gates

Before an owner-approved preview, the release owner must verify:

1. Project license selection, effective `LICENSE`, package license metadata,
   and the reviewed third-party inventory/notice obligations.
2. Clean-install, typecheck, unit/integration, package-consumption, React,
   Next.js, KlineScript, indicator, drawing, plugin, workspace, and benchmark
   checks from `docs/release/local-release-process.md`.
3. Real Playwright runs for Chromium, Firefox, WebKit, Mobile Chrome, and
   Mobile Safari, or an explicitly documented owner-approved exception. The
   current Firefox, WebKit, and Mobile Safari launches are environment-blocked.
4. Release notes that distinguish implemented, verified, blocked, and untested
   behavior, with no unsupported performance promise.
5. A reproducible package dry-run and independent consumer smoke test. A real
   `npm publish` is a separate authorized action and is not part of local CI.

## Preview distribution and rollback

Until publication is approved, use local tarballs produced by
`npm run preview:prepare` and verify them with `npm run preview:verify`.
Those commands create a versioned `0.1.0-alpha.1` staging manifest and install
only the staged archives into fresh Vanilla, TypeScript, React, Next.js, and
browser fixtures. Do not distribute an artifact as a licensed package while
the legal decision is pending.

The owner-review package is in
[`owner-approval.md`](./owner-approval.md), the evidence-qualified platform
claims are in [`alpha-support-matrix.md`](./alpha-support-matrix.md), and the
proposed developer-preview notes are in
[`alpha-release-notes.md`](./alpha-release-notes.md). None authorizes
publication.

For a future owner-approved registry preview, record the exact package
versions, tarball checksums, git commit, Node/npm versions, browser results, and
release notes. Rollback means deprecating the affected preview version and
publishing a corrected higher preview version under the registry's documented
policy; never rewrite or force-push the repository history.

## Current blockers

- Effective project license and package metadata: awaiting owner/legal choice.
- Complete third-party license text/notice review: open, especially example
  CC-BY-4.0 and LGPL-related metadata.
- Official Firefox, WebKit, and Mobile Safari Playwright verification: blocked
  by unavailable official browser artifacts in this environment.
- Stable release approval: not granted.

## Package-name observation

On 2026-10-25, unauthenticated `npm view openkline version --json` and
`npm view @openkline/react version --json` returned registry `404` responses.
That is only a point-in-time visibility observation: it does not reserve either
name, prove scope ownership, or authorize publication. Recheck with the
authorized registry account immediately before any owner-approved release.
