# OpenKline custom-license counsel review package

Status: **Prepared for owner and qualified legal-counsel review only.** This
package is not legal advice, an effective license grant, publication approval,
or evidence that a contributor owns copyright. It does not change the root
`LICENSE`, `NOTICE`, package metadata, release state, or distribution rights.

Review date: 2026-10-25 (Asia/Tehran)

## Package contents and proposed text

The complete proposed text is the canonical
[`OpenKline Source-Available Community License v0.1 (Proposed)`](./openkline-source-available-license-proposal.md).
It is included in this review package by that exact document reference to
avoid maintaining divergent copies. The reviewer should approve, revise, or
reject that complete text as a unit; a summary below does not replace any
provision of the draft.

The package also includes:

- [practical permitted, prohibited, and escalation examples](./licensing-policy-examples.md);
- [OSI-license interaction analysis](./license-compatibility-analysis.md);
- [ownership and approval checklist](./ownership-and-approval-checklist.md);
- [Phase 5.4 readiness report](../reports/phase-5-4-license-adoption-readiness.md);
- [post-approval adoption procedure](./license-adoption-procedure.md); and
- the [third-party inventory](../audits/license-inventory.md) and its generated
  JSON evidence.

The superseded Apache proposal and raw `LICENSE-APACHE-2.0.PROPOSED` are
historical records only. They are not an alternative license ready for
activation.

## Plain-language owner policy

The owner has confirmed this policy direction for a consuming application:

1. It must be completely free to every end user and must publish the required
   application source.
2. It must not have advertising, paid promotional placements, revenue-generating
   affiliate promotions, paid features, subscriptions, premium tiers, or paid
   access.
3. It may accept only genuinely voluntary donations: a donor receives no
   feature, priority, higher limit, access, status, support entitlement, or
   other product benefit.
4. It must comply with modification, redistribution, attribution, and notice
   obligations.
5. A company is not disqualified merely because of unrelated revenue. Revenue
   or consideration tied to the Consumer Application remains subject to the
   conditions above.
6. A use outside those conditions needs a separate written license from the
   authorized OpenKline copyright holder. No such exception has been offered
   or approved by this repository.

The policy is deliberately **source-available**, not an assertion that
OpenKline is OSI-approved Open Source. Public source availability is a policy
condition; it is not the same as the unconditional rights normally granted by
an OSI-approved license.

## Scenario review for counsel

| Scenario | Preliminary policy reading | Counsel question before reliance |
| --- | --- | --- |
| MIT- or Apache-2.0-licensed consumer application | Potentially possible only if the actual application meets every OpenKline condition and preserves applicable notices. The application cannot describe OpenKline as MIT/Apache-2.0 merely because its own code uses one of those licenses. | Whether the proposed whole-application conditions, downstream permissions, Apache patent terms, and notices can coexist for the particular combined work. |
| GPL- or AGPL-licensed consumer application | **Potentially incompatible** when OpenKline and copyleft code form a combined or derivative work. GPL-family terms can prohibit further recipient restrictions, while the proposal imposes application-wide source and monetization conditions. | Whether a given integration is separate, aggregated, or combined; whether a separate written OpenKline license is needed. No compatibility is asserted. |
| SaaS or other hosted application | It is a Consumer Application. Required server-side source, deployment instructions, and replacement configuration must be public; a public frontend alone is insufficient. It must also remain free and without ads, paid access, or paid benefits. | Scope of "required" service code, treatment of managed hosting, data feeds, support, moderation, and infrastructure that are not distributed to users. |
| Browser-distributed JavaScript | Browser use does not avoid the conditions. The human-preferred application source, build instructions, notices, and required service source must be public; minified output alone is not sufficient source. | Notice placement and the final definition of source correspondence, deployment timing, and third-party browser assets. |
| Modified OpenKline distribution | The modifier must retain applicable notices, identify modifications, provide the applicable license, and publicly provide source for distributed modifications. A modified component used in a Consumer Application still has the policy conditions. | Jurisdictional derivative-work scope, the source-offer mechanics, and cure/termination terms. |
| Company-maintained free application | Permitted in principle if it otherwise qualifies. The company's unrelated commercial activity alone is not disqualifying. | Whether any company service, employer-funded access, support, sponsorship, data arrangement, branding, or affiliate relationship is consideration tied to the application. |
| Donations and sponsorship | A donation is permitted only when it is optional and gives no product benefit. Sponsorship can be advertising, paid promotion, or consideration and is not presumed permissible. | Treatment of acknowledgements, logos, grants, tax receipts, public recognition, donor votes, non-cash benefits, and sponsor-funded operations. |

## Ownership and provenance evidence reviewed

This is a repository-evidence review, not a chain-of-title opinion:

| Evidence | Observation | Limitation / required follow-up |
| --- | --- | --- |
| Git history at `7d878462c071b03d9347657f5f24c811ec6baca5` | 46 commits, all authored by the one identity `Akira Yuzai <yuzai.akira@gmail.com>`. | Git author/committer fields neither identify the legal copyright holder nor prove authority, employment status, or assignment. |
| Contributor records | No CLA, DCO `Signed-off-by`, copyright assignment, contributor license agreement, or contributor register was found in the tracked repository or commit messages reviewed. | Obtain written contributor, employee, contractor, and prior-work confirmations; determine whether any employer owns or has rights in the work. |
| Repository-authored material | The documented review covers TypeScript, Markdown, tests, and plain examples. The tracked asset scan found no fonts, images, media, WASM, or copied third-party source. | A scan cannot prove original authorship or exclude untracked/historical material. Review provenance and rights for all files in the intended license scope. |
| Dependency and example inventory | The generated inventory has 68 lockfile/workspace entries. Root and React candidate packages have no runtime/bundled dependencies; the private Next.js example has a separate dependency tree with CC-BY/LGPL-related metadata. | Review actual third-party license texts and notices for every distributed artifact. Decide whether the example is distributed and what notices are required. |
| Existing project notices | No effective root `LICENSE`, `NOTICE`, `COPYING`, `PATENTS`, copyright statement, or package `license` field exists. | Counsel and owner must approve the final copyright holder, scope, notices, patent position, and accurate metadata before adoption. |

## Material questions requiring legal approval

The owner policy is recorded; these are drafting and legal-effect questions, not
new policy proposals:

1. Identify every copyright holder and authorized signer, including employer,
   contractor, assignment, prior-work, and contributor rights.
2. Confirm the final scope: core, React bindings, documentation, examples,
   generated output, tests, and any future packages.
3. Confirm whether regulating every Consumer Application that "uses" the Work
   is intended and enforceable, or whether the condition should attach to a
   narrower modification/derivative-work/distribution boundary.
4. Confirm the definitions of end user, required functionality, required
   source, consideration, Publicly Available Source Code, and the timing and
   mechanism for source publication.
5. Decide the treatment of paid support, hosting, data, APIs, grants,
   sponsorships, acknowledgements, affiliate programs, employer-funded access,
   and non-cash donor benefits.
6. Approve jurisdiction, governing law, consumer-law treatment, enforceability,
   termination/cure/reinstatement, warranty, limitation of liability,
   indemnity, export, patent, and trademark language.
7. Approve the compatibility/disclosure approach for permissive and copyleft
   consumer applications and the procedure and authority for written exceptions.
8. Review actual third-party texts, notice obligations, package contents, and
   provenance before any distribution.

## Required approval record

No row below is currently approved. Written approval should identify the
reviewer, authority, date, final document version/hash, and any approved
scope or exceptions.

| Decision | Required approver | Status |
| --- | --- | --- |
| Chain of title and authorized copyright holder | Owner with qualified counsel | Pending |
| Complete final license text and package scope | Authorized holder with qualified counsel | Pending |
| Patent, trademark, warranty, liability, governing-law, and termination terms | Authorized holder with qualified counsel | Pending |
| Permissive/copyleft and SaaS compatibility disclosures | Qualified counsel | Pending |
| Third-party license-text, notice, and asset-provenance review | Authorized owner/legal reviewer | Pending |
| Commercial-exception signer and written-record process | Authorized holder | Pending |
| Root `LICENSE`, package metadata, notices, documentation, and artifact changes | Authorized holder after counsel clearance | Pending |
| Separate alpha publication authorization | Project owner | Pending |

Until the applicable approvals are recorded, no person should rely on this
draft as permission to use, copy, redistribute, or publish OpenKline.
