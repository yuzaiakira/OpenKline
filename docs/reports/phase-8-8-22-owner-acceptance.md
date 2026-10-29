# Phase 8.8.22 Owner Acceptance

**Overall:** **NOT RELEASE READY**  
**Product source SHA:** `bb3f1cad028b126920fa26a75f7ec158ebc56e3c`  
**Distribution scope (prior):** `APPROVED: CORE_AND_REACT_ONLY`  
**Packages in scope:** `openkline`, `@openkline/react`  
**Review date:** 2026-10-29  
**Authority:** Owner instruction in the Phase 8.8.22 ChatGPT conversation

This report records only decisions actually supplied. It is not a license grant, copyright determination, or publication authorization.

## 1. Visual V1 / V2 / V3

Candidates remain the Phase 8.8.18 local Studio screenshots (SHA-256 re-verified in Phase 8.8.20/22 session). Capture engine: local Chromium diagnostic only — not Firefox/WebKit.

| ID | Candidate | Viewport | Theme | SHA-256 | Owner decision | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| V1 | `studio-dark.png` | 1280×900 | Dark | `0e7d12acdddf4b0aa95fad0932f694c2c6d349b9b69d4437a8926be93488267c` | **NOT REVIEWED** | Explicit owner status |
| V2 | `studio-light.png` | 1280×900 | Light | `6bdeebb0a45793993c15dff416f3a0221230a885b6d9f0a9633a11cf2c021eed` | **NOT REVIEWED** | Explicit owner status |
| V3 | `studio-mobile.png` | 390×844 | Narrow | `1ff2c2178afd25d31c39968af6f2414a9895f78a0a9057bd49b400fec24a0b98` | **NOT REVIEWED** | Explicit owner status |

No visual baselines were approved. No new screenshots generated. No product visual defects recorded this phase.

## 2. Release-scope applicability

| Class | Finding |
| --- | --- |
| A. Distributed library artifacts | License, copyright authority, package/API gates, and managed-browser evidence for the engine apply to any licensed `CORE_AND_REACT_ONLY` redistribution |
| B. Private Next.js Studio | Studio UI screenshots document a non-distributed reference app |
| C. Stable 1.0 | Physical-device, visual, accessibility, and full support claims remain mandatory for Stable 1.0 unless separately revised later |
| D. Prior owner policy | Custom source-available policy direction and `CORE_AND_REACT_ONLY` scope preserved; license not activated |

## 3. Explicit owner-approved policy decision

**Decision string:**

```text
APPROVE POLICY: STUDIO_VISUAL_NOT_REQUIRED_FOR_LIBRARY_PREVIEW
```

**Meaning (owner-supplied):**

- Scope: `CORE_AND_REACT_ONLY`
- Private Next.js Studio visual baselines (V1–V3) are **not mandatory** for a **library-only developer preview**, because Studio is excluded from approved distribution artifacts
- All existing **Stable 1.0** requirements are **preserved**, including physical-device, visual, and accessibility gates
- Does **not** authorize public distribution, license activation, npm publishing, GitHub Releases, or any change to copyright ownership

**Not approved / not inferred:** legal clearance; publication; LICENSE/NOTICE activation; Stable 1.0 gate removals; V1–V3 visual APPROVE.

## 4. Copyright-owner statements

**None supplied.** Owner directed that copyright ownership and contributor/employment rights remain pending factual confirmation and qualified legal review. No answers were inferred from Git metadata or conversation.

## 5. Questions still requiring legal review

- Copyright holder and signing authority for `openkline` / `@openkline/react`
- Employer / contractor / contributor / assignment rights
- Final counsel-approved license text (custom source-available proposal remains inactive)
- Patent / trademark position
- Project copyright/attribution notices and any required package metadata
- Whether any NOTICE is still required for the two packages despite empty runtime third-party bundles
- Separate publication authorization (registry, version, tag, Releases)

## 6. Remaining mandatory gates — `CORE_AND_REACT_ONLY` developer preview

These are the blockers specifically for a library-only developer preview of the two packages (Studio visual V1–V3 **not** required per §3). Stable 1.0 gates are listed only as **preserved**, not closed.

| Gate | Status for library-only developer preview |
| --- | --- |
| Distribution scope | **APPROVED** — `CORE_AND_REACT_ONLY` |
| Package boundary verification | **PASS** (Phase 8.8.21) |
| Studio visual V1–V3 | **Not required for this preview** (policy §3); candidates remain **NOT REVIEWED** |
| Project license (effective) | **REQUIRES OWNER/COUNSEL APPROVAL** — mandatory |
| Copyright / contributor authority | **REQUIRES OWNER/COUNSEL APPROVAL** — mandatory |
| NOTICE / npm license metadata | **PENDING REVIEW** — mandatory before licensed redistribute |
| Automated managed-browser evidence (`bb3f1ca`) | **PASS** (200/200 prior; not re-run) |
| Preview support-matrix / limitation disclosures acceptance | **REQUIRES OWNER APPROVAL** (alpha notes / security / 0.x API) |
| Publication authorization (npm / tags / Releases / visibility) | **NOT AUTHORIZED** — mandatory separate decision |
| Physical Android / native iOS / formal a11y / Studio visual | **Preserved for Stable 1.0**; not closed; may be disclosed as unverified for preview only after owner accepts the preview support matrix — **do not claim device/a11y conformance** |

## 7. Recommended smallest next action

Obtain **copyright-holder / authority statements** and advance them to **qualified counsel** with the existing core/React counsel checklist — then counsel-approved license wording for the two packages. Do not publish or activate LICENSE until those close.

**Product code:** unchanged. **200/200 browser baseline:** intact / not re-run.
