# Local release check

Run:

```bash
npm run release:check
```

The command runs type checking, Node tests, Chromium tests, KlineScript and
Canvas2D benchmarks, package checks and smoke consumption, the Next.js
production example, independent Vanilla/TypeScript/React consumption,
documentation/package/license validation, dependency audits, and the Firefox,
WebKit, Mobile Chrome, and Mobile Safari compatibility projects. It never
publishes a package and never uses GitHub Actions.

The compatibility projects require the exact Playwright-managed browser
artifacts for the repository's `@playwright/test` version. If those artifacts
are unavailable, the command exits non-zero and reports the gate as blocked.
Do not replace them with system browsers or disable TLS verification. The
Phase 2/4 reports preserve the current blocked state and the supported
artifact acquisition procedure.

The repository intentionally has no effective `LICENSE` yet. The
owner-confirmed custom source-available policy remains a counsel-review
proposal and is not a license grant or OSI-approved Open Source license. The
project owner and qualified counsel must adopt final terms before a public
release. See `docs/legal/README.md`. The machine-readable dependency inventory
is validated against both lockfiles on every release-check run.
