# Phase 16.5.1 — Multi-Panel Drawing Synchronization & Studio Workflow Integration

## 1. Executive summary

Phase 16.5.1 extends Studio drawing-property editing into a reliable
multi-panel workflow. Architecture inspection confirmed that drawings are
**panel-local** and that `ChartSynchronizationController` does **not** share
drawing objects. This phase therefore delivers active-panel ownership,
stale-edit rejection, Object Tree panel attribution, and deterministic
multi-panel browser evidence — not a new global drawing sync subsystem.

**PUBLIC WIDGET API: NOT AUTHORIZED**  
**PUBLIC RELEASE: NOT AUTHORIZED**

## 2. Starting repository state

| Item | Value |
|---|---|
| Branch | `main` |
| Starting HEAD | `98cc5cd082ec35bb620a66436af557b4189176e4` |
| `origin/main` | Same tip (in sync at phase start) |
| Backup | `refs/backup/phase-16-5-1-start` |
| Working tree | Clean |

## 3. Existing synchronization architecture

| Channel | Scope | Evidence |
|---|---|---|
| Crosshair UTC | Opt-in via `ChartSynchronizationController` / Studio sync prefs | `src/synchronization.ts`, `src/studio/synchronization.ts` |
| Visible time range | Opt-in | Same |
| Symbol / timeframe | Studio host UI preference only | `multi-chart-studio-client.tsx` |
| Drawings / selection / style | **Panel-local only** | Independent `Chart` per panel; no drawing fan-out |

Matching drawing IDs (for example `drawing-1` on two panels) are not shared
identity.

## 4. Selected behavior and rationale

**Selected behavior:** Panel-aware selection + scoped property mutation.

**Rationale:** Roadmap asked for reliable multi-panel drawing-property
workflow. Inventing shared drawing replication would contradict the existing
sync contract and risk silent cross-panel corruption. Correct ownership is the
highest-value feasible increment.

## 5. User-visible changes

- Object Tree shows **Active panel · {panelId}** and
  `data-object-tree-panel-id`.
- Drawing properties expose `data-drawing-owner-panel`.
- Empty-state copy states drawings are panel-local.
- Status notices name both drawing id and panel id.
- Stale property edits after a panel switch are rejected with an explicit
  notice.

## 6. Implementation details

- New helpers: `applyScopedDrawingStyle`, `clearScopedDrawingSelection` in
  `src/studio/drawing-ownership.ts` (exported from Studio / package root as
  additive host helpers).
- Studio Object Tree property controls capture `(panelId, drawingId)` and
  route through those helpers with `requireSelected: true`.
- Replay continues to disable property controls; scoped helpers also refuse
  mutations when Studio reports replay-active for UX messaging.

## 7. Active-panel ownership rules

1. Property UI always reflects `snapshots[activePanelId]`.
2. Style mutations require `targetPanelId === activePanelId`.
3. Mutations resolve the chart via `panelRefs.get(panelId)` only.
4. Missing chart / missing drawing / selection mismatch → no mutation.

## 8. Drawing selection semantics

- Selection remains chart-local runtime state.
- Object Tree Select / chart hit-testing / creation update the active panel
  snapshot through `drawingSelection`.
- Pointer-down on a panel activates that panel before interactions proceed.
- Workspace restore clears selection (`Chart.restoreWorkspace` sets
  `selectedDrawingId = null`); styles persist per panel document.

## 9. Property synchronization behavior

**No cross-panel property synchronization.** Style updates apply only to the
active panel’s chart-local drawing.

## 10. Workspace save/restore behavior

Each panel’s nested `WorkspaceDocument.drawings` stores style/visibility/lock.
Named Studio workspace Save As / Load round-trips panel-local styles. Selection
is not persisted and must be re-established after restore.

## 11. Replay handling

Property controls remain disabled while the active panel is in replay.
Scoped helpers additionally short-circuit with a replay notice from Studio.

## 12. Lifecycle and cleanup

Panel removal deletes `panelRefs` entries. Helpers look up charts by id at
call time, so disposed panels cannot be mutated through stale UI closures
once the active panel changes (stale-panel rejection).

## 13. Tests added

| Layer | Coverage |
|---|---|
| Unit | `tests/studio-drawing-ownership.test.ts` (3 cases: isolation, stale/mismatch, clear selection) |
| Browser | `multi-panel Studio keeps drawing property edits chart-local across panel switches and restore` |
| Browser regression | Updated Phase 16.5.0 Studio properties notice assertion |

## 14. Browser E2E results

| Command | Result | Counts |
|---|---|---|
| Focused multi-panel drawing ownership grep | PASS | 1/1 |
| `npm run test:react:browser` | PASS | **65/65** |
| Firefox / WebKit this session | NOT TESTED | Playwright Firefox binary unavailable previously; not re-run |

## 15. Regression verification

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm test` | PASS **397/397** |
| `npm run api:check` | PASS (additive Studio ownership helpers only) |
| `npm run studio:check` | PASS |
| `npm run package:smoke` | PASS |
| `npm run distribution:check` | PASS |
| `npm run stress:ci` | PASS |

## 16. API and security review

- Additive Studio helper exports only; no Widget public API publication.
- No CSP changes.
- Accessibility: new panel attribution text; AT-S05b remains for external AT.

## 17. Known limitations

- No shared drawing objects across panels (by design).
- Selection not persisted across restore (existing Chart contract).
- Fill/text color and z-index editors remain deferred.
- Firefox/WebKit Studio suites may remain environment-limited.

## 18. Deferred product work

- Workspace import/storage UX polish (remaining 7.5.1).
- Multi-chart performance/memory evidence.
- Formal AT / physical / WCAG gates.

## 19. Git delivery

| Role | SHA |
|---|---|
| Phase start / backup | `98cc5cd082ec35bb620a66436af557b4189176e4` (`refs/backup/phase-16-5-1-start`) |
| Implementation commit | `e674148f5f45c029ea5b53ef48c6b4bf2f4e428f` |
| Documentation commit | local docs tip after this phase (see Git Delivery) |
