# OpenKline Phase 5.4 license-adoption readiness

Verification date: 2026-10-25 (Asia/Tehran)

Status: **Counsel-review materials are prepared; license adoption and alpha
publication are not authorized.** This report records repository evidence and
policy-drafting review, not legal advice or an ownership determination.

## Confirmed owner policy

The owner has confirmed that a Consumer Application using OpenKline must be
free for every end user; publicly provide its required source; have no paid
features, premium tiers, subscriptions, paid access, advertising, paid
promotions, or revenue-generating affiliate promotions; and comply with
modification, redistribution, attribution, and notice obligations. Truly
voluntary donations are allowed only when no donor receives a product benefit.
Unrelated company revenue does not itself disqualify a qualifying application.
Any use outside these conditions requires a separate written license from the
authorized copyright holder.

This is a custom **source-available** policy. It is not an OSI-approved Open
Source license, has no project-assigned SPDX identifier, and is not an
effective permission grant yet.

## Current proposal status

The complete proposed license text remains the canonical
[`OpenKline Source-Available Community License v0.1 (Proposed)`](../legal/openkline-source-available-license-proposal.md).
Its definitions are internally aligned with the owner policy for Free
Application, Publicly Available Source Code, Consumer Application, Hosted
Application/SaaS, Voluntary Donation, Advertising, Paid Feature, Subscription
Access, Redistribution, and Modification/Derivative Work.

Phase 5.4 adds a focused [counsel review package](../legal/counsel-review-package.md)
and a [post-approval adoption procedure](../legal/license-adoption-procedure.md).
They centralize, rather than replace, the existing examples, compatibility
analysis, ownership checklist, and third-party inventory. The historical
Apache proposal remains unadopted. No root `LICENSE`, `NOTICE`, package
`license` field, tag, GitHub release, or npm publication was changed.

## Ownership review

At baseline commit `7d878462c071b03d9347657f5f24c811ec6baca5`, Git history had
46 commits and one author identity: `Akira Yuzai <yuzai.akira@gmail.com>`.
The review found no tracked CLA, DCO sign-off, assignment, contributor license
agreement, or contributor register. The tracked asset scan found no fonts,
media, WASM, icons, or copied third-party source; the repository contains
TypeScript, Markdown, tests, and plain examples.

This evidence is insufficient to establish chain of title. Git metadata does
not prove copyright ownership, authority to license, employee/contractor
rights, assignment, ownership of prior work, or absence of untracked material.
Written owner/contributor/employer/contractor/provenance confirmation remains
required. The detailed evidence table and required records are in the counsel
package and [ownership checklist](../legal/ownership-and-approval-checklist.md).

## Third-party notice obligations

The existing generated inventory records 68 lockfile/workspace entries. The
root and React candidate packages have no runtime or bundled dependencies; the
private Next.js example has a separate dependency tree, including CC-BY and
LGPL-related metadata. Metadata is not a substitute for reviewing actual
license texts and notices. The owner/legal reviewer must decide whether the
example is distributed, verify the provenance of all included material, and
approve only accurate notice content before adding `NOTICE` or attribution
files.

## Compatibility review

| Situation | Review result | Status |
| --- | --- | --- |
| MIT / Apache-2.0 consumer applications | May be possible only when the full application meets the custom conditions and retains notices; no blanket compatibility conclusion. | Counsel review required |
| GPL / AGPL consumer applications | Potential additional-restriction conflict when works are combined or derivative; no GPL/AGPL compatibility is claimed. | Counsel review or separate written license required |
| SaaS / hosted use | Required server and deployment source must be public; frontend-only disclosure is insufficient; other policy conditions remain. | Definition/scope review required |
| Browser-distributed JavaScript | Public human-preferred source, build instructions, notices, and required service source remain necessary; minified output alone is insufficient. | Counsel notice/source-timing review required |
| Modified distributions | Applicable license/notices, modification notice, and public modification source are required by the proposal. | Derivative-work/source-offer mechanics require counsel review |
| Company-maintained free applications | Unrelated company revenue alone is permitted; product-tied consideration remains restricted. | Facts and arrangements require review |
| Donations / sponsorship | Benefit-free voluntary donations may qualify; sponsorship or acknowledgements may be advertising or consideration. | Counsel decision required |

The source-availability condition differs materially from formal OSI licensing.
An application may make its source public without being OSI Open Source, and
its own OSI-approved license does not automatically make a combination with
OpenKline permitted. The full preliminary analysis is in
[`license-compatibility-analysis.md`](../legal/license-compatibility-analysis.md).

## Remaining legal questions and approvals

The following are open and must be decided by the authorized owner and
qualified counsel:

1. Chain of title, authorized holder, exact Work scope, contributor and
   employment/contractor rights.
2. Whether the license conditions should apply to every Consumer Application
   that uses the Work or only to a narrower derivative/distribution boundary.
3. Exact source-publication mechanics; treatment of services, support, data,
   sponsorship, grants, affiliate arrangements, employer-funded access, and
   non-cash donor benefits.
4. Patent, trademark, jurisdiction, warranty, liability, termination/cure,
   consumer-law, and commercial-exception language.
5. Permissive/copyleft compatibility disclosures and exceptions process.
6. Actual third-party texts/notices, asset provenance, and scope of example
   distribution.

No automated check or repository review replaces these approvals.

## Exact adoption checklist after clearance

After written owner authorization and counsel clearance, follow the
[adoption procedure](../legal/license-adoption-procedure.md): freeze the final
text; add the approved root `LICENSE`; update package metadata accurately
without inventing an SPDX identifier; apply verified copyright and third-party
notices; update public documentation; rebuild and inspect packages; regenerate
inventory and SHA-256 evidence; run all local release gates; record the
effective commit; commit/push with the required identity; and obtain a
separate publication decision. None of these adoption actions was performed by
Phase 5.4.

## Verification and alpha publication readiness

`NPM_CONFIG_CACHE=/tmp/openkline-npm-cache npm run release:check` was run after
the Phase 5.4 documentation changes. It passed typechecking; all 48 Node unit
and integration tests; the six-test local system-Chromium diagnostic; model,
KlineScript, Canvas2D, and plugin/workspace benchmarks; inventory validation;
root and Next.js zero-advisory audits; package audit/contents/smoke; independent
consumer preview smoke; `npm publish --dry-run` without publication; the Next.js
production build; and repository validation including the new legal/report
paths.

The required compatibility step exited non-zero only at the known browser
environment gate: three Mobile Chrome emulation tests passed using the explicit
local system Chromium configuration, while three Firefox tests could not launch
missing managed Firefox build 1555 and three WebKit plus three Mobile Safari
tests could not launch missing managed WebKit build 2370. No system Firefox or
Safari substitute, TLS bypass, or browser-gate reclassification was used. This
Phase does not alter runtime code or candidate package contents.

**Alpha publication readiness: not ready.** It remains blocked by written
license/ownership/counsel approval, third-party notice review, an explicit
owner publication authorization, and the previously documented managed-browser
compatibility evidence. No npm package, release tag, GitHub release, or
repository-visibility change is authorized.

## Git verification

Implementation commit `0fc9270` (`docs(legal): prepare adoption review
package`) used author and committer `Akira Yuzai <yuzai.akira@gmail.com>` and
was pushed immediately to `origin/work` after the successful local check. The
follow-on evidence-only documentation update is committed and pushed separately.
No force-push, history rewrite, GitHub Actions workflow, tag, release, or
publication is part of this phase.
