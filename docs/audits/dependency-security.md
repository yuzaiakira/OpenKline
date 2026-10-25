# Dependency and supply-chain security audit

Audit date: 2026-10-25 (UTC)

Status: **Verified locally for the tracked dependency trees; stable release
approval remains blocked by licensing and browser gates.** This is a bounded
repository audit, not a guarantee that future transitive releases are safe.

## Lockfiles and installation

- The root `package-lock.json` uses lockfile version 3 and contains 12
  development entries. The published core has no runtime dependencies.
- The private Next.js example lockfile uses lockfile version 3 and contains 54
  external entries plus two local workspace entries (`openkline` and
  `@openkline/react`).
- Every external `node_modules` entry currently has a resolved registry URL and
  an integrity hash. Local workspace entries intentionally have neither.
- `npm ci --dry-run` passes at the root. The example passes
  `npm ci --ignore-scripts --no-audit --no-fund`.
- Neither lockfile currently records an `hasInstallScript` package. Release
  checks still use `--ignore-scripts` for deterministic package verification.
- `node scripts/validate-license-inventory.mjs` compares both lockfiles with
  `docs/audits/license-inventory.json` and fails on stale provenance or counts.

## Vulnerability results

The root command below returned zero advisories at the audit date:

```text
NPM_CONFIG_CACHE=/tmp/openkline-npm-cache npm audit --json --include=dev
```

The example initially reported one high and one moderate advisory through the
Next.js 15.5.28/PostCSS 8.4.31 tree. npm offered a fix only through the major
Next.js 16 line. The private example was upgraded to Next.js 16.4.3, which
resolves PostCSS to 8.5.23. The same audit command in the example now returns
zero advisories, and a clean install plus production build pass.

This major-version change is intentionally limited to the private example. Its
custom webpack alias is retained explicitly with `next build --webpack`; the
Next.js 16 build was run successfully after the change. No core runtime API or
dependency was changed as part of this remediation.

## Scope and limitations

- The root package's runtime dependency surface is empty. Its 12 packages are
  build/test/type dependencies and are not shipped in the root tarball.
- The Next.js dependency tree is an example/consumer tree and is not included
  in the root tarball. Its sharp/libvips LGPL metadata and other third-party
  license obligations remain part of the separate license review.
- A manual repository scan found no credentials, binary assets, copied vendor
  source, or install-time download code in the tracked runtime. This is not a
  substitute for a complete secret scanner or source-provenance review.
- License metadata and npm advisories are evidence for review, not legal
  conclusions. See the license inventory and pending project-license proposal.
- No GitHub Actions or remote CI execution is used.

## Recheck procedure

Run from a clean checkout with the intended npm version:

```bash
NPM_CONFIG_CACHE=/tmp/openkline-npm-cache npm ci --ignore-scripts --no-audit --no-fund
NPM_CONFIG_CACHE=/tmp/openkline-npm-cache npm audit --json --include=dev
node scripts/validate-license-inventory.mjs
cd examples/nextjs-app-router
NPM_CONFIG_CACHE=/tmp/openkline-npm-cache npm ci --ignore-scripts --no-audit --no-fund
NPM_CONFIG_CACHE=/tmp/openkline-npm-cache npm audit --json --include=dev
npm run build
```

## Phase 5.2 reproducibility recheck

The package artifact audit (`npm run package:audit`) verifies that the root and
React archives have no runtime or bundled dependency tree. The preview-candidate
verification starts from fresh temporary installs of staged tarballs and exact
lockfile versions for React, TypeScript, and Next.js; it does not import source
files or use the monorepo's bundler aliases. It passed locally with the current
lockfiles.

The local candidate still has no approved project license and is not eligible
for publication. Unauthenticated npm name queries returned `404` for
`openkline` and `@openkline/react` on the audit date; this is not a reservation
or a supply-chain ownership decision.
