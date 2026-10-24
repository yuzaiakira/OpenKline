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
npm run benchmark:browser
npm run profile:browser
npm run package:check
npm run package:smoke
```

`npm test` performs separate core/adapter and test builds, then executes the
compiled Node test suite. Browser interactions, benchmarks, and package
contents have their own explicit commands; see [testing.md](testing.md).

## View the example

Run `npm run dev` and open
`http://127.0.0.1:4173/examples/vanilla/index.html`. The command builds the
package before serving it. `node scripts/serve-example.mjs` also performs a
build automatically when the compiled entry point is missing.

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
