# Phase 16.5.2 — Studio Workspace Import, Storage UX & Multi-Panel Restore Reliability

## 1. Executive summary

Phase 16.5.2 delivers a safer Studio workspace Export/Import workflow: validate
untrusted JSON before mutation, confirm a local name, assign a new storage id
(never overwrite by imported id), reject invalid files without changing the
live workspace, and surface multi-panel restore feedback. Panel-local drawings
remain isolated.

**PUBLIC WIDGET API: NOT AUTHORIZED**  
**PUBLIC RELEASE: NOT AUTHORIZED**

## 2. Starting repository state

| Item | Value |
|---|---|
| Branch | `main` |
| Starting HEAD | `de33bb076b6bccd8f5e278e1f5c3998b77e21cb8` |
| `origin/main` | Same tip at phase start |
| Backup | `refs/backup/phase-16-5-2-start` |
| Working tree | Clean |

## 3. Existing workspace architecture

- Collection key: `openkline-studio-workspaces-v1` (`StoredWorkspaces`)
- Legacy single-chart key retained for compatibility
- Validation: `parseStudioWorkspace` / nested `parseWorkspace`
- Export: Blob download of `collectDocument()`
- Prior import: parse → immediate `applyDocument` (no naming dialog, could
  reuse imported ids on later Save)

## 4. Identified product gaps

1. Import applied immediately without name confirmation.
2. Imported ids could collide with stored workspaces on Save.
3. Invalid import errors were generic.
4. Workspace selector showed raw ids for inactive entries.
5. Restore success messaging lacked structured panel metadata for tests/UX.

## 5. Selected workflow improvements

Validated import → accessible naming dialog → new id → append to storage →
restore with panel count feedback. Cancel / validation failure leave state
unchanged.

## 6. Import validation behavior

Helpers in `src/studio/workspace-import.ts`:

- Empty / oversized (`STUDIO_WORKSPACE_IMPORT_MAX_BYTES`)
- Invalid JSON
- Invalid Studio document / version / panels
- Name normalization (trim, collapse spaces, max length 80)

## 7. Workspace naming policy

Names are display labels (not unique keys). Empty/whitespace-only and oversized
names are rejected. Save/Export/Import use `normalizeStudioWorkspaceName`.

## 8. Duplicate-name handling

Duplicate names are allowed; dialog warns when a similar name exists. Ids stay
unique; imports always receive a fresh `imported-{timestamp}` id.

## 9. Storage failure handling

`persist` returns success/failure. Import applies the document only after a
successful storage write. Failed saves report storage unavailable/full without
false success.

## 10. Multi-panel restore behavior

After panels mount, Studio restores each nested chart workspace and sets:

- Status notice with name, panel count, and panel ids
- `data-workspace-restore-name|panels|panel-ids`
- Reminder that drawing selection is transient

## 11. Data preservation guarantees and limitations

**Guarantees**

- Invalid/canceled import does not mutate current or stored workspaces.
- Successful import appends; does not overwrite by imported id.
- Panel-local drawing styles round-trip through export/import/restore.

**Limitations**

- Restore of chart content is sequential after panel mount (not a single
  transactional filesystem commit); failure mid-restore of an individual chart
  remains possible if a chart API throws (existing Chart restore contract).
- Collection parse failures on Save still fall back to an empty in-memory list
  before writing the new document (pre-existing Save As behavior).

## 12. Accessibility behavior

Import uses the existing prompt dialog (labelled value, `aria-invalid` on
validation errors, Escape cancel, focus restore). Status uses `aria-live`.
Export/Import buttons have accessible names; file input is labelled.

## 13. Lifecycle considerations

Import is async file read → sync validate → dialog → persist → apply.
Dialog cancel skips finalize. Stale file input values are cleared after each
selection.

## 14. Files changed

| Path | Role |
|---|---|
| `src/studio/workspace-import.ts` | Import helpers |
| `src/studio/index.ts` / `src/index.ts` | Additive exports |
| `examples/.../multi-chart-studio-client.tsx` | Import UX + catalog + restore attrs |
| `tests/studio-workspace-import.test.ts` | Unit coverage |
| `tests/react-browser/multi-chart-studio.spec.ts` | E2E |
| `package.json` | Register unit test |
| Docs / roadmap / this report | Documentation |

## 15. Unit/integration test coverage

`tests/studio-workspace-import.test.ts` — name normalization, JSON/document
rejection, collision reporting, finalize identity rewrite, error copy.

## 16. Browser E2E results

`Studio import validates names, rejects invalid files, and restores multi-panel drawings safely` — PASS (Chromium production Next).

## 17. Regression verification

Recorded at delivery in the final response matrix.

## 18. API and security review

Additive Studio helper exports only. Imported JSON is parsed/validated; never
evaluated as code. No CSP changes. No Widget API publication.

## 19. Known limitations

- No cloud sync / alternate storage providers.
- Duplicate display names remain allowed by design.
- Firefox/WebKit not required for this feature slice if Chromium Studio E2E
  passes; environments may still be unavailable.

## 20. Deferred roadmap items

- Multi-chart performance/memory evidence (remaining 7.5.1).
- Formal AT / physical / WCAG gates.

## 21. Git delivery

| Role | SHA |
|---|---|
| Phase start / backup | `de33bb076b6bccd8f5e278e1f5c3998b77e21cb8` (`refs/backup/phase-16-5-2-start`) |
| Implementation commit | `364cabd4c6ad55ee362403cc4fb47d559d81a235` |
| Documentation commit | local docs tip after this phase (see Git Delivery) |
