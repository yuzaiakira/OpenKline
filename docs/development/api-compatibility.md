# API compatibility workflow

Run the public API gates locally:

```bash
npm run api:inventory
npm run api:check
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
