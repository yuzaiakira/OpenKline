# Phase 16.5.5 — Studio Workspace Library Management & Workflow Completion

## 1. Executive summary

Phase 16.5.5 completes the missing Studio workspace library management slice:
safe **Rename** and **Delete** with stable workspace identity, coherent active
workspace detachment (live charts are not silently replaced), collision-safe
**Duplicate** / **Save As** ids, selector disambiguation for duplicate names,
deterministic unit coverage, and Chromium Studio E2E coverage.

**PUBLIC WIDGET API: NOT AUTHORIZED**  
**PUBLIC RELEASE: NOT AUTHORIZED**

## 2. Starting repository state

| Item | Value |
|---|---|
| Branch | `main` |
| Starting HEAD | `978cd9b307ad0fdcd2ca0a73286b4dcb435c3611` |
| `origin/main` | `34e4aee6b96bad92a762687b4e0a75b21340da07` (local ahead by 3) |
| Working tree | Clean at phase start |

## 3. Existing workspace library architecture

- Collection key: `openkline-studio-workspaces-v1` (`version: 1`, `currentId`,
  `workspaces[]`).
- Legacy single-chart key `openkline-studio-workspace-v1` retained.
- Document validation: `parseStudioWorkspace`.
- Display names: `normalizeStudioWorkspaceName` (trim/collapse, max 80).
- Already present: Save, Save As, Duplicate, Delete, Import, Export, Load,
  selector, name field.
- Gaps before this phase: no dedicated Rename dialog; Delete auto-loaded the
  next saved workspace into the live Studio; Duplicate/Save As used weak
  `${id}-…-${Date.now()}` ids.

## 4. Remaining roadmap gaps (pre-implementation)

1. Metadata-only rename with accessible validation.
2. Delete confirmation that targets stable ids and preserves live charts.
3. Collision-safe library ids for Duplicate / Save As / detach.
4. Selector ambiguity when duplicate display names exist.

## 5. Selected feature scope

Primary: **Safe Rename + Delete** with detach-on-delete-current policy.  
Secondary (bounded): harden Duplicate / Save As id allocation and selector
labels. No new storage subsystem.

## 6. User-facing changes

- **Rename** button opens the existing Studio prompt dialog (name field,
  Apply/Cancel, `aria-invalid` + alert on validation failure).
- **Delete** confirmation identifies the workspace by display name and a short
  id suffix; Cancel leaves storage unchanged.
- Workspace selector shows **Unsaved desk** when the live id is detached from
  the library; duplicate names get a short id suffix.
- Notices report rename/delete success and storage failures without false
  success.

## 7. Workspace identity contract

- Ids are stable for rename; only `name` changes.
- Duplicate / Save As / post-delete detach allocate
  `allocateStudioWorkspaceId(existing, prefix, nowMs)` → `{prefix}-{stamp}-{seq}`.
- Display names may collide; operations always key by id.
- Collection `currentId` remains a valid member of `workspaces` when the
  library is non-empty.

## 8. Rename behavior

- Targets the live workspace id present in storage.
- Preserves document body (panels, drawings, indicators, layout).
- Does not remount charts.
- Cancel / validation failure / storage write failure leave prior records
  intact.

## 9. Delete behavior

- Removes exactly one record by id.
- **Active-workspace policy:** if the deleted record was current, live charts
  stay open; Studio assigns a new collision-safe id (unsaved desk) and does
  **not** call `applyDocument` on another saved workspace. Storage
  `currentId` (when remaining records exist) points at a remaining library
  member for the next cold load.
- Empty library removes the collection key and keeps the live desk open.

## 10. Duplicate behavior

Implemented as a bounded hardening of the existing Duplicate action: live
document is copied under a new `copy-{stamp}-{seq}` id after successful
persist. Pure helper `duplicateStudioWorkspaceRecord` is available for
collection-level duplication and covered by unit tests.

## 11. Storage failure handling

`localStorage.setItem` / `removeItem` failures surface an actionable notice and
do not update selector/name state as if the write succeeded. Rename throws
inside the prompt submit path so the dialog stays open with an alert.

## 12. Active-workspace policy

Detach live desk on delete-current. Never silently replace live multi-panel
state with another library entry.

## 13. Multi-panel preservation

Rename leaves nested chart workspaces byte-equivalent aside from `name`.
Delete removes only the targeted record. E2E restores renamed multi-panel
drawings (distinct colors/widths per panel) after rename.

## 14. Accessibility behavior

Reuses Studio dialog focus trap, Escape/Cancel, focus restoration to the
trigger, prompt validation (`aria-invalid`, `role="alert"`), and polite status
notices. Formal WCAG / external AT gates remain OPEN.

## 15. Lifecycle implications

Rename is metadata-only (no chart reconstruct). Delete-current no longer
triggers a restore of another workspace. Dialog state clears on Cancel /
successful Apply.

## 16. Tests added

- Unit: `tests/studio-workspace-library.test.ts` (rename/delete/duplicate/id/
  selector/collection validation).
- Browser E2E: `Studio workspace library rename and delete preserve multi-panel
  content and identity` in `tests/react-browser/multi-chart-studio.spec.ts`
  (save → cancel rename → rename → restore drawings → delete other → reload).

## 17. Browser E2E results

- `npm run test:react:browser` (Chromium): **68 passed / 0 failed**
  including `Studio workspace library rename and delete preserve multi-panel
  content and identity`.
- Core Chromium browser suite `npm run test:browser`: **54 passed / 4 skipped**.
- Firefox / WebKit / mobile compat: **NOT TESTED** in this phase.

## 18. Regression verification

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | PASS |
| Unit tests | `npm test` | PASS · 416/416 |
| React browser | `npm run test:react:browser` | PASS · 68/68 |
| Chromium browser | `npm run test:browser` | PASS · 54 passed / 4 skipped |
| API compatibility | `npm run api:check` | PASS (additive exports only) |
| Studio separation | `npm run studio:check` | PASS |
| Package smoke | `npm run package:smoke` | PASS |
| Distribution | `npm run distribution:check` | PASS |
| Stress CI | `npm run stress:ci` | PASS |
| Firefox/WebKit | `npm run test:browser:compat` | NOT TESTED |

## 19. API and security review

- Additive Studio helper exports only; no public Widget API publication.
- Baseline not rewritten; additive exports are non-breaking per
  `api:check`.
- Workspace names remain text nodes (no HTML injection). CSP unchanged
  (`style-src 'self'` preserved).

## 20. Deferred product work

- Managed Firefox/WebKit Studio library parity runs.
- External NVDA/VoiceOver/TalkBack and physical-device gates.
- Optional bulk library manager UI (out of scope).
- Undo-for-delete (not implemented; deletion is not claimed reversible).

## 21. Git delivery

Local commits only; no push; no history rewrite; no Cursor co-author trailer.
Final SHAs are recorded in the delivery response after commit.
