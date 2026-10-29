# Phase 8.8.21 Counsel Checklist — Core and React Only

**Scope of this checklist:** packages `openkline` and `@openkline/react` only  
**Owner distribution scope:** `APPROVED: CORE_AND_REACT_ONLY` (2026-10-29)  
**Product source:** `bb3f1cad028b126920fa26a75f7ec158ebc56e3c`  
**Policy draft (not effective):** `docs/legal/openkline-source-available-license-proposal.md`  
**Status:** prepared for owner + qualified counsel — **not** legal advice; **not** an effective grant

## Preserved owner policy (source-available; not OSI Open Source)

- Free consumer applications  
- Required publicly accessible application source  
- No paid features or subscriptions  
- No advertising or paid promotion  
- Voluntary donations permitted without product benefits  
- Unrelated company revenue does not automatically disqualify use  
- Other use requires separate written permission  

The draft remains **not** an effective license grant and **not** OSI-approved Open Source.

## Open decisions (two selected packages)

| # | Decision | Class | Evidence links | Status |
| --- | ---: | --- | --- | --- |
| 1 | Copyright holder and authority | OWNER + COUNSEL | `docs/legal/ownership-and-approval-checklist.md`, `docs/legal/counsel-review-package.md` | REQUIRES OWNER/COUNSEL APPROVAL |
| 2 | Employer, contractor, contributor rights | OWNER + COUNSEL | Counsel review package; no CLA/DCO found historically | REQUIRES OWNER/COUNSEL APPROVAL |
| 3 | Final license text for both packages | COUNSEL + OWNER | Proposal + adoption procedure | REQUIRES OWNER/COUNSEL APPROVAL |
| 4 | Patent and trademark provisions | COUNSEL + OWNER | Proposal placeholders | REQUIRES OWNER/COUNSEL APPROVAL |
| 5 | Modifications and redistribution terms | COUNSEL + OWNER | Proposal definitions | REQUIRES OWNER/COUNSEL APPROVAL |
| 6 | Public source disclosure requirements (consumer apps) | COUNSEL | Proposal § Publicly Available Source Code | REQUIRES OWNER/COUNSEL APPROVAL |
| 7 | Compatibility limitations (MIT/Apache/GPL/AGPL consumers) | COUNSEL | `docs/legal/license-compatibility-analysis.md` | REQUIRES OWNER/COUNSEL APPROVAL |
| 8 | Copyright and attribution notices for project code | OWNER + COUNSEL | Package audit: no runtime third-party bundles | REQUIRES OWNER/COUNSEL APPROVAL |
| 9 | Accurate npm `license` metadata | OWNER + COUNSEL (post-approval) | Manifests currently omit `license` by design | REQUIRES OWNER/COUNSEL APPROVAL — **do not activate now** |
| 10 | Whether any third-party NOTICE is still required despite empty runtime deps | COUNSEL | `phase-8-8-21-package-attribution-scope.md` | PENDING REVIEW |

## Explicitly out of this checklist’s package scope

Studio example redistribution, `caniuse-lite` CC-BY packaging, and sharp/libvips LGPL corresponding-source packaging — **OUT OF APPROVED PACKAGE DISTRIBUTION SCOPE** for current pack contents. Reopen if Studio is later approved for distribution.

## Non-actions

- Do not activate `LICENSE`  
- Do not create an effective `NOTICE`  
- Do not add npm license metadata  
- Do not treat distribution-scope approval as legal clearance or publish authorization  
