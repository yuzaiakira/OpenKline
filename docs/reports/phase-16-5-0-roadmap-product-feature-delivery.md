# Phase 16.5.0 — Roadmap-Driven Product Development & Feature Delivery

## 1. Executive summary

Phase 16.5.0 resumes product development after the 16.4.x quality and
external-verification track. The selected increment delivers **Studio
contextual drawing property editing** — the explicit remaining Phase 7.5.1 gap
— as a complete vertical slice in the private Next.js Studio Object Tree.

Users can select a drawing and edit color, line width, visibility, and lock
through labeled controls that call existing Chart APIs (`setDrawingStyle`,
`selectDrawing`, `drawingSelection`). Changes persist via the normal workspace
save path. Automated unit and Chromium Studio browser evidence covers the
primary workflow.

**PUBLIC WIDGET API: NOT AUTHORIZED**  
**PUBLIC RELEASE: NOT AUTHORIZED**

## 2. Starting repository state

| Item | Value |
|---|---|
| Branch | `main` |
| Starting HEAD | `3bb120186e735acfa5ee5a99dae59cad6342774c` |
| Remote-tracking | `origin/main` at the same tip (in sync) |
| Backup ref | `refs/backup/phase-16-5-0-start` → starting HEAD |
| Working tree | Clean at phase start |

Abbreviated SHA note: historical `7b4117f` resolves to
`7b4117f6d8fc7d55b7591dfa559241a0142dcc12` (Phase 16.4.11 docs tip), ancestor of
`3bb1201`. No history rewrite was performed.

## 3. Roadmap findings

`docs/ROADMAP.md` Phase 7.5.1 listed **contextual drawing property editing** as
still required, while Indicator Explorer, drawing toolbar, Object Tree,
snapping, sync, and in-page dialogs were already implemented. The Widget host
already exposed a drawing-properties panel via `setDrawingStyle`; Studio did
not.

External AT/physical gates from Phase 16.4.12 remain blocked and were not
re-opened as a product phase.

## 4. Candidate feature comparison

| Candidate | User value | Readiness | Effort | API risk | Selected |
|---|---|---|---|---|---|
| Studio contextual drawing properties (7.5.1) | High — completes Object Tree edit loop | Core APIs + Widget reference exist | Bounded Studio UI + tests | None (internal Studio) | **Yes** |
| Broader drawing/sync E2E matrix (7.5.1 remainder) | Medium | Mostly coverage, not new capability | Large | Low | No — verification campaign |
| Workspace import/storage evidence (7.5.1) | Medium | Persistence already works | Evidence-heavy | Low | No — not a user feature slice |
| Multi-chart performance/memory (7.5.1) | Medium | Benchmarks exist | Measurement campaign | Low | No — not product delivery |

## 5. Selected feature and rationale

**Selected feature:** Studio Object Tree — Drawing properties panel.

**Why:** Explicit roadmap gap; Widget already proved the Chart contract; Studio
users could hide/lock but not edit style contextually; no unauthorized public
API change required; fully testable in the current environment.

**Expected user-visible improvement:** After selecting a drawing, edit color,
width, visibility, and lock from the Object Tree without leaving Studio.

**Implementation scope:** Panel snapshot selection plumbing; Drawing properties
UI + CSS; `applyDrawingStyle` → `Chart.setDrawingStyle`; Clear selection;
unit + Chromium Studio browser tests; docs/roadmap.

**Explicit non-goals:** Public Widget API publication; new drawing tool types;
fill/text color advanced editors; formal WCAG/AT/physical claims; release tags.

**Acceptance criteria:**

1. Selecting a drawing shows contextual property controls.
2. Color, width, visible, and locked updates apply through Chart APIs.
3. Workspace save retains style changes.
4. Clear selection returns the empty-state copy.
5. Automated unit + Studio browser evidence exists.
6. No public API / CSP / unauthorized export changes.

## 6. User-facing behavior

- Object Tree includes a **Drawing properties** region.
- Empty state: prompt to select a drawing.
- Selected state: type + id, color, line width (1–8), Visible, Locked, Clear
  selection.
- Drawing rows expose `data-drawing-selected` and `aria-current` when selected.
- Controls disable while replay is active (structural mutation policy).
- Status notice confirms successful style updates.

## 7. Implementation architecture

```
Chart.selectDrawing / drawingSelection
        ↓
ChartPanel.publish() → PanelSnapshot.selectedDrawingId
        ↓
MultiChartStudioClient selectedDrawing + Drawing properties UI
        ↓
Chart.setDrawingStyle(id, patch) → DrawingEngine.setStyle
        ↓
serializeWorkspace / Studio Save
```

No new package exports. Reuses existing Chart drawing contracts already
documented in `docs/api/drawings.md`.

## 8. Files changed

| Path | Role |
|---|---|
| `examples/nextjs-app-router/app/multi-chart-studio-client.tsx` | Selection snapshot, apply helpers, properties UI |
| `examples/nextjs-app-router/app/studio.module.css` | Properties panel + selected-row styles |
| `tests/drawings.test.ts` | Style-patch merge unit coverage |
| `tests/react-browser/studio.spec.ts` | Chromium Studio workflow coverage |
| `docs/api/studio.md` | Drawing property editing section |
| `docs/guides/external-at-physical-device-handoff.md` | Future AT-S05b scenario |
| `docs/ROADMAP.md` | 16.5.0 + 7.5.1 progress |
| `docs/reports/phase-16-5-0-roadmap-product-feature-delivery.md` | This report |

## 9. API compatibility considerations

- No public package export changes.
- No Widget public contract changes.
- Studio remains a private reference host.
- `api:check` expected PASS (no baseline churn intended).

## 10. State / lifecycle handling

- Selection published on `drawingSelection` (create, select, style, remove).
- Style patches merge; unrelated style fields preserved.
- Replay disables property controls (same gate as other structural Studio edits).
- Clear selection calls `selectDrawing(null)` and refreshes the snapshot.
- Workspace round-trip uses existing serialization (no migration).

## 11. Automated test coverage

| Layer | Coverage |
|---|---|
| Unit | `drawing style patches merge color, width, visibility, and lock for property editors` in `tests/drawings.test.ts` |
| Browser | `Studio contextual drawing properties edit color, width, visibility, and lock` in `tests/react-browser/studio.spec.ts` |

## 12. Browser verification

| Command | Environment | Result | Counts | Notes |
|---|---|---|---|---|
| Focused Studio drawing-properties (`--grep contextual drawing properties`) | Chromium + production Next (port 4174) | **PASS** | 1/1 | Primary feature workflow |
| `npm run test:react:browser` | Chromium + production Next | **PASS** | 64/64 | Includes new test (was 63) |
| `npm run test:react:production` | Chromium production subset | **PASS** | 1/1 | Portfolio backtesting only |
| Playwright Firefox drawing grep | Host Firefox Playwright binary | **NOT TESTED** | — | Binary missing in session cache; not a product defect |
| WebKit / Mobile Safari | Docker/CI path | **NOT TESTED** this phase | — | Unchanged from prior gates |
| Physical AT / devices | External | **NOT TESTED** | — | Phase 16.4.12 environment block |

## 13. Performance implications

Negligible: property edits are infrequent user actions; each applies a single
style merge + render. No new subscriptions beyond the existing
`drawingSelection` publish path introduced for the Object Tree selection field.

## 14. Known limitations

- Fill color / text color / z-index not exposed in this slice.
- Formal AT verification of AT-S05b remains **NOT TESTED** (environment gate).
- Firefox/WebKit Studio re-runs were not executable in this session for
  Playwright Firefox; Chromium Studio evidence covers the new workflow.
- Phase 7.5.1 still has open sync E2E, import/storage evidence, and
  multi-chart performance items.

## 15. Deferred roadmap work

- Remaining Phase 7.5.1 verification/evidence items above.
- Formal WCAG 2.2 AA, real AT, physical-device gates (16.4.12).
- Public Widget API (not authorized).

## 16. Git commit references

| Role | SHA |
|---|---|
| Phase start / backup | `3bb120186e735acfa5ee5a99dae59cad6342774c` (`refs/backup/phase-16-5-0-start`) |
| Implementation commit | `d286874485179b09d6f2756f85e6cccf023a3f5b` |
| Documentation commit | local `docs(product): record phase 16.5.0…` tip (see Git Delivery) |

## 17. Final engineering status

| Gate | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm test` | PASS **394/394** (+1 style-patch unit) |
| `npm run api:check` | PASS (no removals/changes) |
| `npm run studio:check` | PASS |
| `npm run package:smoke` | PASS |
| `npm run distribution:check` | PASS |
| `npm run stress:ci` | PASS |
| React Chromium browser | PASS **64/64** |
| Implementation Status | **COMPLETE** (local commits; no push; Widget API not authorized) |
