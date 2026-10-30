# API compatibility workflow

Run the public API gates locally:

```bash
npm run api:inventory
npm run api:check
npm run api:diagnostics
```

The inventory command rebuilds the packages and records the current public
runtime/type exports and declaration signature hashes. The compatibility
command compares them with the committed baseline. A removed export or changed
exported declaration signature is a failure. New exports are additive evidence
and require documentation review, but are not automatically breaking.

The baseline is not regenerated casually. If an intentional public API change
is proposed, first document the old contract, replacement, migration impact,
and owner approval. Only then should the baseline be updated in the same
reviewed change. Do not use the baseline tool to hide an accidental break.

Independent package consumer checks remain required because declaration
surface comparison cannot prove runtime behavior. The public API contract suite
covers chart lifecycle, direct data, custom Datafeed, indicators, drawings,
plugins, Workers, events, disposal, and serialization.

## Explaining an intentional additive change

`npm run api:diagnostics` is a development-only TypeScript-AST comparison
against the commit recorded in `docs/audits/public-api-baseline.json`. It
explains strict hash changes as additive methods, optional interface members,
new exports, removed members, changed signatures, required-property additions,
or overload changes. It uses the existing TypeScript development dependency;
the published package does not load the diagnostic module.

The diagnostic result is not a replacement for `npm run api:check` and does
not rewrite the baseline. A result that contains only additive changes still
requires owner approval, a before/after review record, and a deliberate
baseline update. Required additions, removals, changed parameter/return types,
optional-to-required changes, changed property types, and removed overloads
remain compatibility failures.
