# Phase 16.5.7 — Studio Indicator Explorer & Active-Panel Indicator Workflow Integration

## 1. Executive summary

Phase 16.5.7 completes the Studio Indicator Explorer vertical slice: registry-
backed discovery and search, active-panel Add / Apply-params / Remove, applied-
instance listing, dirty-state participation, multi-panel ownership, workspace
Save/Restore round-trip, keyboard accessibility, unit coverage, and a Chromium
Studio E2E workflow. A verified pane-id collision after workspace restore was
fixed so restored charts can allocate new indicator panes.

**PUBLIC WIDGET API: NOT AUTHORIZED**  
**PUBLIC RELEASE: NOT AUTHORIZED**

## 2. Starting repository baseline

| Item | Value |
|---|---|
| Branch | `main` |
| Starting HEAD | `59730bcbe8ed67e5bb30f9ca1d68a823316c2499` |
| `origin/main` | `59730bcbe8ed67e5bb30f9ca1d68a823316c2499` (in sync) |
| Working tree | Clean |

## 3. Roadmap gap assessment

Phase 7.5.1 already listed an Indicator Explorer surface, but Studio only
selected catalog entries and relied on the sidebar Add control. Gaps vs product
acceptance:

- No in-Explorer Add action
- Search matched labels only (not id/description)
- Weak applied-instance management in Explorer
- Remove from sidebar did not call `markLiveDirty`
- No dedicated Explorer E2E covering multi-panel dirty/save/restore
- Post-restore `pane-N` allocation collided when adding a second pane indicator

Selected scope: complete Indicator Explorer (not Drawing Toolbar fallback).

## 4. Existing indicator architecture

- Registry: `createDefaultIndicatorRegistry()` / `IndicatorRegistry`
- Metadata: id, name, description, optional category/overlay, parameters, outputs
- Chart lifecycle: `Chart.addIndicator` / `removeIndicator` / workspace serialize
- Studio seed: each panel starts with SMA (main) + RSI (new pane)
- KlineScript: separate `addScriptIndicatorAsync` path; not listed as built-ins

## 5. Selected feature scope

Helpers in `src/studio/indicator-explorer.ts` plus Studio UI wiring in
`examples/nextjs-app-router/app/multi-chart-studio-client.tsx`. Engine fix in
`src/core/pane-layout.ts` for restore-safe auto pane ids.

## 6. User-facing functionality

1. Open Indicator Explorer (always visible Studio region)
2. Search / filter / favorite catalog entries grounded in registry metadata
3. Inspect name, description, category, overlay vs pane placement
4. Add to the active panel with optional period/constant/multiplier overrides
5. See applied instances for the active panel
6. Select an applied instance and Apply params (remove+recreate same id)
7. Remove an applied instance
8. Save / Load / Cancel-guard with dirty tracking

## 7. Indicator discovery and search

`buildStudioIndicatorCatalog` + `filterStudioIndicatorCatalog`:

- Case-insensitive match across id, name, description, category
- Empty query returns the filtered catalog
- Empty results announce via `role="status"`
- Unsupported ids are skipped (never invented)

## 8. Active-panel ownership

- Add / remove / apply capture `sourcePanelId` and compare to `activePanelIdRef`
- Stale actions notify and no-op
- Applied list binds to `activeSnapshot.indicators` for the active panel only

## 9. Indicator creation and removal

- Creation uses `chart.addIndicator` with `studioIndicatorDefaultPane`
- Duplicate instances allowed (engine supports unique instance ids)
- Removal uses `chart.removeIndicator` + refresh + `markLiveDirty`

## 10. Parameter configuration

- Explorer overrides for period / CCI constant / channel multiplier at Add time
- Apply params merges overrides onto the serialized instance parameters
- Engine validation remains authoritative; failures surface in the status line

## 11. KlineScript integration boundary

KlineScript remains a separate Worker-backed path. Explorer catalog is limited
to the Studio-supported built-in registry ids. Scripts are not auto-promoted
into the catalog.

## 12. Workspace persistence

Indicators serialize through existing `WorkspaceDocument.indicators`. Multi-
panel Save/Restore preserves panel-local instances. Chromium E2E verifies ATR
on chart-1 and MACD on chart-2 after Save → Load cycle.

## 13. Dirty-state integration

- Add / remove / apply params call `markLiveDirty`
- Fingerprint effect already observes `activeSnapshotState.indicators`
- Search / favorites / focus do not mark dirty
- Navigation guard reused from 16.5.6 (Cancel preserves indicator edits)

## 14. Replay and lifecycle

- Explorer Add / Remove / Apply disabled or rejected while replay is active
- Pane layout now advances `nextId` when restoring explicit `pane-N` ids so
  subsequent `pane: "new"` allocations do not collide

## 15. Accessibility

- Search input labeled `Search technical studies`
- Catalog options use `role="option"` with selected/pressed state
- Add/remove controls have accessible names
- Empty search and empty applied list use `role="status"`
- Keyboard focus to search + catalog selection covered in E2E

## 16. Performance considerations

- Catalog built once at module scope from the default registry
- Filtering is pure and cheap for the 16-entry Studio list
- No chart reconstruction when Explorer opens or search changes

## 17. Unit and integration tests

`tests/studio-indicator-explorer.test.ts` (7 tests): catalog, search, empty
results, unsupported ids, pane defaults, fingerprint dirty transitions,
pane-id allocation after explicit restore ids.

## 18. Browser E2E results

`tests/react-browser/multi-chart-studio.spec.ts` —  
`Studio Indicator Explorer adds, scopes, dirty-tracks, and restores panel-local indicators`

| Environment | Result |
|---|---|
| Chromium desktop (system `/usr/bin/chromium`) | PASS (1/1) |
| Firefox | NOT TESTED |
| WebKit | NOT TESTED |

## 19. Regression verification

| Command | Environment | Result |
|---|---|---|
| `npm run typecheck` | local Node | PASS |
| `npm test` | local Node | PASS 430/430 |
| `npm run api:check` | local | PASS (additive Studio exports) |
| `npm run studio:check` | local | PASS |
| `npm run package:smoke` | local | PASS |
| `npm run distribution:check` | local | PASS |
| `npm run stress:ci` | local Chromium | PASS |
| `npm run test:react:browser` | system Chromium | PASS 70/70 |
| `npm run test:browser` | system Chromium | PASS 54 / 4 skipped |
| Firefox / WebKit managed | — | NOT TESTED |

## 20. API and security review

- Additive Studio helper exports only (`buildStudioIndicatorCatalog`, filter,
  categories, default pane)
- No Widget public API publication
- No CSP weakening
- No dynamic evaluation of indicator metadata
- Protected API baseline not rewritten

## 21. Known limitations

- Formal AT / physical devices remain OPEN
- Built-in catalog omits Anchored VWAP (Studio volume-analytics path) and
  user KlineScript programs
- Parameter editing of applied instances uses remove+recreate (no public
  `getIndicator` API)
- Firefox / WebKit managed browsers may be environment-blocked

## 22. Remaining roadmap work

- Professional Drawing Toolbar polish (7.5.1 remainder)
- Broader drawing/device E2E matrix
- KlineScript catalog integration (if product requires)
- Managed Firefox/WebKit/Mobile Safari and formal accessibility gates

## 23. Git delivery

Local commits only — implementation + documentation. No push, no tags, no
release, no Cursor co-author trailer.
