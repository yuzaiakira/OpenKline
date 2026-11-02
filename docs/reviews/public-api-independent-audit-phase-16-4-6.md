# Phase 16.4.6 independent public API compatibility audit

Status: **PASS (additive-only adoption remains consistent)**

This audit re-examines the Phase 16.4.5 baseline adoption without rewriting
`docs/audits/public-api-baseline.json`. Public Widget API publication remains
**NOT AUTHORIZED**.

## Inputs

| Artifact | Role |
| --- | --- |
| `docs/reviews/public-api-owner-review-phase-15-5-2.md` | Pre-adoption additive dossier |
| `docs/reviews/public-api-baseline-adoption-phase-16-4-5.md` | Adoption decision record |
| `docs/audits/public-api-baseline.json` | Current protected baseline |
| `npm run api:check` | Strict hash gate |
| `npm run api:diagnostics` | AST additive/breaking classification |

## Commands executed

```bash
npm run api:check
npm run api:diagnostics
```

## Findings

| Check | Result |
| --- | --- |
| Strict `api:check` | PASS — `removed: []`, `changed: []` |
| Diagnostics findings | Empty — no removals or incompatible member changes vs current baseline |
| Accidental Widget public exports | None — Widget remains absent from root/`package.json` exports |
| `Chart` / `WorkspaceDocument` / `WorkspaceRestoreOptions` | Match the additive contracts documented in 15.5.2 / 16.4.5 |
| Export-map / package smoke | Covered by `package:smoke` / `distribution:check` in the phase matrix |

## Conclusion

No evidence was found that the Phase 16.4.5 baseline rewrite concealed a
breaking contract change. The adopted surface remains additive relative to the
historical `3e7a889…` baseline described in the owner-review dossier. No second
baseline rewrite is warranted in Phase 16.4.6.

Residual risk: additive surface breadth is large; future phases must continue
to treat intentional removals/signature changes as hard failures and must not
blindly rewrite the baseline.
