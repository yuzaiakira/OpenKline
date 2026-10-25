# Contributing to OpenKline

OpenKline is developed and verified locally. Please preserve the framework-
independent core and keep public API changes documented.

## Local workflow

1. Install the pinned dependency tree with `npm ci`.
2. Run `npm run typecheck` and the focused tests for your change.
3. Run `npm test`, `npm run test:browser`, and the relevant package or example
   checks before opening a change.
4. Update the relevant API, architecture, and verification documentation.
5. Use a Conventional Commit subject. Do not add GitHub Actions.

The repository's project commits use:

```text
Akira Yuzai <yuzai.akira@gmail.com>
```

Do not commit credentials, generated dependency directories, or proprietary
market data. Do not force-push or rewrite shared history.

## Scope and tests

The KlineScript interpreter is intentionally a restricted DSL. New language
features must include grammar, checker, runtime-limit, negative, and numerical
tests. Changes to trusted TypeScript plugins must not be described as adding
KlineScript sandboxing. Browser compatibility claims require the corresponding
Playwright project to run with its official managed browser.

Use `npm run release:check` for the complete local gate. If an environment
cannot launch a browser project, record that as blocked rather than replacing
it with an unapproved system browser.
