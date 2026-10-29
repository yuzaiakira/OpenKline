# Phase 8.8.20 Decision Status

Verified product source: `bb3f1cad028b126920fa26a75f7ec158ebc56e3c`  
Review branch: `docs/phase-8-8-20-decision-closure`  
Overall: **NOT RELEASE READY**

## Owner decisions actually recorded this phase

| Decision | Recorded value | Date / reference |
| --- | --- | --- |
| Distribution scope | **none** — awaiting explicit owner choice | — |
| Visual candidates V1–V3 | **NOT REVIEWED** | — |
| Accessibility formal target | **none** | — |
| AT tooling install authorization | **none** (Orca still absent) | — |
| Device-testing authorization | **none** (no device attached) | — |
| License activation | **not requested / not performed** | — |
| Publication | **not authorized** | — |

No inferred approvals.

## Decisions that can be made now (owner)

1. **Distribution scope** — `APPROVED: CORE_AND_REACT_ONLY` | `APPROVED: INCLUDE_STUDIO` | `DEFERRED` | `REJECTED`
2. Visual APPROVE / REJECT / CHANGES REQUESTED for each existing candidate
3. Accessibility review target (none disclosed vs WCAG 2.2 AA reference vs other)
4. Permission to install assistive-technology tooling (e.g. Orca)
5. Authorization to run physical Android / native iOS sessions when hardware exists

## Decisions requiring external evidence

- Counsel-approved final license wording
- Copyright authority confirmation
- Third-party redistribution obligations if Studio is in scope
- Version-matched libvips `COPYING` for vips `8.18.7` (npm package does not ship it; upstream tag fetch failed)
- Physical iOS Safari access

## Decisions prohibited until mandatory gates close

- Effective LICENSE / NOTICE / npm `license` metadata activation
- Public package publication, tags, GitHub Releases, visibility changes
- Public redistribution of archives

## Completed this phase (new work only)

- Branch opened from Phase 8.8.19 readiness tip
- Visual SHA-256 re-verified; local review index still present
- Keyboard workflow smoke extended (drawing, watchlist dialog, alerts, paper, replay, backtest, screener, optimizer, canvas summary)
- Local legal materials collected for counsel (caniuse LICENSE, sharp LICENSE, sharp-libvips README + versions, generic LGPL-3.0 text) — **not** an effective NOTICE
- Confirmed: no Android device; no Orca; no product source changes; full browser matrices **not** re-run
- Deliverables written: `phase-8-8-20-decision-status.md`, `phase-8-8-20-legal-open-items.md`, `phase-8-8-20-visual-approval-record.md`, `phase-8-8-20-accessibility-device-results.md`, `phase-8-8-20-final-gate-matrix.md`

## Next owner action (first)

Record one explicit distribution-scope decision string:

`APPROVED: CORE_AND_REACT_ONLY` | `APPROVED: INCLUDE_STUDIO` | `DEFERRED` | `REJECTED`
