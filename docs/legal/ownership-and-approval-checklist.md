# Proposed license ownership and approval checklist

Status: **Required before final adoption.** Completing this checklist does not
itself adopt the proposed license or authorize publication.

The repository evidence and precise questions prepared for this checklist are
in [`counsel-review-package.md`](./counsel-review-package.md). The controlled
steps after all approvals are in
[`license-adoption-procedure.md`](./license-adoption-procedure.md); neither
document supplies a missing owner or counsel approval.

## Copyright and authority

- [ ] Identify the authorized OpenKline copyright holder(s) and the exact work
  covered by the final license.
- [ ] Verify contributor, employee, contractor, assignment, and historical
  rights for all project-authored source, documentation, examples, and build
  output.
- [ ] Verify whether any patent rights are needed and decide the final patent
  grant/reservation language.
- [ ] Verify that no untracked, generated, vendored, copied, or historical
  material has incompatible terms or missing provenance.
- [ ] Decide trademark/name usage and whether a separate trademark policy is
  required.

## Policy and drafting review

- [ ] Have qualified counsel review the full proposed source-available text,
  definitions, termination, warranties, limitations, jurisdiction, and
  enforceability.
- [ ] Confirm that the definitions of Free Application, Publicly Available
  Source Code, Advertising, Voluntary Donation, SaaS, and Derivative Work
  express the owner's intended policy.
- [ ] Decide the treatment of internal use, consulting, support, hosting, data
  services, grants, sponsorships, affiliate relationships, and commercial
  exceptions.
- [ ] Review the OSI-license compatibility analysis and decide how consumer
  applications may describe their licensing status.
- [ ] Confirm that the final project is described as source-available, not
  OSI-approved Open Source, unless a separate adopted OSI license justifies a
  narrower claim.

## Third-party materials and distribution

- [ ] Review actual third-party license texts and notices for every artifact to
  be distributed, not only SPDX metadata.
- [ ] Decide whether the private Next.js example is distributed; if so, review
  its CC-BY and LGPL-related metadata/notice obligations separately.
- [ ] Confirm all assets, fonts, media, WASM, and vendored source origins, or
  document their exclusion.
- [ ] Prepare only verified `NOTICE` and attribution material.
- [ ] Rebuild and inspect packed core/React archives after the final license and
  notice changes.

## Adoption record

| Required record | Owner/counsel value |
| --- | --- |
| Final license text/version | Pending |
| Copyright holder and signing authority | Pending |
| Counsel review reference/date | Pending |
| Approved package scope and examples scope | Pending |
| Approved patent/trademark position | Pending |
| Third-party notices reviewed | Pending |
| Effective `LICENSE`/metadata change commit | Pending |
| Approved commercial-exception contact/process | Pending |

Only after every applicable approval is recorded may an authorized maintainer
add a root `LICENSE`, package metadata, notices, or release artifacts. That
future change must regenerate archives, hashes, inventory evidence, and release
verification; it is outside this proposal update.
