# Third-party license and attribution inventory

Audit date: 2026-10-25 (Asia/Tehran)

Status: **Inventory generated and reviewed for metadata; legal review and
project license selection remain open.** This inventory is evidence for review,
not a legal opinion and not a substitute for reviewing the license text and
notice obligations of each dependency.

The machine-readable source is
[`license-inventory.json`](./license-inventory.json). It is derived from the
tracked `package-lock.json` and
`examples/nextjs-app-router/package-lock.json` using
`node scripts/generate-license-inventory.mjs`.

## Repository-authored material

The repository contains TypeScript source, Markdown documentation, tests, and
plain HTML/JavaScript examples. The tracked asset scan found no fonts, icons,
images, audio, video, WASM, or copied media. No copied third-party source was
identified by the manual review. Git history currently contains one contributor
identity, `Akira Yuzai <yuzai.akira@gmail.com>`; author metadata is not by
itself proof of copyright ownership or assignment.

No root `LICENSE`, `NOTICE`, `COPYING`, or `PATENTS` file currently exists.
Apache-2.0 is a proposed candidate only; see
[`docs/legal/apache-2.0-proposal.md`](../legal/apache-2.0-proposal.md) and the
separate `LICENSE-APACHE-2.0.PROPOSED` file. No effective package license has
been asserted.

## Package scope

| Source | Entries | Role | Included in root `openkline` tarball |
| --- | ---: | --- | --- |
| `package-lock.json` | 12 | Root development/build/test tree | No; root package has no runtime dependencies |
| `examples/nextjs-app-router/package-lock.json` | 56 | Example consumer and Next.js production tree | No; example is private and separate |
| Root `package.json` | 0 production dependencies | Published core package candidate | The package itself is pending license approval |
| `packages/react/package.json` | Peer dependencies only | Separate React binding candidate | Not packed by root package; publication is not approved |

The root lockfile records SPDX-like metadata for all 12 entries:

- Apache-2.0: `@playwright/test`, `playwright`, `playwright-core`,
  `typescript`.
- MIT: `@types/node`, `@types/react`, `@types/react-dom`, `csstype`, `react`,
  `react-dom`, `scheduler`, `undici-types`.

The generated inventory currently contains 68 entries: 12 root development
entries, 54 external Next.js example entries, and two local workspace entries.
The Next.js example lockfile includes MIT, Apache-2.0, BSD-3-Clause, ISC,
0BSD, CC-BY-4.0, and LGPL-3.0-or-later metadata. The LGPL entries are
`@img/sharp-libvips-*`; combined metadata also appears for platform-specific
`@img/sharp-*` packages. They are part of the private example dependency tree,
not the root package tarball, but their redistribution and notice obligations
must be reviewed if the example is distributed.

The local `openkline` and `@openkline/react` file dependencies have no license
metadata and are marked `pending-project-license` in the machine-readable
inventory. They are project components, not third-party code.

## Evidence and obligations

Every registry package entry has a resolved npm registry tarball URL and an
integrity hash in the lockfile. The inventory records both fields. The package
manifest `license` fields are not treated as sufficient legal evidence; the
actual license text and required notices should be checked before a public
preview.

The root `npm pack --dry-run` result contained 142 files, all under `dist/`
plus the generated package manifest and README. It contained no dependency
tarballs, fonts, images, credentials, or `NOTICE`. No third-party notice is
invented here because the required notice contents have not been individually
verified.

## Open items

1. Obtain owner/legal confirmation of the project copyright and Apache-2.0
   suitability, or select another license.
2. Verify historical contributions, employment/assignment obligations, and
   any source or asset provenance not visible in the current tracked tree.
3. Review the actual license texts and notices for all dependencies intended
   for redistribution, especially `CC-BY-4.0` and LGPL-3.0-or-later packages
   in the private Next.js example tree.
4. Add only verified notices and package license metadata after approval.
5. Re-run the inventory and clean package checks before publishing a preview.
