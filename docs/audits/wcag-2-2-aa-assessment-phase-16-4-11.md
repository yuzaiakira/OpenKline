# WCAG 2.2 Level AA Assessment — Phase 16.4.11

Builds on `docs/audits/wcag-2-2-aa-assessment-phase-16-4-10.md`.  
**Formal conformance claim:** **OPEN / NOT CLAIMED**.

## Engineering updates this phase

| Criterion | Prior | Now | Evidence |
| --- | --- | --- | --- |
| 2.4.11 Focus Not Obscured | PARTIAL | **PASS (automated Studio samples)** — Object Tree Hide + rename dialog field not center-obscured by author overlays at 1280×800 | `tests/react-browser/wcag-focus-resize-spacing.spec.ts` |
| 1.4.4 Resize text | PARTIAL / NOT fully certified | **PASS (CSS zoom chrome path)** — 200% `documentElement.style.zoom`; Candles pressed state + rename dialog operable. **Not** equivalent to browser page zoom or OS text size; canvas hit-testing under CSS zoom not claimed | same spec |
| 1.4.12 Text spacing | NOT TESTED | **PASS (automated override path)** — WCAG spacing CSS applied; Object Tree Hide/Show operable; no vertical smother among buttons | same spec |
| 1.4.3 dense panels | PARTIAL | **PASS (sampled locked/select under spacing)** — Select drawing-1 + Unlock drawing-1 text contrast ≥ 4.5 under spacing overrides | same spec |
| 1.4.11 / 2.4.7 / reflow | Prior PASS | Retained | Prior suites |

## Still OPEN / NOT TESTED

| Area | Status |
| --- | --- |
| NVDA / VoiceOver macOS / VoiceOver iOS / TalkBack | **NOT TESTED** |
| Physical Android / iOS | **NOT TESTED** |
| Browser page-zoom (vs CSS zoom) certification | Limitation documented |
| Sticky overlay + AT confirmation of 2.4.11 | Needs human AT |
| Formal WCAG 2.2 AA claim | **OPEN / NOT CLAIMED** |
