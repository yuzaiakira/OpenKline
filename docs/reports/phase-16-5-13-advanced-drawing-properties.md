# Phase 16.5.13 — Advanced Drawing Properties & Object Tree Organization

## 1. Executive summary

Phase 16.5.13 delivers roadmap-backed advanced Drawing Properties in Studio:
contextual fill color, text color, and real DrawingEngine z-index layer actions
(Bring Forward / Backward / Front / Back). Controls are capability-gated by
drawing type. Panel-local ownership, dirty-state, Save/Restore, and Replay
read-only policy are preserved. WebKit remains BLOCKED. Phase 7.5.1 remains OPEN.

## 2. Starting repository state

- Branch: `main`
- Starting HEAD: `1a9b8ae396441cc91d4878e87e82bb70bdc1be53`
- `origin/main`: `d35e6720dbd39471f04832e5137feb901406cb61` (local ahead by 7)
- Working tree clean

## 3. Roadmap review

Phases 16.5.0 / 16.5.1 deferred fill/text color and z-index editors after basic
color/width/visibility/lock. That gap remained unfinished and is selected here.

## 4. Selected feature scope

- Capability-aware Drawing Properties: fill + text color where the renderer uses them.
- Object Tree layer organization via Chart `setDrawingZIndex` (engine semantics).
- Unit + Chromium Studio E2E coverage; Firefox regression on related workflows.
- Non-goals: decorative CSS z-index, unsupported style fields, Public Widget API.

## 5–6. DrawingEngine capabilities and matrix

| Drawing type | color | fillColor | textColor | lineWidth | layer (zIndex) |
|---|---|---|---|---|---|
| trend/ray/extended/H/V lines | yes | no | no | yes | yes |
| parallel-channel | yes | no | no | yes | yes |
| rectangle | yes | yes | no | yes | yes |
| fibonacci retrace/extend | yes | no | yes (labels) | yes | yes |
| price-range / date-range | yes | yes | yes | yes | yes |
| long/short position | yes | yes | yes (labels) | yes | yes |
| text | yes | no | yes | yes | yes |

Existing UI already had color, width, visible, lock. This phase adds fill, text,
and layer actions only where supported.

## 7. Implemented style controls

- Fill color (`aria-label="Drawing fill color"`) for fill-capable types.
- Text color (`aria-label="Drawing text color"`) for text/label types.
- Color helpers normalize `#rgb` / `#rrggbb` / `#rrggbbaa` for color inputs.
- Patches merge through `applyScopedDrawingStyle` → `Chart.setDrawingStyle`.

## 8–9. Object Tree and layer order

Layer buttons call `resolveStudioDrawingLayerZIndex` then
`applyScopedDrawingZIndex` → `Chart.setDrawingZIndex`. Higher zIndex renders
and hit-tests later. Locked drawings ignore layer changes. Object Tree order
follows `getDrawings()` sorted by zIndex. No CSS stacking hacks.

## 10. Active-panel ownership

Scoped helpers reject stale-panel, missing-chart, missing-drawing, and
selection-mismatch. Matching IDs across panels remain independent.

## 11. Validation

Invalid color values are ignored by Studio controls. Non-finite zIndex is
rejected by the engine. Unsupported controls are not rendered.

## 12–13. Workspace and dirty-state

Fill/text/layer mutations mark dirty. Selection alone does not. Save/Restore
preserves style and zIndex in drawing documents (version 1).

## 14. Undo/Redo and Replay

Engine history records zIndex/style mutations. Property and layer controls stay
read-only during Replay.

## 15. Desktop and mobile

Desktop Object Tree hosts advanced controls. Mobile active-panel contract
preserved; narrow E2E verifies fill/text context after panel switch.

## 16. Accessibility

Labeled color/layer controls; layer actions use descriptive `aria-label`s.
Formal WCAG/AT remain OPEN.

## 17. Performance and lifecycle

No Chart remounts for property edits. Existing selection/event paths reused.

## 18–19. Tests

- `tests/studio-drawing-properties.test.ts`
- Chromium E2E: `Studio advanced Drawing Properties…`

## 20. Firefox / WebKit

Firefox focused Studio subset (ownership, dirty-state, Explorer, Drawing
Toolbar, quarantine, advanced properties): **6/6 PASS**. WebKit/Mobile Safari:
**BLOCKED** — host ICU is 78 (Playwright WebKit wants ICU74/flite); Docker
daemon unavailable (`/var/run/docker.sock` missing). No recovery campaign.

## 21. Standard regression

| Gate | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm test` | **457/457** PASS |
| `npm run api:check` | PASS (additive exports only) |
| `npm run studio:check` | PASS |
| `npm run package:smoke` | PASS |
| `npm run distribution:check` | PASS |
| `npm run stress:ci` | PASS |
| `npm run test:react:browser` | **78/78** PASS |
| `npm run test:browser` | **54 PASS / 4 skipped** |

## 22. API / security

Additive exports only (`setDrawingZIndex`, Studio property helpers). CSP and
KlineScript quarantine unchanged. Public Widget API not authorized.

## 23. Remaining roadmap gaps

WebKit/Mobile Safari execution; formal AT/physical devices; next Phase 7/8
product capability beyond drawing-management polish.

## 24. Git delivery

- Starting HEAD: `1a9b8ae396441cc91d4878e87e82bb70bdc1be53`
- Local commits only. No push. No Cursor co-author attribution.
