# Proposed custom-license adoption procedure

Status: **Post-approval procedure only. Do not perform these steps yet.** The
current project has no effective root software license, package `license`
metadata, public package publication, tag, or GitHub release authorization.
This procedure does not grant any of them.

## Preconditions

An authorized maintainer may begin this procedure only after retaining all of
the following written records:

1. The authorized copyright holder and scope of the Work, including core,
   React bindings, examples, documentation, and generated artifacts where
   applicable.
2. Qualified legal-counsel clearance for a complete final license text, its
   jurisdictional terms, patent/trademark position, compatibility disclosures,
   and commercial-exception authority.
3. Ownership/provenance clearance for contributors, employees, contractors,
   assignments, historical material, assets, and any intended redistribution.
4. Review of actual third-party license texts and notice obligations for each
   artifact to be distributed, including a separate decision about the private
   Next.js example.
5. A separate written owner decision covering any alpha publication. License
   adoption alone does not authorize npm publication, a release tag, a GitHub
   release, repository visibility changes, or distribution.

Record references, date, signer authority, final-text version/hash, scope, and
approved exceptions in
[`ownership-and-approval-checklist.md`](./ownership-and-approval-checklist.md)
or an owner-controlled record linked from it.

## Controlled adoption steps

Perform the following only after the preconditions are complete, in a reviewable
commit sequence:

1. **Freeze the approved text.** Preserve the counsel-approved final document
   and its version/hash. Do not activate the superseded raw
   `LICENSE-APACHE-2.0.PROPOSED` material.
2. **Add the effective root license.** Add root `LICENSE` with precisely the
   counsel-approved custom text and copyright holder/scope. Do not add a
   guessed SPDX identifier or alter the text after approval without renewed
   review.
3. **Set package metadata accurately.** Update root and React package metadata
   only with the counsel-approved license expression/reference and scope. A
   custom license must not be represented as an OSI-approved SPDX identifier
   merely for tooling convenience.
4. **Apply verified copyright and notice material.** Add copyright headers,
   `NOTICE`, third-party attributions, and any package-included license copies
   only where the owner/legal review confirms their exact content. Do not
   fabricate a notice or copy third-party text without verifying it.
5. **Update public documentation.** Update README, package documentation,
   source-availability instructions, compatibility disclosures, commercial
   exception contact/process, and examples to match the final approved scope.
   State that source-available is not an OSI-approved claim unless a separate
   adopted license justifies such a claim.
6. **Regenerate distribution evidence.** Rebuild packages; regenerate the
   license inventory; inspect each packed archive; verify included licenses,
   notices, manifests, exports, and absence of unintended files; then generate
   and independently verify SHA-256 hashes for every release artifact. Retire
   any earlier candidate manifest whose packed contents changed.
7. **Run the full local gate.** Run the documented local type, unit,
   integration, package-consumer, dependency-audit, archive, browser-diagnostic,
   benchmark, Next.js production, and managed-browser compatibility checks.
   Keep Firefox, WebKit, and Mobile Safari acceptance open if their
   Playwright-managed runs remain unavailable; do not substitute a system
   browser or reinterpret a blocked gate as passing.
8. **Record review and release evidence.** Record the final text hash, holder,
   notice review, inventory version, archive hashes, verification commands and
   results, unresolved compatibility/browser limits, and effective commit SHA.
9. **Commit and synchronize.** Use a Conventional Commit with author and
   committer `Akira Yuzai <yuzai.akira@gmail.com>`, push without force, and
   verify the remote contains the commit. This still does not authorize
   publication.
10. **Seek the distinct publication decision.** Only an explicit owner approval
    for the registry, package names/versions, access, tag, release notes,
    destination, and rollback plan may authorize a subsequent publication
    action.

## Stop conditions

Stop and return to counsel/owner review if final terms differ from the approved
text; chain-of-title or asset provenance is unresolved; a notice cannot be
verified; metadata needs an invented SPDX value; a compatibility issue appears;
packed contents differ unexpectedly; or a required release gate fails. Do not
publish, tag, create a GitHub release, or change repository visibility while a
stop condition remains.
