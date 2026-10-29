# OpenKline developer-preview owner approval

Status: **Decision required. This document records approvals; it grants none.**

Candidate under review: `0.1.0-alpha.1` for `openkline` and
`@openkline/react`. It is a local review artifact only. No package, Git tag,
GitHub release, repository-visibility change, or onboarding publication is
authorized by this document.

## A. License authorization

The owner-confirmed policy is now a proposed custom source-available license:
Consumer Applications using OpenKline must be free for every end user, publish
their required source, document compatibility limits, offer no paid features,
subscriptions, ads, paid promotions, or revenue-generating affiliates, and
give donors no product benefit. Unrelated company revenue alone is not a
disqualifier. Any use outside those conditions requires a separate written
license from the authorized copyright holder. This is a policy instruction, not
an adopted license grant or legal opinion.

Read the proposed terms, examples, compatibility analysis, and ownership
checklist in [`docs/legal/README.md`](../legal/README.md). The proposal is not
OSI-approved Open Source; its use of source-availability conditions can be
incompatible with some OSI-approved consumer-application licenses. Qualified
counsel must review the final wording and compatibility before adoption.
The Phase 5.4 [counsel review package](../legal/counsel-review-package.md)
identifies the exact scenario, ownership, and drafting decisions to record;
its [adoption procedure](../legal/license-adoption-procedure.md) is expressly
post-approval only.

Before recording approval, the authorized owner/legal reviewer must decide and
retain evidence for all of the following:

- authority to license all project-authored code, documentation, examples, and
  generated outputs within the chosen scope;
- contributor, employer, contractor, assignment, and historical-provenance
  rights, including the final patent/trademark position;
- whether the custom proposal covers both candidate packages and which examples or
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
| Approved package distribution scope | **APPROVED: CORE_AND_REACT_ONLY** (scope only; not a license grant or publish auth) | 2026-10-29 | Owner ChatGPT instruction; `docs/reports/phase-8-8-21-distribution-scope-decision.md` |
| Approved project license (effective grant) | Pending | — | Proposal remains inactive |
| Counsel-approved source-available terms and patent/trademark position | Pending | — | — |
| OSI-license compatibility and consumer disclosure approach | Pending | — | — |
| Third-party texts/notices reviewed for **approved package scope** | Pending review — example CC-BY/LGPL rows are out of approved package artifact scope if packs stay as verified | — | `docs/reports/phase-8-8-21-package-attribution-scope.md` |
| Verified notices and metadata approved | Pending | — | Do not activate NOTICE/license metadata yet |

Only after all applicable rows are approved may a maintainer replace
the pending state with counsel-approved final license text, add counsel-approved
matching manifest metadata, add only verified notices, regenerate the
candidate, and re-run its package checks. This task does not do that work.

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
| Candidate commit and manifest SHA-256 values | `08e79b50a84b62461859ad4040ee90dc655e864f`; core `a3117670792e9fb2d0e37a70efce8c78c95bf572e0670523d525f5b33bb90410`; React `13ce25c5eedcd8bc12ef33b53231842fbc181703fc37852bab6504d20108ed73` |
| Rollback/deprecation owner and communication path | Pending |

Until all three sections have an explicit owner decision, maintainers must not
run `npm publish`, create a tag or GitHub release, change repository
visibility, or distribute the candidate as a licensed public artifact.
