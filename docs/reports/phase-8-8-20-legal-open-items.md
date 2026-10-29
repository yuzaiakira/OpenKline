# Phase 8.8.20 Legal Open Items

Verified product source: `bb3f1cad028b126920fa26a75f7ec158ebc56e3c`  
Policy draft: `docs/legal/openkline-source-available-license-proposal.md`  
Status: custom source-available proposal **not** effective; **not** OSI-approved.

This worksheet separates technical facts from decisions. It is **not** legal advice.

## Classification key

- **VERIFIED TECHNICAL FACT**
- **OWNER DECISION REQUIRED**
- **QUALIFIED COUNSEL REVIEW REQUIRED**
- **BLOCKED BY MISSING EVIDENCE**

## Worksheet

| Item | Class | Evidence / notes | Status |
| --- | --- | --- | --- |
| Copyright ownership & authority | OWNER + COUNSEL | `docs/legal/ownership-and-approval-checklist.md`; Git authors ≠ ownership | REQUIRES OWNER APPROVAL |
| Contributor / employer / contractor rights | COUNSEL + OWNER | Counsel review package | REQUIRES OWNER APPROVAL |
| Patent / trademark treatment | COUNSEL + OWNER | Proposal placeholders | REQUIRES OWNER APPROVAL |
| License scope (core / React / docs / examples) | OWNER DECISION REQUIRED | Tied to distribution-scope Option A vs B | REQUIRES OWNER APPROVAL |
| Required source disclosure (consumer apps) | COUNSEL | Proposal § Publicly Available Source Code | REQUIRES OWNER APPROVAL |
| Commercial exceptions process | OWNER + COUNSEL | Proposal + ownership checklist | REQUIRES OWNER APPROVAL |
| Compatibility limitations (GPL/AGPL/MIT/Apache apps) | COUNSEL | `docs/legal/license-compatibility-analysis.md` | REQUIRES OWNER APPROVAL |
| Redistribution terms | COUNSEL + OWNER | Proposal definitions | REQUIRES OWNER APPROVAL |
| Core/React runtime third-party bundling | VERIFIED TECHNICAL FACT | Inventory: `shippedInRootPackage` empty; package audit 0 runtime deps; notes say root deps are development-only | PASS (technical) |
| Effective LICENSE / npm license field | OWNER + COUNSEL; currently absent | `package.json` has no `license`; no root LICENSE | REQUIRES OWNER APPROVAL — **do not activate** |
| Third-party NOTICE (effective) | OWNER + COUNSEL | No root NOTICE; must not invent | BLOCKED until scope + texts + approval |
| `caniuse-lite` CC-BY-4.0 text | VERIFIED TECHNICAL FACT (example tree) | Installed LICENSE present; SHA-256 `fd3a263fe19ed8faa9068b43abaebafc02c77897b0c6fc09abc04bb592e5f16e`; local copy under trusted-host legal-materials | PASS text available; redistribution obligation depends on scope |
| `@img/sharp-libvips-*` LGPL metadata | VERIFIED TECHNICAL FACT | package.json license `LGPL-3.0-or-later`; vips `8.18.7`; npm `files` = `lib` + `versions.json` only | — |
| Version-matched libvips COPYING for 8.18.7 | BLOCKED BY MISSING EVIDENCE | Not in npm package; GitHub `v8.18.7/COPYING` 404; GitLab 403 | **BLOCKED** |
| sharp-libvips third-party license table | VERIFIED TECHNICAL FACT | Installed README Licensing section lists aom/cairo/glib/… terms | Review aid only |
| Generic GNU LGPL-3.0 text | VERIFIED TECHNICAL FACT (fetched) | `gnu-lgpl-3.0.txt` SHA-256 `e3a994d82e644b03a792a930f574002658412f62407f5fee083f2555c5f23118` — **not** a substitute for package-specific COPYING/NOTICE set | Review aid only |
| Studio example redistribution | OWNER DECISION REQUIRED | Option A excludes; Option B includes + amplifies LGPL/CC-BY review | Pending distribution decision |

## Scope interaction

| If owner chooses | Attribution consequence |
| --- | --- |
| `APPROVED: CORE_AND_REACT_ONLY` | Example-only CC-BY/LGPL rows reclassify as **out of published artifact scope**; project license for OpenKline itself still mandatory before any publish |
| `APPROVED: INCLUDE_STUDIO` | LGPL/CC-BY notice packaging remains **BLOCKED** until version-matched / complete notice materials and counsel approval exist |
| `DEFERRED` / `REJECTED` | No redistribution authorization |

## Explicit non-actions this phase

- No LICENSE activation
- No NOTICE activation
- No npm `license` metadata change
- No legal conclusions claimed
