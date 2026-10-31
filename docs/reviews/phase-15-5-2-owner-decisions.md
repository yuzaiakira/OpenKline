# Phase 15.5.2 owner decisions and counsel handoff

Status: **REQUIRES OWNER APPROVAL**

This record separates decisions already supplied by the project owner from
decisions that remain open. It grants no license, publication permission,
release authorization, or API-baseline approval.

## Decisions preserved from the owner record

The following decisions remain unchanged and are not downgraded or expanded:

| Decision | Recorded value | Scope |
| --- | --- | --- |
| Distribution scope | **APPROVED: CORE_AND_REACT_ONLY** | openkline and @openkline/react; this is scope approval, not a license grant or publication authorization. |
| Studio visual requirement for library-only preview | **APPROVE POLICY: STUDIO_VISUAL_NOT_REQUIRED_FOR_LIBRARY_PREVIEW** | Private Studio V1–V3 visual baselines are not mandatory for the library-only preview. Stable 1.0 visual, accessibility, and physical-device gates remain preserved. |
| Effective license | Pending | The custom source-available proposal remains inactive until owner authority and qualified legal counsel approve adoption. |
| Public publication | Not authorized | No npm publication, tag, GitHub release, or public release action is authorized by this dossier. |

Source records:

- docs/reports/phase-8-8-22-owner-acceptance.md
- docs/reports/phase-8-8-21-distribution-scope-decision.md
- docs/release/owner-approval.md

## Engineering decisions requested from the owner

| Decision required | Current state | Evidence to review |
| --- | --- | --- |
| Approve the exact additive Chart methods | **REQUIRES OWNER APPROVAL** | docs/reviews/public-api-owner-review-phase-15-5-2.md; strict api:check remains open. |
| Approve six optional WorkspaceDocument fields | **REQUIRES OWNER APPROVAL** | Before/after declarations and serialization impact in the API dossier. |
| Approve tradingCalendarResolver | **REQUIRES OWNER APPROVAL** | Restore callback declaration and host-resolver responsibility in the API dossier. |
| Update the protected API baseline | **NOT AUTHORIZED** | Only after the preceding exact contract approval and a fresh diagnostics/check run. |
| Accept the alpha support matrix | **REQUIRES OWNER APPROVAL** | Current managed-browser run is blocked; system Chromium is diagnostic only; historical packs are source-scoped. |
| Accept current 0.x API instability and preview limitations | **REQUIRES OWNER APPROVAL** | Consumer-preview and release-gate reports; no production certification or financial-advice claim. |

## Legal and distribution decisions still open

The following items require a written decision by the authorized copyright owner
and, where legal interpretation is involved, qualified legal counsel:

- authority to license all project-authored source, documentation, examples,
  generated outputs, and historical contributions in the approved package scope;
- contributor, employer, contractor, assignment, patent, trademark, and
  third-party provenance review;
- final wording and adoption of the proposed custom source-available license;
  the proposal is not OSI-approved and is not the effective root license;
- compatibility disclosures for MIT, Apache-2.0, GPL, AGPL, and other
  consumer-application licenses, including whether a combined distribution or
  hosted use needs a separate written license;
- effective root LICENSE, SPDX/package metadata, copyright notices, and
  applicable third-party notices;
- package version, npm registry account/scope, access level, destination,
  release channel, tag, GitHub release, release-note text, and rollback owner;
- security disclosure contact, supported-version policy, and response process;
- whether any example, asset, branding, data, or private Studio material is
  excluded from the approved Core/React artifact scope.

No automated repository check is evidence of legal ownership or legal
compatibility. The existing legal proposal and counsel checklist remain the
authoritative pre-adoption materials.

## Consumer-preview boundary

Phase 15.5.1's consumer checks remain useful engineering evidence:

- deterministic Core and React tarballs were checked by package identity and
  version;
- normal npm peer resolution was exercised for React, React DOM, and
  TypeScript;
- the original isolated-cache ERESOLVE was classified accurately as
  Found: react@undefined; it was not bypassed with --force or
  --legacy-peer-deps;
- a warmed cache or an online pass does not prove that a fresh offline
  environment contains every required registry artifact;
- consumer checks do not activate the license, approve npm publication, or
  turn historical browser evidence into current evidence.

The owner-approved Core/React scope is preserved, while current alpha support
and authorization decisions remain open.

## Adoption gate after written approval

After explicit owner authorization and legal clearance only, the maintainer may
follow docs/legal/license-adoption-procedure.md to:

1. finalize the root license and verified copyright notices;
2. update npm metadata and applicable third-party notices;
3. regenerate and inspect Core/React package artifacts;
4. record SHA-256 manifests and run the complete local release checks; and
5. perform any separately authorized publication action.

Those steps are not executed by Phase 15.5.2.
