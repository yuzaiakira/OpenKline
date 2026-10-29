# Phase 8.8.19 Release Decision Matrix

Status: **REQUIRES OWNER APPROVAL** — no scope is selected by this document.  
Product source SHA under review: `bb3f1cad028b126920fa26a75f7ec158ebc56e3c`  
Packages: `openkline@0.1.0`, `@openkline/react@0.1.0` (candidates only)  
Effective license: **not activated**  
Publication: **not authorized**

**Historical note (do not treat as rewrite of Phase 8.8.19 outcomes):** On
2026-10-29 the owner later recorded `APPROVED: CORE_AND_REACT_ONLY`. Current
gate statuses live in `docs/reports/phase-8-8-21-release-gate-matrix.md`. The
body below remains the Phase 8.8.19 snapshot when scope was still unset.

Agreement that the software is technically strong ≠ permission to publish.

## Non-executable owner form

| Field | Value to complete |
| --- | --- |
| Exact product source SHA | `bb3f1cad028b126920fa26a75f7ec158ebc56e3c` (or newer verified SHA) |
| Package names | `openkline`, `@openkline/react` |
| Candidate version | e.g. `0.1.0-alpha.1` — **unset** |
| Registry / channel | npm / GitHub Packages / private — **unset** |
| Effective license requirement | Counsel-approved text + metadata — **open** |
| Third-party notices | Scope + verified NOTICE — **open / BLOCKED** |
| Tested support matrix | Managed five-browser PASS; physical/AT/visual open — disclose |
| Known limitations | Emulation ≠ device; no formal a11y claim; custom license proposal |
| Rollback responsibility | Named owner — **unset** |
| Security / API stability | 0.x may change; KlineScript/plugin trust model disclosed |
| Owner acceptance signature / date | **blank** |
| Publication authorization | **blank — default DENY** |

## Scope options

### 1. Internal development only

| Must be approved before proceeding | Minimum |
| --- | --- |
| Effective public LICENSE | Not required for purely private use, but ownership still matters internally |
| Notices | As needed for internal redistribution policy |
| Managed browser PASS | Already PASS for `bb3f1ca` |
| Physical devices / AT / visual | Optional; disclose if claiming otherwise |
| npm / tags / Releases | **Forbidden** |

**Tradeoff:** Lowest legal/publication risk; no external users.

### 2. Private technical preview

| Must be approved before proceeding | Minimum |
| --- | --- |
| Written invitee list and NDA/terms if any | Owner |
| License grant to recipients | Counsel + owner (even private previews need clear terms) |
| Notices for shipped artifacts | If tarballs shared |
| Support matrix disclosure | Emulation vs device; a11y limits |
| npm public publish | Still **Forbidden** unless separately authorized |
| Tags / GitHub Releases | Owner-only if used as private markers — default avoid |

**Tradeoff:** Feedback channel without public Open Source claims.

### 3. Public alpha candidate

| Must be approved before proceeding | Minimum |
| --- | --- |
| Effective LICENSE + package metadata | **Required** |
| Third-party NOTICE for distributed scope | **Required** |
| Explicit support matrix | Managed browsers PASS; physical **BLOCKED/NOT TESTED** unless closed |
| Accessibility claims | None unless formal review done |
| Visual baseline | Owner decision recorded |
| Version + changelog + rollback owner | Required |
| npm publish / tags / Releases | Only after signed publication authorization |

**Tradeoff:** Public visibility; custom license must be explained as source-available, not OSI.

### 4. Future stable release

| Must be approved before proceeding | Minimum |
| --- | --- |
| All public-alpha requirements | Required |
| Physical Android and/or revised policy excluding them | Owner |
| Native iOS Safari and/or revised policy | Owner |
| Formal a11y posture | Owner |
| API stability statement | Owner |
| Complete release-gates matrix | PASS or explicitly waived in writing |

**Tradeoff:** Highest bar; do not schedule from this phase.

## Gate statuses (independent)

| Gate | Status |
| --- | --- |
| Automated managed-browser compatibility | **PASS** |
| Effective license | **REQUIRES OWNER APPROVAL** |
| Third-party notices | **BLOCKED** |
| Visual baseline | **REQUIRES OWNER APPROVAL** |
| Formal accessibility / screen reader | **NOT TESTED** |
| Physical Android | **BLOCKED** |
| Native iOS Safari | **BLOCKED** |
| Release authorization | **REQUIRES OWNER APPROVAL** |
| Overall | **NOT RELEASE READY** |

## Explicit prohibitions

- No npm publish
- No git tags or GitHub Releases from this phase
- No repository-visibility change
- No LICENSE/NOTICE activation without recorded approvals
- No interpreting Phase 8.8.17 200/200 as publication rights
