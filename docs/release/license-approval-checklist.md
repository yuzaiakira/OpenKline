# License approval checklist

Status: **Pending owner/legal approval.** The owner-confirmed policy is a
custom source-available proposal, not an active project license. This checklist
records the exact decision and evidence required before changing any package
metadata. It is not an OSI-approved Open Source license.

## Owner/legal confirmation

- Confirm the legal owner has authority to license all project-authored files.
- Confirm every contributor has granted the needed rights and that employment,
  contractor, assignment, and historical contribution obligations are settled.
- Confirm no untracked or historical material carries incompatible terms.
- Confirm the desired scope: core package, React package, examples,
  documentation, and generated build output.
- Confirm that qualified counsel has approved the custom proposed text,
  definitions, restrictions, enforceability, patent/trademark position, and
  separate commercial-exception process. This is a legal decision, not a
  conclusion from this repository audit.
- Confirm how Consumer Applications using OSI-approved licenses may be
  described and which combinations require a separate written license. See
  `docs/legal/license-compatibility-analysis.md`.

## Third-party and attribution review

- Review actual license text and notice requirements for every dependency that
  will be redistributed, rather than relying only on package SPDX metadata.
- Determine whether the private Next.js example will be distributed. If so,
  review its CC-BY-4.0 and LGPL-related sharp/libvips metadata and required
  notices separately from the dependency-free root runtime package.
- Confirm no third-party fonts, icons, images, media, WASM, vendored source, or
  external code is missing from the inventory.
- Create `NOTICE` only after its contents are verified; do not fabricate one.

## Activation after written approval

1. Record the signed owner/counsel approval in
   `docs/legal/ownership-and-approval-checklist.md` or an owner-controlled
   record.
2. Add only the counsel-approved final license text at root `LICENSE`; do not
   activate the superseded `LICENSE-APACHE-2.0.PROPOSED` file.
3. Add package license metadata only with counsel-approved values. Do not
   invent an SPDX identifier for a custom license.
4. Add copyright/SPDX notices only as directed by the owner/legal reviewer.
5. Add verified notices, regenerate the inventory, run package/consumer checks,
   and review packed contents.
6. Record the written approval, commit SHA, release version, consumer-license
   disclosure, and reviewed notices in the release report before any
   publication request.

Until every item above is complete, the preview tarballs are local review
artifacts only and must not be represented as licensed public releases.
