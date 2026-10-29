# Phase 8.8.20 Final Gate Matrix

Verified product source: `bb3f1cad028b126920fa26a75f7ec158ebc56e3c`  
Review branch tip (pre-commit): derived from `6d95e700db7ef373a22fbba43bd4176d988722ef`  
Overall: **NOT RELEASE READY**

Status vocabulary: PASS | FAIL | BLOCKED | NOT TESTED | REQUIRES OWNER APPROVAL

| Gate | Status | Evidence | Approval / authority | Remaining blocker | Exact next action |
| --- | --- | --- | --- | --- | --- |
| Product behavioral baseline | PASS | Standalone 75/75 + Studio 125/125 @ `bb3f1ca` (Phase 8.8.17); matrices not re-run | QA evidence `qa/phase-8-8-17-browser-evidence` | None for this SHA | Keep product SHA frozen until defect-driven change |
| Cross-browser managed projects | PASS | Five Playwright projects recorded in 8.8.17 | Prior evidence | None for this SHA | Do not re-run without cause |
| Distribution scope | REQUIRES OWNER APPROVAL | Options A/B in decision packet / `phase-8-8-20-decision-status.md` | Owner only | No explicit scope string | Owner records one of four allowed decisions |
| Redistribution authorization | BLOCKED | Scope undecided | Owner | Pending scope | After scope + legal gates |
| Project license (effective) | REQUIRES OWNER APPROVAL | Proposal only; not activated | Owner + counsel | Not activated | Counsel-approved wording then owner activate |
| Copyright / contributor authority | REQUIRES OWNER APPROVAL | Ownership checklist | Owner + counsel | Unconfirmed | Confirm authority |
| Third-party NOTICE (effective) | BLOCKED | libvips COPYING 8.18.7 missing; scope pending | Counsel after materials | Missing artifact + scope | Obtain COPYING or exclude Studio (if Option A) then counsel |
| Attribution materials (local counsel pack) | PASS (collection only) | `phase-8-8-20-legal-materials` on trusted host | N/A | Not an effective NOTICE | Keep local; do not publish as NOTICE |
| Visual baseline integrity | PASS | SHA-256 match for V1–V3 | Engineering checksum | — | Owner review |
| Visual owner acceptance | REQUIRES OWNER APPROVAL | `phase-8-8-20-visual-approval-record.md` | Owner | All NOT REVIEWED | APPROVE/REJECT/CHANGES REQUESTED per file |
| Keyboard smoke (listed workflows) | PASS | `phase-8-8-20-accessibility-device-results.md` | Local QA | Not conformance | Optional deeper a11y after target set |
| Formal a11y target / WCAG claim | REQUIRES OWNER APPROVAL | No owner target adopted | Owner | No target | Adopt or defer target |
| Screen reader (Orca) | NOT TESTED | Orca absent; not installed | Owner install auth | Tooling | Authorize install or defer |
| Physical Android | BLOCKED | `adb devices` empty | Device + owner auth | No hardware | Attach authorized device |
| Native iOS Safari | BLOCKED | No device access | Device + owner auth | No hardware | Provide authorized Safari access |
| LICENSE / NOTICE / npm license activation | BLOCKED | Explicitly not performed | Owner + counsel | All legal gates | Prohibited until gates close |
| Public npm / tags / Releases / visibility | BLOCKED | Not authorized | Owner | All mandatory gates | Prohibited |
| New confirmed product defects (8.8.20) | PASS (none found) | No FAIL scenarios this phase | — | — | — |

## Mandatory release blockers (still open)

1. Explicit distribution-scope owner decision  
2. Effective project license + copyright authority (counsel + owner)  
3. Effective third-party NOTICE path (or Option A exclusion + remaining project license)  
4. Visual owner acceptance of candidates  
5. Physical Android and native iOS (if required for release policy) — currently BLOCKED  
6. Formal a11y target if claimed in release criteria  
7. Explicit publication authorization  

Until every mandatory gate and publication authorization is satisfied: **NOT RELEASE READY**.
