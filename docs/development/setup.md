# Local Development

## Requirements

- Node.js 24 or a compatible modern LTS release
- npm 11 (pnpm is also available in the cloud environment)

## Install and verify

```bash
npm ci
npm run typecheck
npm test
```

`npm test` performs a TypeScript build and executes the compiled Node test
suite. The current suite validates data contracts, coordinate transforms, and
viewport behavior. Browser interaction tests are not yet part of this milestone.

## View the example

Build the package, then serve the repository root with any static HTTP server
and open `examples/vanilla/index.html`. The example imports the compiled ESM
entry point from `dist/src/index.js`.

## Repository policy

Keep source, tests, and documentation changes together. Run the local checks
before each commit. This project does not use GitHub Actions.
