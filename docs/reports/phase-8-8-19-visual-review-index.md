# Phase 8.8.19 Visual Candidate Review Index

Status: all owner decisions **NOT REVIEWED**  
Product SHA: `bb3f1cad028b126920fa26a75f7ec158ebc56e3c`  
Binaries: local trusted host only (not committed to git)

Local folder (trusted machine):
`OpenKline-browser-verification/phase-8-8-18-visual-candidates/`  
Open `OWNER-REVIEW-INDEX.html` from that folder for previews.

## Candidates

| ID | File | Theme / layout | Viewport | DPR | Locale/TZ | Browser (recorded) | SHA-256 | Fixture | Owner decision |
| --- | --- | --- | ---: | ---: | --- | --- | --- | --- | --- |
| V1 | `studio-dark.png` | Dark desktop | 1280×900 | 1 | en-US / UTC | Chromium 155.0.8059.79 (local diagnostic) | `0e7d12acdddf4b0aa95fad0932f694c2c6d349b9b69d4437a8926be93488267c` | Deterministic Studio demo | **NOT REVIEWED** |
| V2 | `studio-light.png` | Light desktop | 1280×900 | 1 | en-US / UTC | Chromium 155.0.8059.79 | `6bdeebb0a45793993c15dff416f3a0221230a885b6d9f0a9633a11cf2c021eed` | Deterministic Studio demo | **NOT REVIEWED** |
| V3 | `studio-mobile.png` | Narrow / mobile | 390×844 | 1 | en-US / UTC | Chromium 155.0.8059.79 | `1ff2c2178afd25d31c39968af6f2414a9895f78a0a9057bd49b400fec24a0b98` | Deterministic Studio demo | **NOT REVIEWED** |

Allowed decision values: `APPROVE` | `REJECT` | `CHANGES REQUESTED` | `NOT REVIEWED`

Byte equality / `SCREENSHOT GENERATED` ≠ approval.

Managed Firefox/WebKit visual candidates: **NOT TESTED** in Phase 8.8.18/19.

## Visual issue register

| ID | Observation | Confirmed product defect? | Severity | Notes |
| --- | --- | --- | --- | --- |
| VI-1 | Studio UI is extremely dense (many controls) | No — design density observation | Info | Reviewer may request spacing changes; not treated as FAIL without owner criteria |
| VI-2 | Light vs dark candidates differ in average luminance (~113 vs ~32 sample) | No | Info | Confirms theme switch produced distinct captures |
| VI-3 | Narrow layout remains long-scrolling expert UI | No — unless owner sets mobile simplification criteria | Info | Touch-target formal review still needs physical device |

No new confirmed visual product defect filed in Phase 8.8.19.
