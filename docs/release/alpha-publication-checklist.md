# OpenKline `0.1.0-alpha.1` publication checklist

Status: **No publication is authorized.** This is an owner decision checklist,
not a release command. It does not change the browser policy or stable-release
acceptance criteria.

## Evidence to review

- [ ] Review the final [Phase 5.3 verification](../reports/phase-5-3-verification.md),
  package manifest, candidate archive hashes, and local dry-run results.
- [ ] Confirm the release candidate was rebuilt after the final artifact-affecting
  source change and that the exact manifest/checksums are retained.
- [ ] Review the [alpha support matrix](./alpha-support-matrix.md), including
  system-Chromium-only evidence and Firefox/WebKit/Mobile Safari blocks.
- [ ] Review the [alpha release notes](./alpha-release-notes.md) for accuracy,
  known limitations, and no production-certification claim.

## A. License authorization — owner/legal sign-off required

- [ ] Complete every decision in [owner approval](./owner-approval.md) section A.
- [ ] Confirm copyright/contributor/provenance authority for the approved scope.
- [ ] Select the final license and retain the written legal/owner decision.
- [ ] Review actual dependency license texts and required notices for distributed
  artifacts; decide whether the private Next.js example is distributed.
- [ ] Only after approval, add the official license text, matching package
  metadata, and only verified notices; then rebuild and re-audit archives.

## B. Developer-preview scope — owner sign-off required

- [ ] Explicitly accept the documented alpha support matrix and security/API
  limitations.
- [ ] Explicitly acknowledge that physical mobile, Firefox, WebKit, and Mobile
  Safari behavior is not verified in this environment.
- [ ] Confirm this limited preview does not waive the stable 1.0 compatibility,
  security, attribution, or licensing gates.

## C. Publication authorization — owner sign-off required

- [ ] Approve registry, owning account/scope, package names, exact version,
  access level, and distribution destinations.
- [ ] Approve whether `openkline` and `@openkline/react` are published together.
- [ ] Approve the exact Git tag name, annotated-tag action, GitHub Release, and
  release-note text.
- [ ] Name the rollback/deprecation owner and user-communication channel.
- [ ] Recheck package availability/ownership with the authorized registry
  account immediately before any owner-approved publication.

## Maintainer actions after all approvals

- [ ] Record approval references, final commit, final tarball hashes, Node/npm,
  Playwright/browser evidence, and notices in the release report.
- [ ] Run the local release sequence from a clean checkout. A missing official
  browser artifact remains a blocker unless the owner records a specific,
  disclosed developer-preview exception; that exception cannot close stable
  release criteria.
- [ ] Obtain a separate explicit instruction before running any publication,
  tagging, GitHub-release, visibility, or onboarding-setting command.

No checkbox in this file authorizes `npm publish`, `git tag`, a GitHub Release,
or a repository-visibility change by itself.
