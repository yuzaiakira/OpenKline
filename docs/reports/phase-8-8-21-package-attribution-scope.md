# Phase 8.8.21 Package Attribution Scope

**Product source:** `bb3f1cad028b126920fa26a75f7ec158ebc56e3c`  
**Owner scope:** `APPROVED: CORE_AND_REACT_ONLY` (2026-10-29)  
**This document is technical evidence, not legal advice and not an effective NOTICE.**

## Evidence sources

- `docs/reports/phase-8-8-19-attribution-review.md`
- `docs/reports/phase-8-8-20-legal-open-items.md`
- `docs/audits/license-inventory.json` (68 entries; validator PASS)
- `docs/audits/phase-8-8-21-npm-pack-filelists.json`
- `npm run package:audit` / `distribution:check` / `studio:check` (PASS this phase)

## Actual package artifact inspection

### `openkline@0.1.0`

| Check | Result |
| --- | --- |
| `npm pack --dry-run` files | **394** (`package.json`, `README.md`, `dist/**` only) |
| Package size / unpacked | 339631 / 1945873 bytes |
| Runtime `dependencies` | **none** |
| Bundled third-party binaries | **none** (no `.so`/`.dll`/`.wasm`/`.node`) |
| Next.js Studio app paths | **0** |
| `caniuse-lite` / `sharp` / `@img/sharp-libvips-*` paths | **0** |
| `node_modules/` in tarball | **0** |
| Tests / scripts / Playwright | **0** |
| Public ESM + types | `dist/src/index.js`, `dist/src/index.d.ts` present |
| Worker entrypoints | `dist/src/klinescript/worker.js`, `dist/src/screener/worker.js`, `dist/src/backtesting/worker.js` (+ related worker modules) |
| `dist/src/studio/*` | **16** library modules (workspace/watchlist/sync API) — **not** the Next.js Studio application |

### `@openkline/react@0.1.0`

| Check | Result |
| --- | --- |
| `npm pack --dry-run` files | **5** (`package.json`, `dist/index.js`, `dist/index.d.ts`, + maps) |
| Package size / unpacked | 6524 / 29359 bytes |
| Runtime `dependencies` | **none** |
| Peer dependencies (not bundled) | `openkline`, `react` |
| Next.js / sharp / caniuse / binaries | **0** |

Full sorted path lists: `docs/audits/phase-8-8-21-npm-pack-filelists.json`.

## Example-specific dependencies vs approved package scope

Inventory marks these as `scope: next-example-prod` and `shippedInRootPackage: false`. Artifact inspection confirms they are **not** present in either selected tarball.

| Dependency | License ID (inventory) | Classification under CORE_AND_REACT_ONLY |
| --- | --- | --- |
| `caniuse-lite` | CC-BY-4.0 | **OUT OF APPROVED PACKAGE DISTRIBUTION SCOPE** |
| `sharp` | Apache-2.0 | **OUT OF APPROVED PACKAGE DISTRIBUTION SCOPE** |
| `@img/sharp-libvips-*` | LGPL-3.0-or-later | **OUT OF APPROVED PACKAGE DISTRIBUTION SCOPE** |

**Not claimed:** globally license-cleared, or irrelevant if Studio is later redistributed. Missing libvips **8.18.7** `COPYING` remains an **unresolved example-only** evidence gap (see Phase 8.8.20), **not** a blocker for core/React packaging while Studio stays out of package artifacts.

## Third-party notice reassessment for selected packages

| Question | Status |
| --- | --- |
| Runtime third-party code bundled in core/React tarballs? | **None found** (VERIFIED TECHNICAL FACT) |
| Does that mean no NOTICE is needed? | **No automatic declaration** — project copyright, license grant, attribution, and counsel review of any genuine notices still required |
| Effective root `NOTICE` | **not created**; **PENDING REVIEW** with counsel/owner |
| Project packages `openkline` / `@openkline/react` license field | `null` — **REQUIRES OWNER/COUNSEL APPROVAL** before activation |

## Scope-limited conclusions

1. Under `APPROVED: CORE_AND_REACT_ONLY`, example CC-BY/LGPL obligations tied to Studio dependencies are **OUT OF APPROVED PACKAGE DISTRIBUTION SCOPE** for the verified pack contents.  
2. Package boundary verification supports treating Next.js Studio as excluded from both distributable archives.  
3. Core still ships first-party `dist/src/studio/*` library APIs; that is distinct from redistributing the private Next.js Studio app.  
4. Project license, copyright authority, and publication authorization remain mandatory blockers for any release.
