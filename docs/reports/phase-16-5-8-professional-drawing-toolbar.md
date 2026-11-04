# Phase 16.5.8 — Professional Drawing Toolbar & Chart Interaction Workflow Integration

## 1. Executive summary

Phase 16.5.8 completes the Studio Professional Drawing Toolbar vertical slice:
grouped registry-backed tools, Cursor/Cancel modes, real `Chart.startDrawing`
activation, Escape cancellation via the internal cancellation bridge, active-tool
`aria-pressed` state synced from `toolActivation`, dirty-state only on committed
drawing mutations, multi-panel ownership, Object Tree / Drawing Properties
integration, unit coverage, and a Chromium Studio E2E workflow.

**PUBLIC WIDGET API: NOT AUTHORIZED**  
**PUBLIC RELEASE: NOT AUTHORIZED**

## 2. Starting Git state

| Item | Value |
|---|---|
| Branch | `main` |
| Starting HEAD | `abb48b3ba5ab018a027f307ff043110cff2e04ff` |
| `origin/main` | same tip (in sync) |
| Working tree | Clean |

## 3. Existing drawing architecture

- Engine: `DrawingEngine` + `builtInDrawingTools` (14 tools)
- Chart: `startDrawing`, private `cancelDrawing` via
  `registerInteractiveDrawingCancellation` / `cancelInteractiveDrawing`
- Events: `toolActivation`, `drawingSelection`
- Studio previously: flat button list calling `startDrawing` and falsely
  `markLiveDirty()` on tool select; no Cursor/Cancel/Escape/active-tool sync

## 4. Roadmap gap assessment

| Capability | Status before 16.5.8 |
|---|---|
| Tool buttons calling engine | Partial |
| Active-tool visual state | Missing |
| Cursor / cancel mode | Missing |
| Escape cancel | Missing |
| False dirty on tool select | Defect |
| Dirty on committed drawing | Partial (fingerprint only) |
| Grouped toolbar | Missing |
| Multi-panel E2E for toolbar lifecycle | Missing |

## 5. Supported drawing tools

All Studio tools are grounded in `builtInDrawingTools`: Trend, Ray, Extended,
Horizontal, Vertical, Channel, Rectangle, Fib retrace/extend, Price/Date range,
Long/Short R:R, Text.

## 6. Selected implementation scope

Studio helpers + toolbar UI + ChartPanel `toolActivation` sync + cancel bridge
export. No new drawing geometry. No Public Widget API.

## 7. Toolbar design and integration

`src/studio/drawing-toolbar.ts` builds catalog metadata (label, group,
min/max points, description). Studio renders grouped tool regions plus Cursor
and Cancel, Undo/Redo, and KlineScript.

## 8. Tool activation lifecycle

1. Resolve active panel and chart
2. Reject stale panel / replay / unknown tool
3. `chart.startDrawing(...)` with Studio style/snap defaults
4. `toolActivation` sets `activeDrawingTool` in panel snapshot
5. Toolbar `aria-pressed` reflects engine state

## 9. Drawing completion and cancellation

- Completion: engine commits drawing → `toolActivation` inactive →
  `onDrawingCommitted` → `markLiveDirty`
- Cancel: Cancel button, Cursor mode, or Escape →
  `cancelStudioInteractiveDrawing(chart)` → no persisted drawing → no dirty
- Incomplete cancel does not create drawings

## 10. Coordinate and interaction handling

Unchanged Chart pointer → time/price mapping and visible-OHLC snap.

## 11. Active-panel ownership

Activation/cancel capture `sourcePanelId` vs `activePanelIdRef`. Restore
cancels pending tools and resets local tool state.

## 12. Object Tree integration

Completed drawings appear via existing snapshot/`drawingSelection` publish.

## 13. Drawing Properties integration

Existing scoped style helpers unchanged; E2E edits color after completion.

## 14. Dirty-state behavior

| Action | Dirty? |
|---|---|
| Select tool | No |
| Cancel / Escape | No |
| Complete drawing | Yes |
| Style / undo / redo | Yes |

## 15. Workspace persistence

Panel-local drawings Save/Restore verified in Chromium E2E.

## 16. Replay restrictions

Toolbar drawing controls disabled while replay is active.

## 17. Keyboard and accessibility

Cursor/Trend focusable; Escape cancels; `aria-pressed` for active tool and
Cursor mode; tool `title` tooltips for descriptions.

## 18. Touch/pointer limitations

Existing Chart pointer model; physical device AT remains OPEN.

## 19. Lifecycle and cleanup

Workspace restore cancels pending interactive drawing and resets tool refs.

## 20. Performance considerations

No chart reconstruction on tool select; catalog built once at module scope.

## 21. Unit and integration tests

`tests/studio-drawing-toolbar.test.ts` (5): catalog, filter, groups, cancel
bridge, fingerprint dirty transitions.

## 22. Browser E2E evidence

`Studio Professional Drawing Toolbar creates, cancels, dirty-tracks, and restores panel-local drawings` — Chromium PASS.

## 23. Regression verification

| Command | Environment | Result |
|---|---|---|
| `npm run typecheck` | local Node | PASS |
| `npm test` | local Node | PASS 435/435 |
| `npm run api:check` | local | PASS (additive Studio exports) |
| `npm run studio:check` | local | PASS |
| `npm run package:smoke` | local | PASS |
| `npm run distribution:check` | local | PASS |
| `npm run stress:ci` | local Chromium | PASS |
| `npm run test:react:browser` | system Chromium | PASS 71/71 |
| `npm run test:browser` | system Chromium | PASS 54 / 4 skipped |
| Firefox / WebKit managed | — | NOT TESTED |

## 24. API and security review

Additive Studio exports only (`buildStudioDrawingToolbarCatalog`,
`cancelStudioInteractiveDrawing`, filter/groups/label helpers). Internal
cancellation bridge remains non-public Chart API. CSP unchanged.

## 25. Known limitations

- Formal AT / physical devices OPEN
- Firefox / WebKit NOT TESTED in this phase
- Keyboard can arm/cancel tools; chart point placement still uses pointer
- No duplicate-draw “remain armed” mode (returns to Cursor after completion)

## 26. Remaining roadmap work

- Broader drawing/device E2E matrix
- KlineScript workflow integration
- Managed Firefox/WebKit/Mobile Safari and formal accessibility gates

## 27. Git delivery

Local commits only — implementation + documentation. No push, no tags, no
release, no Cursor co-author trailer.
