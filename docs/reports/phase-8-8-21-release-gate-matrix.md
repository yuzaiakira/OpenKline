# Phase 8.8.21 Release Gate Matrix

**Product source:** `bb3f1cad028b126920fa26a75f7ec158ebc56e3c`  
**Review branch:** `docs/phase-8-8-21-distribution-scope`  
**Overall:** **NOT RELEASE READY**

Vocabulary: PASS | FAIL | BLOCKED | NOT TESTED | REQUIRES OWNER APPROVAL | PENDING REVIEW  
Scope exclusions are explained in notes (not invented gate enums).

| Gate | Status | Evidence / notes |
| --- | --- | --- |
| Owner distribution scope | **APPROVED** — `CORE_AND_REACT_ONLY` | Owner instruction 2026-10-29; `phase-8-8-21-distribution-scope-decision.md` |
| Package boundary verification | **PASS** | `package:audit`, `package:portability`, `package:smoke`, `distribution:check`, `studio:check`; pack filelists |
| Example-only CC-BY/LGPL obligations (`caniuse-lite`, `sharp`, `@img/sharp-libvips-*`) | **OUT OF APPROVED PACKAGE SCOPE** (verified) | Not in either tarball; inventory `shippedInRootPackage: false`; still relevant if Studio redistributed later |
| Project license | **REQUIRES OWNER/COUNSEL APPROVAL** | Proposal only; not activated |
| Copyright authority | **REQUIRES OWNER/COUNSEL APPROVAL** | Ownership checklist |
| Effective NOTICE and package metadata | **PENDING REVIEW** | No NOTICE invented; license fields remain absent |
| Automated browser compatibility | **PASS** for exact source `bb3f1ca` | Prior Phase 8.8.17 200/200; `evidence:browser:check` PASS; matrices not re-run |
| API compatibility | **PASS** | `api:check` this phase |
| Visual owner approval | **NOT REVIEWED** | Phase 8.8.20 visual record unchanged |
| Screen reader / formal accessibility | **NOT TESTED** / pending owner decision | Orca absent; no formal target adopted |
| Physical Android | **BLOCKED** | No authorized device |
| Native iOS Safari | **BLOCKED** | No authorized device |
| Publication authorization | **NOT AUTHORIZED** | Scope ≠ publish |
| Overall release readiness | **NOT RELEASE READY** | Mandatory legal + publication gates open |

## Checks executed this phase

| Command | Result |
| --- | --- |
| `npm run package:audit` | pass (`licenseStatus: pending-owner-approval`) |
| `npm run package:portability` | pass |
| `npm run package:smoke` | pass (core ESM consumer) |
| `npm run distribution:check` | PASS |
| `npm run api:check` | PASS |
| `npm run evidence:browser:check` | PASS |
| `node scripts/validate-license-inventory.mjs` | pass (68 entries) |
| `npm run studio:check` | pass |

## Prohibitions (unchanged)

No npm publish, tags, GitHub Releases, visibility changes, LICENSE/NOTICE activation, or inferred publication approval from this scope decision.
