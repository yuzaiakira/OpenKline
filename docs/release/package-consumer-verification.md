# Package and consumer verification

Status: **Local package checks pass; publication remains blocked**

OpenKline is checked as an installed package, not only through repository source
imports. The root package is ESM/type-only at its public entry and has no
runtime dependencies. `@openkline/react` is separate and uses peer
dependencies. The Next.js Studio remains a private reference consumer.

## Local checks

```bash
npm run api:check
npm run package:portability
npm run package:check
npm run package:smoke
node scripts/consumer-preview-smoke.mjs
npm run distribution:check
```

The checks cover:

- packed ESM import and TypeScript declarations;
- direct local data and custom Datafeed consumption;
- Worker entry artifacts;
- Vanilla ESM and TypeScript/React consumers;
- Next.js App Router typecheck and production build;
- no root runtime dependency or provider-specific code leakage;
- package contents that exclude source, tests, scripts, examples, and private
  Studio files.

`docs/audits/distribution-check.json` records the current dry-run package
contents and integrity data. It is a local review artifact, not a registry
publication or release artifact.

## Known boundaries

CommonJS, every bundler, every framework, physical devices, and every browser
engine are not claimed. The package still has no effective license metadata
while owner/legal approval is pending. Third-party notices and redistribution
rights require the existing legal review; no notice or license was invented by
this check.
