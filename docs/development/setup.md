# Local Development

## Requirements

- Node.js 24 or a compatible modern LTS release
- npm 11 (pnpm is also available in the cloud environment)

## Install and verify

```bash
npm ci
npm run typecheck
npm test
npm run test:browser
npm run benchmark
npm run package:check
```

`npm test` performs separate core/adapter and test builds, then executes the
compiled Node test suite. Browser interactions, benchmarks, and package
contents have their own explicit commands; see [testing.md](testing.md).

## View the example

Build the package, then serve the repository root with any static HTTP server
and open `examples/vanilla/index.html`. The example imports the compiled ESM
entry point from `dist/src/index.js`.

To verify the App Router integration:

```bash
cd examples/nextjs-app-router
NPM_CONFIG_CACHE=/tmp/openkline-npm-cache npm ci --ignore-scripts --no-audit --no-fund
npm run build
```

The example uses the local packages for repository development; published
applications should depend on `openkline` and `@openkline/react` from their
package registry.

## Repository policy

Keep source, tests, and documentation changes together. Run the local checks
before each commit. This project does not use GitHub Actions.
