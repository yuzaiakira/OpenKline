# Phase 8.8.21 Distribution Scope Decision

**Overall:** scope recorded only — **NOT RELEASE READY**  
**Browser-verified product source:** `bb3f1cad028b126920fa26a75f7ec158ebc56e3c`  
**Decision date:** 2026-10-29  
**Authority:** Owner instruction in the current ChatGPT conversation (Phase 8.8.21)

## Exact approved decision string

```text
APPROVED: CORE_AND_REACT_ONLY
```

This is an **owner-provided distribution-scope instruction**. It is **not**:

- a signed legal approval
- a copyright-ownership determination
- an effective license grant
- authorization to publish, tag, release, or change repository visibility
- authorization to activate `LICENSE`, `NOTICE`, or npm `license` metadata

## Selected packages (in proposed distribution scope)

| Package | npm name | Role |
| --- | --- | --- |
| Standalone core | `openkline` | Framework-independent chart engine |
| React bindings | `@openkline/react` | React peer-dependent bindings |

## Explicit exclusions

- Private Next.js Studio example (`examples/nextjs-app-router`) — **excluded** from distributable package artifacts
- Studio remains in the development repository (not deleted)
- Studio tests, demonstrations, and internal tooling — **retained** in-repo, **not** packaged as publish candidates under this scope
- Studio/example lockfile dependencies are **not** in scope merely because they exist in the monorepo

## Approval limitations

| Authorized by this decision | Not authorized |
| --- | --- |
| Record proposed publish candidates as core + React only | npm publish |
| Reclassify example-only third-party notice review relative to package artifacts | Git tags / GitHub Releases |
| Proceed with package-boundary verification for those two packages | Repository visibility changes |
| | Effective LICENSE / NOTICE / license metadata activation |
| | Public redistribution of source archives |

## Remaining legal conditions (still open)

1. Copyright holder and authority confirmation  
2. Contributor / employer / contractor rights  
3. Counsel-approved final license text for the two packages  
4. Patent and trademark provisions  
5. Project copyright / attribution notices and any genuine bundled-code notices  
6. Accurate npm license metadata (post-approval only)  
7. Separate **publication authorization**

Redistribution authorization remains **pending** those conditions even though package scope is selected.

## Historical note

Phase 8.8.20 reports correctly recorded distribution scope as pending at that time and are **not** rewritten.
