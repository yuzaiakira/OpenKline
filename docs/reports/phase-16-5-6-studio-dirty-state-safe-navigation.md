# Phase 16.5.6 — Studio Dirty-State Tracking & Safe Workspace Navigation

## 1. Executive summary

Phase 16.5.6 adds reliable dirty-state tracking and a centralized Save /
Discard / Cancel navigation guard for Studio operations that replace the live
desk (New, Load/selector, Import activation). Users see a textual save status,
and unsaved work cannot be silently discarded.

**PUBLIC WIDGET API: NOT AUTHORIZED**  
**PUBLIC RELEASE: NOT AUTHORIZED**

## 2. Starting repository state

| Item | Value |
|---|---|
| Branch | `main` |
| Starting HEAD | `621f660f7ab90e51c2eecad1e35056de28a6f655` |
| `origin/main` | `34e4aee6b96bad92a762687b4e0a75b21340da07` (local ahead by 5) |
| Working tree | Clean |

## 3. Existing workspace architecture

- Collection: `openkline-studio-workspaces-v1`
- Live desk identity: React `workspaceId` / `workspaceName`
- Serialization: `collectDocument()` → `parseStudioWorkspace`
- Persistence: synchronous `localStorage` via `persist()`
- Library ops from 16.5.5: Rename, Delete (detach-on-delete-current), Duplicate

## 4. Dirty-state model

Helpers in `src/studio/workspace-dirty.ts`:

- `studioWorkspaceContentFingerprint` — sorted-JSON fingerprint of layout,
  charts, sync, watchlists, comparison, portfolio (excludes id/name).
- `resolveStudioWorkspaceSaveStatus` — `saved` | `unsaved-changes` |
  `unsaved-workspace` | `save-failed`.
- Navigation guard skips pristine unsaved desks (new/detached with no edits).

User edits set `userDirtyRef` so post-restore chart hydration drift is not
treated as unsaved content.

## 5. Persisted baseline strategy

Baseline updates only after successful Save / Save As / Duplicate / Import /
Load/restore. Failed persistence sets `save-failed` and does not update the
baseline.

## 6. Unsaved workspace identity

- Library backing id tracked separately from live `workspaceId`.
- Detach-on-delete clears backing and marks an unsaved desk.
- Save without backing creates a new library record (collision-safe id when
  needed) rather than overwriting an unrelated entry.

## 7. User-facing status indicators

`output[aria-label="Workspace save status"]` with
`data-workspace-save-status` and concise text such as
`Name · Unsaved changes`.

## 8–10. Navigation confirmation

Central `requestDestructiveNavigation` opens a three-action dialog:

- **Save and Continue** — save must succeed before proceeding.
- **Discard Changes and Continue** — proceed without writing.
- **Cancel** — keep live desk; clear pending intent.

Pending navigation uses a generation token to ignore stale completions.

## 11. Delete-current detach

Preserved: live charts stay open; status becomes unsaved workspace; subsequent
destructive navigation is protected after edits.

## 12. Import / Export / Save As

- Import activates only after the guard commits; cancel leaves storage unchanged.
- Export does not mark Saved.
- Successful Save As adopts the new baseline/identity.

## 13. Multi-panel preservation

E2E verifies drawing style persistence across Save-and-Continue load and that
Discard leaves the prior saved record untouched.

## 14. Concurrency

Single pending destination; busy flag on Save and Continue; Escape/Cancel
clears intent.

## 15. Accessibility

Navigate dialog uses existing modal focus trap, Cancel-first focus, Escape
cancel, and textual status (not color-only). Formal AT/WCAG remain OPEN.

## 16. Performance

Fingerprints refresh on panel/layout/snapshot boundaries, not pointer moves.
Metadata-only rename stays clean (id/name excluded).

## 17–18. Tests and browser results

- Unit: `tests/studio-workspace-dirty.test.ts`
- E2E: `Studio dirty-state protects Load and New with Save, Discard, and Cancel`
- React Chromium: **69 passed**
- Unit suite: **423 passed**
- Chromium browser: **54 passed / 4 skipped**

## 19. Regression verification

| Gate | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm test` | PASS · 423/423 |
| `npm run test:react:browser` | PASS · 69/69 |
| `npm run test:browser` | PASS · 54 passed / 4 skipped |
| `npm run api:check` | PASS (additive) |
| `npm run studio:check` | PASS |
| `npm run package:smoke` | PASS |
| `npm run distribution:check` | PASS |
| `npm run stress:ci` | PASS |
| Firefox/WebKit compat | NOT TESTED |

## 20. API and security

Additive Studio helpers only; no Widget API publish; CSP unchanged; names remain
text.

## 21. Known limitations

- Native `beforeunload` uses the browser’s generic prompt when dirty.
- Not an autosave or crash-proof journal.
- Firefox/WebKit dirty-navigation E2E not run in this phase.

## 22. Deferred work

- Stronger dirty coverage for every niche Studio control.
- Optional autosave.
- Managed Firefox/WebKit parity for the navigate dialog.

## 23. Git delivery

Local commits only; SHAs in the delivery response.
