# Phase 8.8.19 Attribution and Notice Review

Status: **BLOCKED for redistributed notices** until owner/counsel decide scope
and obtain required texts. This document is evidence for review, **not** legal
advice and **not** an effective NOTICE file.

Product baseline: `bb3f1cad028b126920fa26a75f7ec158ebc56e3c`  
Inventory source: `docs/audits/license-inventory.json` (68 entries)  
Validation: `node scripts/validate-license-inventory.mjs` (PASS in Phase 8.8.18/19 path)

## Distribution scopes

| Scope | What ships | Runtime third-party npm deps in archive |
| --- | --- | --- |
| 1. Standalone core `openkline` | Packed `dist/` only | **None** (`shippedInRootPackage` false for all inventory third parties; package audit shows 0 runtime deps) |
| 2. React `@openkline/react` | Packed React bindings | **None** runtime; peers `openkline`, `react` declared |
| 3. Private Next.js Studio example | Not in root npm tarball | Full Next/sharp/caniuse tree in example lockfile |
| 4. Documentation / assets | Markdown / proposed legal drafts | No tracked fonts/media/WASM in prior asset scans |

**Rule used:** a lockfile entry alone does **not** create a redistribution
obligation for the core package. Obligations attach when an artifact is
actually distributed.

## Project packages (pending project license)

| Package / asset | Version | License ID | Distribution scope | License text available | Notice obligations requiring review | Missing material | Owner/counsel decision |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| `openkline` | 0.1.0 | null / pending | Core publish candidate | No effective LICENSE | Project grant + copyright notice | Effective LICENSE + holder name | **REQUIRES OWNER APPROVAL** |
| `@openkline/react` | 0.1.0 | null / pending | React publish candidate | No effective LICENSE | Same | Same | **REQUIRES OWNER APPROVAL** |

## Previously flagged example dependencies

These are **`next-example-prod`** scope and `shippedInRootPackage: false`.

| Package / asset | Version | License ID | Distribution scope | License text available on this host | Notice / compliance notes | Missing material | Owner/counsel decision |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| `caniuse-lite` | 1.0.30001819 | CC-BY-4.0 | Only if Studio/example redistributed or if build artifacts embedding its data are published | **Yes** (`LICENSE` present under example `node_modules`) | CC-BY attribution if redistributed; confirm whether published Studio build embeds data requiring attribution | Confirm embed vs build-tool-only use | If example redistributed: review attribution text; else **N/A (exclude)** |
| `@img/sharp-libvips-linux-x64` (and sibling platform packages) | 1.3.4 | LGPL-3.0-or-later | Only if Studio redistributed **and** sharp/libvips binaries ship with it | **No** LICENSE/COPYING found beside package on this host | LGPL may require notices and corresponding source / written offer for linked binaries | **LICENSE text absent in installed package tree** → **BLOCKED** | Obtain upstream texts or exclude sharp from redistributed artifacts |
| `@img/sharp-wasm32` / win32 sharp variants | 0.35.5 | Apache-2.0 AND LGPL-3.0-or-later (+ MIT on wasm) | Example-only unless redistributed | Partial (sharp Apache text present; libvips LGPL text missing) | Dual-license notice accuracy | LGPL text | Same as above |
| `sharp` | 0.35.5 | Apache-2.0 | Example image pipeline | Yes | Apache notice if redistributed | — | Scope decision |
| `next` | 16.4.3 | MIT | Example framework | Yes (typical MIT) | Preserve copyright notices if redistributing | — | Scope decision |
| `string-hash` | (example tree) | CC0-1.0 | Example transitive | No dedicated LICENSE file found in quick scan | CC0 dedication recording | Text optional | Low priority if example excluded |
| `postcss-preset-env` | (example tree) | CC0-1.0 | Example build tooling | Text present in tree | Build-tool vs shipped | Confirm not shipped in static export | Scope decision |

## Root development dependencies

Root `package-lock.json` entries (TypeScript, Playwright, React types, etc.) are
**development-only** for building/testing OpenKline. They are not bundled into
the published core tarball per package audit. No separate NOTICE draft is
proposed for them in this phase.

## Required owner/counsel decisions

1. **Publish core+React only**, or include Studio/example redistribution.
2. If Studio is in scope: obtain and approve LGPL/CC-BY notice texts; decide
   LGPL corresponding-source strategy for libvips binaries.
3. Do **not** add a root `NOTICE` until texts are verified and approvals recorded.
4. After any LICENSE/NOTICE activation (future phase): regenerate packs,
   inventory, and release checks.

## Explicit non-claims

- No fabricated NOTICE content.
- No effective root NOTICE created by this phase.
- SPDX metadata ≠ reviewed license text.
- Inventory PASS ≠ redistribution clearance.
