# Phase 16.4.5 public API baseline adoption record

Status: **ADOPTED for additive-only strict-gate recovery**

This record authorizes rewriting `docs/audits/public-api-baseline.json` to the
current public surface after Phase 16.4.5 engineering review. It does **not**
authorize Public Widget API publication, npm release, license activation, or
tags.

Previous dossier: `docs/reviews/public-api-owner-review-phase-15-5-2.md`
(historical baseline `3e7a889a94c40255bbcce210a672856cfc98b32b`).

## Gate evidence before adoption

| Command | Result |
| --- | --- |
| `npm run api:diagnostics` | `PASS_ADDITIVE_REVIEW_REQUIRED` — zero removals / incompatible member changes |
| `npm run api:check` | FAIL on `Chart`, `WorkspaceDocument`, `WorkspaceRestoreOptions` hashes only |

## Adopted additive contracts

Exact historical-versus-current declarations remain those documented in the
Phase 15.5.2 dossier:

1. `Chart` — 46 additive methods; no historical method signature changes.
2. `WorkspaceDocument` — six additive optional members.
3. `WorkspaceRestoreOptions` — one additive optional `tradingCalendarResolver`.

Root inventory also includes additive exports accumulated since the historical
baseline. Diagnostics report no removed or changed existing root exports.

## Compatibility statement

- Existing TypeScript callers remain type-compatible without migration.
- Legacy workspace documents remain valid; new optional fields are omitted unless configured.
- `tradingCalendarResolver` is host-supplied and never serializes executable schedule state.
- This adoption refreshes the **strict hash baseline** only; it is not a
  stability, support, or release guarantee for every additive surface.

## Explicit non-approvals

| Topic | Status |
| --- | --- |
| Public `@openkline/widget` | NOT AUTHORIZED |
| npm publication / GitHub release / tags | NOT AUTHORIZED |
| License metadata activation | NOT AUTHORIZED |
| Breaking public API changes | NOT AUTHORIZED |

## Procedure executed in Phase 16.4.5

```bash
npm run build
npm run api:diagnostics
npm run api:inventory -- --write-baseline
npm run api:check
```

After these commands succeed, `docs/audits/public-api-baseline.json` records
the adopting commit as `baselineCommit`.
