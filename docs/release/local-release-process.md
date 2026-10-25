# Local release process

This is a dry-run and verification process. It does not publish packages,
create tags, invoke GitHub Actions, or change release criteria.

## Prerequisites

- Node.js compatible with the repository toolchain (Node 20 or newer is
  recommended; record the exact version).
- npm with the tracked lockfiles and network access only to the configured
  package registry and official Playwright artifact sources.
- The exact Playwright-managed browser artifacts for every browser project that
  is being claimed as verified.

Use a task-local cache when reproducing this audit:

```bash
export NPM_CONFIG_CACHE=/tmp/openkline-npm-cache
```

Do not disable TLS verification, substitute system browsers, or use arbitrary
browser binaries.

## Verification sequence

From the repository root:

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npm test
npm run test:browser
npm run benchmark:klinescript
npm run benchmark:browser
node scripts/validate-license-inventory.mjs
npm audit --json --include=dev
npm run package:check
npm run package:smoke
node scripts/consumer-preview-smoke.mjs
npm publish --dry-run --ignore-scripts
```

Then verify the private production example:

```bash
cd examples/nextjs-app-router
npm ci --ignore-scripts --no-audit --no-fund
npm audit --json --include=dev
npm run build
cd ../..
```

The full local gate combines these checks and the official compatibility
projects:

```bash
npm run release:check
```

It is expected to exit non-zero while Firefox, WebKit, or Mobile Safari
artifacts are unavailable. That status is a release blocker, not a passing
compatibility result.

## Package and source-control handoff

Inspect `npm pack --dry-run --json` and confirm that only intended build output
and documentation are included. Do not publish while the project license is
pending. Before each authorized commit, run the relevant checks, use
Conventional Commits, and configure both author and committer as:

```text
Akira Yuzai <yuzai.akira@gmail.com>
```

Push each successful commit immediately without force-pushing, then verify the
remote branch points to the pushed commit. Publication and tagging require a
separate explicit owner authorization.
