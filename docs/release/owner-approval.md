# OpenKline developer-preview owner approval

Status: **Decision required. This document records approvals; it grants none.**

Candidate under review: `0.1.0-alpha.1` for `openkline` and
`@openkline/react`. It is a local review artifact only. No package, Git tag,
GitHub release, repository-visibility change, or onboarding publication is
authorized by this document.

## A. License authorization

Apache License 2.0 is proposed because it is a permissive, widely understood
license with commercial-use, modification, and redistribution permissions,
subject to its conditions. If adopted, distributors must include a copy of the
license, retain required copyright/patent/trademark/attribution notices in
source form, and preserve any applicable `NOTICE` information. Apache-2.0 also
contains an express patent license and patent-termination provision. This is a
plain-language summary, not legal advice; the official text and legal review
control.

Before recording approval, the authorized owner/legal reviewer must decide and
retain evidence for all of the following:

- authority to license all project-authored code, documentation, examples, and
  generated outputs within the chosen scope;
- contributor, employer, contractor, assignment, and historical-provenance
  rights, including any patent authority needed for Apache-2.0;
- whether Apache-2.0 covers both candidate packages and which examples or
  documentation are distributed with them;
- actual third-party license texts and required notices, particularly the
  private Next.js example's CC-BY-4.0 and LGPL-related metadata if that example
  will be redistributed;
- whether any untracked asset, vendored source, branding, data, or prior work
  needs attribution or is excluded.

Current evidence is limited: the inventory has 68 lockfile/workspace entries,
the root and React archives have no runtime/bundled dependencies, and the
tracked asset scan found no fonts, media, WASM, or copied third-party source.
Git author metadata is not proof of ownership. No effective root `LICENSE`,
`NOTICE`, SPDX/copyright statement, or package `license` metadata exists.

Record a written decision here or in an owner-controlled record:

| Required decision | Owner/legal record | Date | Reference |
| --- | --- | --- | --- |
| Authority and contributor/provenance review complete | Pending | — | — |
| Approved project license and distribution scope | Pending | — | — |
| Apache-2.0 patent terms accepted, if selected | Pending | — | — |
| Third-party texts/notices reviewed | Pending | — | — |
| Verified notices and metadata approved | Pending | — | — |

Only after all applicable rows are approved may a maintainer replace
`LICENSE-APACHE-2.0.PROPOSED` with the official Apache-2.0 text, add matching
manifest metadata, add only verified notices, regenerate the candidate, and
re-run its package checks. This task does not do that work.

## B. Developer-preview scope

The owner must explicitly decide whether the limited alpha scope is acceptable:

- browser evidence is verified only for a system-installed Chromium diagnostic
  and Pixel 7 browser emulation on this host;
- Firefox, WebKit, and Mobile Safari are **Blocked by environment** because
  Playwright-managed executables are unavailable; they are not verified;
- mobile emulation is not physical-device verification;
- KlineScript is a restricted synchronous interpreter, not an OS-level sandbox;
  plugins are trusted in-process modules; and no vendor authentication or
  hosted service is provided;
- the 0.x API is subject to change and this candidate is not production
  certified or financial advice.

Approval of this narrow preview scope must not waive the stable 1.0 browser,
security, licensing, or attribution gates. Record the decision:

| Required decision | Owner record | Date | Reference |
| --- | --- | --- | --- |
| Alpha browser/support limitations accepted | Pending | — | — |
| Security and API-stability limitations accepted | Pending | — | — |
| Stable-release gates remain unchanged | Pending | — | — |

## C. Publication authorization

After A and B are complete, the owner must separately authorize the exact
public action. Confirm all fields rather than inferring them from this plan:

| Publication decision | Required owner value |
| --- | --- |
| npm registry and authorized account/scope | Pending |
| `openkline` package name and `0.1.0-alpha.1` version | Pending |
| `@openkline/react` package name and `0.1.0-alpha.1` version | Pending |
| npm access level and destinations | Pending |
| Git tag name and annotated-tag approval | Pending |
| GitHub release approval and release-note text | Pending |
| Candidate commit and manifest SHA-256 values | Pending final candidate |
| Rollback/deprecation owner and communication path | Pending |

Until all three sections have an explicit owner decision, maintainers must not
run `npm publish`, create a tag or GitHub release, change repository
visibility, or distribute the candidate as a licensed public artifact.
