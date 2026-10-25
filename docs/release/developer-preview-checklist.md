# Developer-preview candidate checklist

Candidate: `0.1.0-alpha.1` (local review artifact only)

## Build and package

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npm test
npm run package:audit
npm run package:smoke
node scripts/preview-candidate.mjs prepare \
  --output artifacts/developer-preview/0.1.0-alpha.1-REVIEW-ID
```

`npm run preview:prepare` builds two tarballs below the ignored
`artifacts/developer-preview/` directory and writes `manifest.json` with
package names, source/candidate versions, contents, and SHA-256 hashes. Use a
new output directory for every rebuilt candidate; the script refuses to
overwrite an existing manifest. It never publishes, tags, or modifies tracked
package versions.

## Independent consumption

Run on a machine with either the official managed Chromium or an explicitly
identified local Chromium diagnostic override:

```bash
OPENKLINE_CHROMIUM_EXECUTABLE_PATH=/path/to/chromium npm run preview:verify
```

The verification creates a fresh temporary install from only the generated
tarballs and tests Vanilla ESM datafeed/indicator/drawing/plugin/KlineScript
flows, TypeScript declarations, React SSR import, Next.js App Router build,
and an installed-package browser chart that loads history, streams a candle,
creates all supported series, oscillator panes, indicators, custom plugin
resources, KlineScript, workspace state, appearance changes, and destruction.
The local override is reported as such and does not clear the managed
cross-browser acceptance gate.

## Owner approval before publication

- Complete [license approval](./license-approval-checklist.md) and add an
  effective license/metadata only after written approval.
- Review required notices and third-party obligations.
- Verify or explicitly disclose outstanding browser limitations.
- Confirm npm package names, version availability, release notes, support
  boundary, and rollback/deprecation policy at the time of publication.
- Obtain explicit owner authorization for the exact packages, version, tag,
  registry, and access level.

Do not run `npm publish`, create a tag, create a GitHub release, change
repository visibility, or publish cloud settings from this checklist.
