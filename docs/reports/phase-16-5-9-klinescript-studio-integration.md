# Phase 16.5.9 — KlineScript Studio Integration & Custom Indicator Management

## 1. Executive summary

Phase 16.5.9 connects the existing KlineScript compiler and Worker runtime to a
coherent Studio workflow: My Scripts catalog (distinct from built-ins), editor
Compile / Run-in-Worker, active-panel apply with stale-completion protection,
applied-script identification and removal, dirty-state only on committed
mutations, and workspace Save/Restore of panel-local script indicators under
the established restore contract.

## 2. Starting Git state

- Branch: `main`
- Starting HEAD: `319a6873e42e71cd05ce6cceb1f586fca552390b`
- Remote-tracking: `origin/main` at the same tip (working tree clean)
- Prior phase: 16.5.8 Professional Drawing Toolbar

## 3. Roadmap gap assessment

| Capability | Status before 16.5.9 |
|---|---|
| Compiler / Worker / `addScriptIndicatorAsync` | Implemented |
| Studio editor (templates, diagnostics, local save) | Implemented |
| Active-panel targeting + stale async protection | Missing |
| Dirty-state on apply/remove | Missing |
| My Scripts vs built-in Explorer distinction | Missing / boundary only |
| Explicit Compile + generation gate | Partial (live compile only) |
| Applied script identification in Explorer | Missing |
| Multi-panel E2E script workflow | Missing |

## 4. Existing KlineScript architecture

- Lexer / parser / checker / `compileKlineScript`
- Restricted DSL (no `eval`, no host globals); see `docs/architecture/klinescript-security.md`
- `KlineScriptWorkerRuntime` + Chart `addScriptIndicatorAsync`
- Workspace stores `{ programId, source }` — never executable closures
- Restore recompiles source synchronously via `addScriptIndicator`

## 5. Compiler and Worker integration

Studio helpers in `src/studio/klinescript-studio.ts`:

- `compileStudioKlineScript` / `gateStudioKlineScriptCompile` (generation tokens)
- `resolveStudioScriptApplyTarget` (panel / replay / chart liveness)
- `applyStudioKlineScriptIndicator` (compile gate → Worker apply → post-await panel check; removes accidental stale instance)

## 6. Selected product scope

Vertical slice: templates + local My Scripts → Compile → Worker apply on active
panel → Explorer applied list → remove → dirty Save/Restore. No marketplace,
no new language features, no Public Widget API expansion.

## 7. User-script management

- Browser-local library (`openkline-studio-klinescripts-v1`) for reusable source
- Studio templates from `STUDIO_KLINESCRIPT_TEMPLATES`
- Definition identity ≠ applied instance id (`allocateStudioScriptInstanceId`)

## 8. Catalog and Indicator Explorer integration

- Built-in catalog unchanged (`buildStudioIndicatorCatalog`)
- New **My Scripts** section: search templates/saved scripts, open editor, apply
  first listed script via Worker path
- Applied rows tagged `data-applied-indicator-kind="klinescript"|built-in"`

## 9. Compilation workflow

- Live diagnostics while editing
- Explicit **Compile** button with generation gate
- Failed compile does not mutate the chart

## 10. Diagnostics and error handling

- Compiler codes + L:C spans in the editor region
- Worker / apply failures surface as alerts; stale panel/request results are rejected

## 11. Active-panel ownership

- Apply captures target panel id; completion re-checks `getActivePanelId()`
- Stale completion removes the newly created instance from the original chart

## 12. Apply / update / remove

- Apply: Worker path through helper
- Update: re-edit source and re-apply (new instance); built-in param editor disabled for scripts
- Remove: existing `removeIndicator` + dirty mark

## 13. Script parameters

Inputs compile into indicator parameters; Studio does not invent a separate
script parameter editor in this phase.

## 14. Workspace persistence

Completed script indicators serialize with `script: { programId, source }` and
restore through Chart workspace load (recompile + `addScriptIndicator`).

## 15. Script trust and import behavior

- Source remains data until compiler + supported execution path
- Local Save/Restore re-executes embedded script indicators (established Chart contract)
- Import validates document structure; restored scripts follow the same Chart
  restore path — hosts must treat imported workspace JSON as untrusted input at
  the document boundary (DSL restrictions still apply; not an OS sandbox)

## 16. Dirty-state integration

Dirty on: apply, remove (persisted instance changes).  
Not dirty on: open editor, search, template select, Compile-only, local library save.

## 17. Replay compatibility

KlineScript toolbar/editor disabled while replay is active; apply rejects
`replay-active`.

## 18. Datafeed compatibility

No datafeed changes; scripts consume chart candles through existing indicator lifecycle.

## 19. Worker lifecycle and cleanup

Chart-owned Worker disposal on remove/destroy; AbortController Cancel in editor;
stale apply removes orphaned instances.

## 20. Accessibility

Labeled editor, Compile / Run / Cancel, My Scripts catalog, applied remove
controls; formal AT gates remain OPEN.

## 21. Security review

- No `eval` / unrestricted JS execution of user source
- Worker + compiler validation preserved
- CSP unchanged (`style-src 'self'`)
- Additive Studio exports only; Public Widget API not authorized

## 22. Tests added

- Unit: `tests/studio-klinescript.test.ts` (9)
- E2E: multi-chart Studio KlineScript compile/apply/dirty/restore/remove
- Regression update: `studio.spec.ts` Runtime ready matcher

## 23. Browser E2E results

Primary multi-panel workflow PASS on Chromium via Playwright React suite.

## 24. Regression verification

| Gate | Result |
|---|---|
| TypeScript | PASS |
| Unit tests | PASS **444/444** |
| api:check | PASS (additive) |
| studio:check | PASS |
| package:smoke | PASS |
| distribution:check | PASS |
| stress:ci | PASS |
| test:react:browser | PASS **72/72** |
| test:browser | PASS **54** / **4 skipped** |
| Firefox / WebKit | NOT TESTED |

## 25. Known limitations

- Formal AT / physical devices OPEN
- No dedicated in-place script parameter editor
- Local script library is browser storage, not workspace document content
- Keyboard cannot place chart geometry; pointer still required for drawings (unchanged)
- Imported workspaces that embed scripts re-execute on Chart restore under DSL limits

## 26. Remaining roadmap work

- Deeper KlineScript debug / parameter UX
- Broader cross-browser script E2E
- Managed Firefox/WebKit/Mobile Safari and formal accessibility gates

## 27. Git delivery

Local commits only — implementation + documentation. No push, no tags, no
release, no Cursor co-author trailer.
