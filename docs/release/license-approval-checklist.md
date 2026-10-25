# License approval checklist

Status: **Pending owner/legal approval.** Apache-2.0 remains a preferred
candidate, not an active project license. This checklist records the exact
decision and evidence required before changing any package metadata.

## Owner/legal confirmation

- Confirm the legal owner has authority to license all project-authored files.
- Confirm every contributor has granted the needed rights and that employment,
  contractor, assignment, and historical contribution obligations are settled.
- Confirm no untracked or historical material carries incompatible terms.
- Confirm the desired scope: core package, React package, examples,
  documentation, and generated build output.
- Confirm Apache License 2.0, including its patent grant and termination terms,
  is acceptable for the intended distribution. This is a legal decision, not a
  conclusion from this repository audit.

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

1. Rename `LICENSE-APACHE-2.0.PROPOSED` to root `LICENSE` without editing its
   official Apache-2.0 text.
2. Add `"license": "Apache-2.0"` to `package.json` and
   `packages/react/package.json` only if both packages are approved.
3. Add copyright/SPDX notices only as directed by the owner/legal reviewer.
4. Add verified notices, regenerate the inventory, run package/consumer checks,
   and review packed contents.
5. Record the written approval, commit SHA, release version, and reviewed
   notices in the release report before any publication request.

Until every item above is complete, the preview tarballs are local review
artifacts only and must not be represented as Apache-2.0-licensed releases.
